import { getSportEvents } from "./sports";
import { getFplData } from "./fpl";
import { getReminders } from "./reminders";
import { getPrivatEvents } from "./privatCalendar";

/**
 * Utvidet kontekst for Privat-fanen: sport-fixtures, FPL og de ekte,
 * skyllagrede påminnelsene/kalenderhendelsene. Hver kilde hentes uavhengig
 * (Promise.allSettled) slik at én treg/feilende kilde ikke velter hele
 * chat-svaret.
 *
 * Egen fil, adskilt fra lib/widgets.ts: denne importerer til slutt inn
 * ioredis (via lib/reminders.ts/lib/privatCalendar.ts → lib/kv.ts), som
 * bruker Node-innebygde moduler (dns/net) og derfor IKKE kan havne i et
 * modulgraf som en klientkomponent importerer fra (dashboard.tsx importerer
 * lib/widgets.ts for formatKr/CONTRACTS osv. — hadde buildPrivatContext
 * ligget der, ville ioredis blitt dratt inn i nettleser-bunten og feilet
 * bygget). app/api/chat/route.ts (en server-only route) er eneste bruker.
 */
export async function buildPrivatContext(): Promise<string> {
  const [sportsResult, fplResult, remindersResult, eventsResult] = await Promise.allSettled([
    getSportEvents(),
    getFplData(),
    getReminders(),
    getPrivatEvents(),
  ]);

  const lines: string[] = [];

  lines.push("\nSPORT (kommende, hentet live):");
  if (sportsResult.status === "fulfilled" && sportsResult.value.length > 0) {
    for (const e of sportsResult.value.slice(0, 15)) {
      lines.push(`- ${e.date}${e.time ? ` ${e.time}` : ""} ${e.name} (${e.competition})${e.venue ? ` — ${e.venue}` : ""}`);
    }
  } else {
    lines.push("- Ingen sportsdata tilgjengelig akkurat nå.");
  }

  lines.push("\nFANTASY PREMIER LEAGUE:");
  if (fplResult.status === "fulfilled" && fplResult.value.active && fplResult.value.teams?.length) {
    const fpl = fplResult.value;
    lines.push(`Neste deadline: ${fpl.gw?.deadline ?? "ukjent"} (${fpl.gw?.name ?? ""})`);
    for (const t of fpl.teams ?? []) {
      lines.push(
        `- ${t.teamName}: ${t.totalPoints ?? "—"} poeng totalt, verdensrangering ${t.overallRank ?? "—"}, GW${t.currentGw ?? "—"}: ${t.currentGwPoints ?? "—"} poeng`,
      );
    }
  } else {
    lines.push("- Ingen FPL-data tilgjengelig akkurat nå.");
  }

  lines.push("\nPÅMINNELSER (ekte, kan endres av deg eller av deg via chat):");
  if (remindersResult.status === "fulfilled" && remindersResult.value.length > 0) {
    for (const r of remindersResult.value) {
      lines.push(
        `- [${r.done ? "Ferdig" : "Ikke ferdig"}] ${r.text}${r.dueDate ? ` (frist ${r.dueDate})` : ""}${r.recurrence !== "none" ? ` — gjentar ${r.recurrence}` : ""}`,
      );
    }
  } else {
    lines.push("- Ingen påminnelser lagt inn ennå.");
  }

  lines.push("\nPRIVAT KALENDER (ekte, redigerbar):");
  if (eventsResult.status === "fulfilled" && eventsResult.value.length > 0) {
    for (const e of eventsResult.value) {
      lines.push(
        `- ${e.date}${e.startTime ? ` ${e.startTime}` : ""}${e.endTime ? `–${e.endTime}` : ""} ${e.title}${e.note ? ` — ${e.note}` : ""}`,
      );
    }
  } else {
    lines.push("- Ingen hendelser lagt inn ennå.");
  }

  return lines.join("\n");
}
