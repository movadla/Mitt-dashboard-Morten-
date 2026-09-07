// Én kilde til sannhet for hvilken aksentfarge hver Privat-seksjon har.
//
// NAV_META (PrivatPanel.tsx) hevdet tidligere i sin egen kommentar å bruke "samme verdier som
// hver seksjon selv sender til CardHeader" - men de to listene var i praksis to uavhengige
// kopier, og tre seksjoner hadde driftet fra hverandre (2026-09-07): Prosjekter (nav indigo /
// kort oransje), Dagbok (ikon violett / topplinje oransje) og Nyheter (nav ink-1 / kort oransje).
// Sport og VM brukte i tillegg `text-accent` - altså JOBB-fanens blå - midt i Privat-fanen, stikk
// i strid med DESIGN.md sin fane-fargekode-ledetråd.
//
// Ikonfargen leses nå herfra både av navigasjonen og av seksjonene selv, så de KAN ikke drifte.
// Kortenes topplinje (`border-t-<farge>/60`) må fortsatt være en literal klasse i hver seksjon -
// Tailwind kan ikke bygge klassenavn fra en variabel i runtime - men den skal alltid matche
// fargen her, og kommentaren i hver seksjon peker hit.
export const SECTION_ACCENT: Record<string, string> = {
  today: "text-accent-privat",
  reminders: "text-accent-privat",
  calendar: "text-source-teams",
  events: "text-accent-privat",
  notes: "text-amber-400",
  projects: "text-indigo-400",
  diary: "text-violet-400",
  finance: "text-source-outlook",
  // Sport/VM: egne farger i stedet for Jobb-fanens `accent` (blå). Sky for sport, gult for VM -
  // sistnevnte samsvarer også med --color-sport-worldcup i globals.css.
  sport: "text-sky-400",
  worldcup: "text-yellow-400",
  trening: "text-emerald-400",
  alfred: "text-status-action",
  shopping: "text-cyan-400",
  // text-ink-1, ikke text-white: i dagmodus er kortene hvite, og et hvitt ikon på hvitt kort er
  // usynlig. ink-1 følger temaet.
  news: "text-ink-1",
  fpl: "text-lime-400",
};
