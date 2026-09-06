import "server-only";
import { getReminders } from "./reminders";
import { getPrivatEvents } from "./privatCalendar";
import { getJobbReminders } from "./jobbReminders";
import { localDateString } from "./payday";

export interface MorningBrief {
  title: string;
  body: string;
  // Tomt varsel skal ikke sendes — en push som sier "ingenting i dag" hver
  // morgen lærer deg raskt å ignorere alle sammen.
  harInnhold: boolean;
}

const WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Dagens ene linje, satt sammen av det som faktisk ligger i Redis.
 *
 *  VIKTIG avgrensning: Jobb-tallene (Kundefordringer, Kontrakter, Utløp,
 *  Inntektsprognose) kommer fra `.local.ts`-filer som med vilje ALDRI følger
 *  med i et produksjonsbygg — se ANONYMISERING.md. Cron-jobben kjører på
 *  Vercel og har derfor ikke tilgang til dem. Briefen dekker det som ligger i
 *  Redis og er ekte begge steder: påminnelser og kalender, privat og jobb. */
export async function buildMorningBrief(): Promise<MorningBrief> {
  const today = localDateString();
  const [reminders, calendar, jobbReminders] = await Promise.all([
    getReminders(),
    getPrivatEvents(),
    getJobbReminders(),
  ]);

  const privatDue = reminders.filter((r) => !r.done && (!r.dueDate || r.dueDate <= today));
  const privatOverdue = privatDue.filter((r) => r.dueDate && r.dueDate < today);
  const jobbDue = jobbReminders.filter((r) => !r.done && (!r.dueDate || r.dueDate <= today));
  const jobbOverdue = jobbDue.filter((r) => r.dueDate && r.dueDate < today);
  const todaysEvents = calendar
    .filter((e) => e.date === today)
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));

  const parts: string[] = [];

  if (todaysEvents.length > 0) {
    const first = todaysEvents[0];
    const when = first.startTime ? `${first.startTime} ` : "";
    parts.push(
      todaysEvents.length === 1
        ? `${when}${first.title}`
        : `${when}${first.title} — og ${todaysEvents.length - 1} til`,
    );
  }

  const totalDue = privatDue.length + jobbDue.length;
  if (totalDue > 0) {
    const totalOverdue = privatOverdue.length + jobbOverdue.length;
    parts.push(
      totalOverdue > 0
        ? `${totalDue} påminnelser, ${totalOverdue} forfalt`
        : `${totalDue} ${totalDue === 1 ? "påminnelse" : "påminnelser"}`,
    );
  }

  return {
    title: `God morgen — ${weekdayLabel(today)}`,
    body: parts.length > 0 ? parts.join(" · ") : "Ingenting står oppført i dag.",
    harInnhold: parts.length > 0,
  };
}
