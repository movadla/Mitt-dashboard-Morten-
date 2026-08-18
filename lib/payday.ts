// Rene funksjoner uten Redis-avhengighet — trygge å importere direkte i
// klientkomponenter (EventsSection.tsx, TodaySummary.tsx). lib/events.ts
// importerer ./kv (ioredis, "server-only") og ville feilet nettleser-bygget
// hvis disse lå der i stedet, se samme resonnement som lib/privatContext.ts.

// `date.toISOString().slice(0, 10)` gir UTC-datoen, som er feil rett etter
// midnatt norsk tid (UTC+1/+2 — kl. 00:00-02:00 lokalt er UTC-datoen fortsatt
// "i går"). Tidssonen er hardkodet til Europe/Oslo (ikke runtime sin lokale sone)
// siden dette er en enbrukerapp og Vercel sine servere kjører i UTC uansett.
export function toOsloDateString(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
}

export function localDateString(): string {
  return toOsloDateString(new Date());
}

// "17.08.2026" — delt av alle Hendelser-/Kalender-visningene (Privat +
// Jobb), som tidligere hver hadde sin egen identiske kopi.
export function formatDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// Legger til `n` dager til en "YYYY-MM-DD"-dato — brukes for å bla fremover i
// "I dag"-boksen uten tidssone-fallgruver (ren kalenderdag-aritmetikk i UTC).
export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export type EventCategory = "bursdag" | "permisjon" | "bolig" | "annet";
export type LifeEventRecurrence = "none" | "weekly" | "monthly" | "yearly";

export interface LifeEvent {
  id: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  category: EventCategory;
  recurrence: LifeEventRecurrence;
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const fromMs = Date.UTC(fy, fm - 1, fd);
  const toMs = Date.UTC(ty, tm - 1, td);
  return Math.round((toMs - fromMs) / 86400000);
}

function addWeeks(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n * 7);
  return dt.toISOString().slice(0, 10);
}

// Klemmer dagen til siste dag i målmåneden i stedet for å rulle over
// (samme prinsipp som advanceDate i lib/reminders.ts).
function addMonthsClamped(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const totalMonthIdx0 = m - 1 + n;
  const targetYear = y + Math.floor(totalMonthIdx0 / 12);
  const targetMonthIdx0 = ((totalMonthIdx0 % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIdx0 + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${targetYear}-${String(targetMonthIdx0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addYears(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y + n}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Neste forekomst av hendelsen sett fra `todayIso`. For "none" er det bare
// hendelsens egen dato; for gjentakende hendelser regnes fremover fra
// opprinnelig dato i den valgte enheten til resultatet er >= todayIso.
export function nextOccurrence(event: Pick<LifeEvent, "date" | "recurrence">, todayIso: string): string {
  const { date, recurrence } = event;
  if (recurrence === "none" || date >= todayIso) return date;

  if (recurrence === "weekly") {
    const steps = Math.ceil(daysBetween(date, todayIso) / 7);
    return addWeeks(date, steps);
  }
  if (recurrence === "monthly") {
    let candidate = date;
    for (let n = 1; candidate < todayIso && n < 1200; n++) candidate = addMonthsClamped(date, n);
    return candidate;
  }
  // yearly
  let candidate = date;
  for (let n = 1; candidate < todayIso && n < 200; n++) candidate = addYears(date, n);
  return candidate;
}

// Skjer hendelsen nøyaktig på `dateIso`? (i motsetning til nextOccurrence, som
// finner NESTE forekomst sett fra en referansedato — denne sjekker et eksakt
// treff, nødvendig når man blar fremover i "I dag"-boksen dag for dag.)
export function occursOnDate(event: Pick<LifeEvent, "date" | "recurrence">, dateIso: string): boolean {
  const { date, recurrence } = event;
  if (recurrence === "none") return date === dateIso;
  if (dateIso < date) return false; // gjentakelsen starter først ved opprinnelig dato

  if (recurrence === "yearly") {
    const [, em, ed] = date.split("-");
    const [, dm, dd] = dateIso.split("-");
    return em === dm && ed === dd;
  }
  if (recurrence === "weekly") {
    return daysBetween(date, dateIso) % 7 === 0;
  }
  // monthly — treffer samme kalenderdag hver måned, klemt til månedens siste
  // dag for korte måneder (samme som addMonthsClamped over).
  const [, , dStr] = date.split("-");
  const [dy, dm] = dateIso.split("-").map(Number);
  const lastDay = new Date(Date.UTC(dy, dm, 0)).getUTCDate();
  const expectedDay = Math.min(Number(dStr), lastDay);
  const actualDay = Number(dateIso.split("-")[2]);
  return actualDay === expectedDay;
}

// Lønningsdag: 20. hver måned, desember den 15. — flyttet til fredagen før
// hvis datoen faller på en lørdag eller søndag.
function paydayForMonth(year: number, monthIndex0: number): string {
  const day = monthIndex0 === 11 ? 15 : 20;
  const date = new Date(Date.UTC(year, monthIndex0, day));
  const dow = date.getUTCDay(); // 0 = søndag, 6 = lørdag
  if (dow === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (dow === 0) date.setUTCDate(date.getUTCDate() - 2);
  return date.toISOString().slice(0, 10);
}

export function isPaydayToday(todayIso: string): boolean {
  const [y, m] = todayIso.split("-").map(Number);
  return paydayForMonth(y, m - 1) === todayIso;
}

export function nextPaydayFrom(todayIso: string): string {
  const [y, m] = todayIso.split("-").map(Number);
  const thisMonth = paydayForMonth(y, m - 1);
  if (thisMonth >= todayIso) return thisMonth;
  const nextMonthIndex0 = m % 12;
  const nextYear = m === 12 ? y + 1 : y;
  return paydayForMonth(nextYear, nextMonthIndex0);
}

// "Mandag 17.08" — ukedag + dato uten noe "i dag"/"i morgen"-særtilfelle.
// Brukt alene der man alltid vil se ukedagen (f.eks. en fast dagsoverskrift),
// og som fallback-gren i relativeDayLabel under.
export function weekdayDateLabel(dateIso: string): string {
  const d = new Date(dateIso + "T12:00:00");
  const weekday = d.toLocaleDateString("nb-NO", { weekday: "long" });
  const [, m, day] = dateIso.split("-");
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day}.${m}`;
}

// Dag-gruppeoverskrift for lister over kommende hendelser/møter: "I dag" og
// "I morgen" som særtilfeller, ellers ukedag+dato — samme prinsipp som
// dayHeaderLabel i TodaySummary.tsx brukte for selve "I dag"-toppteksten, men
// her ment for å gruppere en LISTE av fremtidige rader under egne overskrifter.
export function relativeDayLabel(dateIso: string, todayIso: string): string {
  if (dateIso === todayIso) return "I dag";
  if (dateIso === addDaysIso(todayIso, 1)) return "I morgen";
  return weekdayDateLabel(dateIso);
}
