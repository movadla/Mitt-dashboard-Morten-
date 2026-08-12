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

// Legger til `n` dager til en "YYYY-MM-DD"-dato — brukes for å bla fremover i
// "I dag"-boksen uten tidssone-fallgruver (ren kalenderdag-aritmetikk i UTC).
export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export type EventCategory = "bursdag" | "permisjon" | "bolig" | "annet";

export interface LifeEvent {
  id: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  category: EventCategory;
  yearly: boolean;
  note?: string;
}

// Neste forekomst av hendelsen sett fra `todayIso`: for årlige hendelser er det
// dag/måned i inneværende år (eller neste år, hvis den allerede er passert).
export function nextOccurrence(event: Pick<LifeEvent, "date" | "yearly">, todayIso: string): string {
  if (!event.yearly) return event.date;
  const [, m, d] = event.date.split("-");
  const [ty] = todayIso.split("-");
  const thisYear = `${ty}-${m}-${d}`;
  if (thisYear >= todayIso) return thisYear;
  return `${Number(ty) + 1}-${m}-${d}`;
}

// Skjer hendelsen nøyaktig på `dateIso`? (i motsetning til nextOccurrence, som
// finner NESTE forekomst sett fra en referansedato — denne sjekker et eksakt
// dag/måned-treff, nødvendig når man blar fremover i "I dag"-boksen dag for dag.)
export function occursOnDate(event: Pick<LifeEvent, "date" | "yearly">, dateIso: string): boolean {
  if (!event.yearly) return event.date === dateIso;
  const [, em, ed] = event.date.split("-");
  const [, dm, dd] = dateIso.split("-");
  return em === dm && ed === dd;
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
