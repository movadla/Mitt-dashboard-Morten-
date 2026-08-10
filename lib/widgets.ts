import { getSportEvents } from "./sports";
import { getFplData } from "./fpl";
import { getReminders } from "./reminders";
import { getPrivatEvents } from "./privatCalendar";

export type WidgetSpec = { title: string; value: string; hint: string; detail: string };

export function formatKr(n: number, signed = false): string {
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("nb-NO")} kr`;
}

export function formatDateDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * EKTE DATA fra Outlook-kalenderen din (hentet 2026-08-10 via mcp__claude_ai_Microsoft_365__outlook_calendar_search,
 * vindu 2026-08-10 → 2026-09-10). Inkluderer både faktiske møter med andre deltakere og dine egne
 * heldags-blokker ("Permisjon", kun deg selv som deltaker/organizer). "Beskrivelse" = din rolle
 * (Innkaller/Deltaker for møter, "Fravær" for permisjonsdager). Sortert kronologisk, 6 nærmeste vises
 * som standard i UI (resten bak "Mer").
 */
const TEAMS_INFO = "Microsoft Teams-møte. Møte-ID: 322 367 541 208 27, passord: ca2Fq7GP.";

export const CALENDAR_EVENTS: { id: string; dato: string; start: string; slutt: string; mote: string; beskrivelse: string; sted: string; merknad?: string }[] = [
  { id: "2026-08-11T06:00", dato: "2026-08-11", start: "06:00", slutt: "15:00", mote: "Permisjon", beskrivelse: "Fravær", sted: "—" },
  { id: "2026-08-12T07:00", dato: "2026-08-12", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-08-12T10:30", dato: "2026-08-12", start: "10:30", slutt: "11:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-08-13T06:00", dato: "2026-08-13", start: "06:00", slutt: "15:00", mote: "Permisjon", beskrivelse: "Fravær", sted: "—" },
  { id: "2026-08-18T06:00", dato: "2026-08-18", start: "06:00", slutt: "15:00", mote: "Permisjon", beskrivelse: "Fravær", sted: "—" },
  { id: "2026-08-18T10:30", dato: "2026-08-18", start: "10:30", slutt: "11:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-08-19T06:00", dato: "2026-08-19", start: "06:00", slutt: "15:00", mote: "Permisjon", beskrivelse: "Fravær", sted: "—" },
  { id: "2026-08-19T07:00", dato: "2026-08-19", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-08-19T10:00", dato: "2026-08-19", start: "10:00", slutt: "12:00", mote: "Kommersiell avdeling - avd. møte", beskrivelse: "Deltaker", sted: "Lv.4C Klin Kokos (styrerommet)" },
  { id: "2026-08-20T06:00", dato: "2026-08-20", start: "06:00", slutt: "15:00", mote: "Permisjon", beskrivelse: "Fravær", sted: "—" },
  { id: "2026-08-21T06:00", dato: "2026-08-21", start: "06:00", slutt: "15:00", mote: "Permisjon", beskrivelse: "Fravær", sted: "—" },
  { id: "2026-08-25T06:00", dato: "2026-08-25", start: "06:00", slutt: "06:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen). Vel møtt!" },
  { id: "2026-08-25T10:00", dato: "2026-08-25", start: "10:00", slutt: "11:00", mote: "Månedlig status utleie", beskrivelse: "Innkaller", sted: "—", merknad: "Setter opp et fast månedlig møte i kalenderen. Ser om det trengs i lengden." },
  { id: "2026-08-25T10:30", dato: "2026-08-25", start: "10:30", slutt: "11:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-08-26T07:00", dato: "2026-08-26", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-08-26T11:00", dato: "2026-08-26", start: "11:00", slutt: "11:30", mote: "Knut 60år", beskrivelse: "Deltaker", sted: "Kjøkken/sosial sone", merknad: "I løpet av sommerferien har verdens beste Knut endelig blitt voksen! Vi feirer han med en liten kakefest for anledningen, vel møtt!" },
  { id: "2026-09-01T06:00", dato: "2026-09-01", start: "06:00", slutt: "06:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen). Vel møtt!" },
  { id: "2026-09-01T10:30", dato: "2026-09-01", start: "10:30", slutt: "11:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-09-02T07:00", dato: "2026-09-02", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-09-08T06:00", dato: "2026-09-08", start: "06:00", slutt: "06:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen). Vel møtt!" },
  { id: "2026-09-08T10:30", dato: "2026-09-08", start: "10:30", slutt: "11:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-09-09T07:00", dato: "2026-09-09", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
];

/**
 * EKTE DATA fra Fazile (hentet 2026-08-10 via fazile_graphql_query — contracts sortert på created_at,
 * beriket med contract_customers/customer for leietaker og contract_lines/contract_areas for beløp+kvm).
 * De 5 nyeste signerte kontraktslinjene med reell verdi (0-kr administrative linjer som
 * energijustering/kantinebidrag er utelatt). "Signeringsdato" = contract.created_at (nærmeste reelle
 * proxy — Fazile har ikke et eget "signert dato"-felt separat fra når kontrakten ble registrert).
 */
const SF_CONTRACT_BASE = "https://mustadeiendom.lightning.force.com/lightning/r/Contract/";

/**
 * Salesforce-kontraktlenker (hentet 2026-08-10 via salesforce_soql_query mot Contract-objektet,
 * matchet på Account.Name + StartDate). Kristin Mustad Bevreng og Norsk Elkraft/Vedeld matchet
 * eksakt på startdato. Systemkjøp AS har kun én, mye eldre kontrakt i Salesforce (2019) — usikker
 * match, lenket likevel siden det er eneste treff. Grønset Kunst og Illustrasjon finnes ikke i
 * Salesforce ennå (kontrakten er sannsynligvis ikke registrert der).
 */
export const CONTRACTS = [
  { kunde: "Kristin Mustad Bevreng", signeringsdato: "2026-08-08", startdato: "2026-09-01", arsbelop: 186800, bygg: "Lilleakerveien 31", kvm: 135.6, leietype: "Lagerleie", sfUrl: SF_CONTRACT_BASE + "800Oj00000TMCy8IAH/view" },
  { kunde: "Vedeld AS", signeringsdato: "2026-08-07", startdato: "2026-05-18", arsbelop: 67400, bygg: "Strandveien 4-8", kvm: 63, leietype: "Lagerleie", sfUrl: SF_CONTRACT_BASE + "800Oj00000pNj5cIAC/view" },
  { kunde: "Grønset Kunst og Illustrasjon", signeringsdato: "2026-08-03", startdato: "2026-08-01", arsbelop: 34800, bygg: "Lilleakerveien 2E", kvm: 12.9, leietype: "Husleie", sfUrl: null },
  { kunde: "Norsk Elkraft Kontroll AS", signeringsdato: "2026-07-24", startdato: "2026-07-15", arsbelop: 60000, bygg: "Lilleakerveien 4CDEF", kvm: 0, leietype: "Parkering", sfUrl: SF_CONTRACT_BASE + "800Oj00000rktvrIAA/view" },
  { kunde: "Systemkjøp AS", signeringsdato: "2026-07-09", startdato: "2026-07-01", arsbelop: 33127, bygg: "Lilleakerveien 10", kvm: 11.3, leietype: "Garasje/El-bil", sfUrl: SF_CONTRACT_BASE + "8001t000000Qb7AAAS/view" },
];

export type GuaranteeStatus = "Mangler" | "Forespurt" | "Kommer";

/**
 * EKTE DATA fra Asana (hentet 2026-08-10). Hver rad er en åpen (ikke fullført) subtask
 * "Koordinere bankgaranti eller depositum" under en pågående Onboarding-oppgave — dvs.
 * garantien er reelt ikke i orden for disse innflyttingene. Leietaker/bygg/dato er lest
 * fra Asana-prosjektnavnet (mønster: "<sted>_Onboarding_<type>_<bygg>_<leietaker>_<dato>").
 * Status er satt til "Mangler" for alle siden Asana kun gir meg åpen/lukket, ikke finere
 * delstatus — bekreftet uavhengig av Fazile (vw_contract_details.Depositumstatus finnes òg,
 * men viste bare "MISSING" på et par prøve-kontrakter jeg testet, ikke disse 5 spesifikt).
 * Beløp er IKKE i Asana — vises som "—" til det ev. hentes fra kontrakten i Fazile per rad.
 */
export const GUARANTEE_TOTAL = 5;
export const GUARANTEES: { status: GuaranteeStatus; leietaker: string; belop: number | null; frist: string }[] = [
  { status: "Mangler", leietaker: "First Rent A Car Norway AS (Lv2C)", belop: null, frist: "2026-08-01" },
  { status: "Mangler", leietaker: "Fåbro Gård (Lv19)", belop: null, frist: "2026-08-01" },
  { status: "Mangler", leietaker: "S Group AS (Lv4A)", belop: null, frist: "2026-08-15" },
  { status: "Mangler", leietaker: "Komplett ASA (Lv2B)", belop: null, frist: "2026-09-01" },
  { status: "Mangler", leietaker: "Origon AS (Vollsveien 17)", belop: null, frist: "2026-09-04" },
];

/**
 * EKTE DATA fra Visma Business NXT (hentet 2026-08-10, selskap "Mustad Eiendom AS").
 * customerCurrentBalance for topp 5 utestående, brutt ned per faktura via openCustomerEntry
 * (utestaende60 = åpne poster med forfallsdato ≤ 2026-06-11, dvs. 60+ dager forfalt pr. i dag)
 * og dagerSidenBetaling = i dag minus siste faktiske innbetaling (MAX(paidLast) i customerTransaction).
 */
export const RECEIVABLES = [
  { leietaker: "Lysaker Klatresenter Eiendom AS", utestaende: 1619508, utestaende60: 1619508, dagerSidenBetaling: 40 },
  { leietaker: "DELL AS", utestaende: 1585743, utestaende60: 0, dagerSidenBetaling: 4 },
  { leietaker: "Møllefossen Cafe AS", utestaende: 964501, utestaende60: 634104, dagerSidenBetaling: 7 },
  { leietaker: "ONEPARK AS", utestaende: 916488, utestaende60: 0, dagerSidenBetaling: 31 },
  { leietaker: "CMA CGM Scandinavia AS", utestaende: 640746, utestaende60: 0, dagerSidenBetaling: 109 },
];

/**
 * IKKE ekte ennå — Visma NXT sine regnskapsperioder er månedlige, ikke ukentlige, så en ren
 * "12 uker"-historikk finnes ikke direkte. Beholdt som illustrasjon til vi bestemmer om grafen
 * heller skal vise månedlig utvikling (som faktisk finnes i NXT).
 */
export const RECEIVABLES_TREND = [
  1950000, 2010000, 2080000, 1990000, 2150000, 2220000, 2090000, 2260000, 2310000, 2180000, 2260000, 2400000,
];

/**
 * EKTE DATA fra Fazile (hentet 2026-08-10 via arsinntekt-verktøyet, group_by=bygg, kun RENT-linjer,
 * hele 2026, dag-presis pro-rating, 50%-eierskap på Strandveien 4-8 allerede trukket inn automatisk).
 * De 5 byggene med høyest faktisk registrert leieinntekt i år.
 * MERK: Fazile har ikke noe budsjett-felt — dette er faktiske tall, ikke budsjett/prognose.
 * "Budsjett vs. prognose" (som i forrige testdata-versjon) finnes ikke her; det må eventuelt
 * hentes fra Visma NXT hvis budsjett skal vises sammen med dette.
 */
export const BUILDINGS = [
  { navn: "Lilleakerveien 16", leieinntekt2026: 157471319, antallLinjer: 224 },
  { navn: "Lilleakerveien 6", leieinntekt2026: 74681640, antallLinjer: 5 },
  { navn: "Strandveien 4-8", leieinntekt2026: 60836015, antallLinjer: 19 },
  { navn: "Lilleakerveien 4E", leieinntekt2026: 49182141, antallLinjer: 4 },
  { navn: "Lilleakerveien 8", leieinntekt2026: 43776365, antallLinjer: 107 },
];

export const PRIVAT_WIDGETS: WidgetSpec[] = [
  {
    title: "Permisjon/familie",
    value: "Dag 42",
    hint: "av foreldrepermisjon",
    detail: "42 dager inn i permisjonen. Neste oppfølging hos NAV om 8 dager.",
  },
  {
    title: "Darts",
    value: "42,8",
    hint: "snitt siste 10 kamper (Scolia)",
    detail: "3-dart-snitt 42,8 siste 10 kamper. Checkout-treff 38 %.",
  },
];

/**
 * Kompakt tekst-sammendrag av dashboardets egne data, til bruk som kontekst for chatboten.
 * Ekte data: kontrakter (Fazile+Salesforce), leieinntekt per bygg (Fazile), kalender (Outlook),
 * garantioversikt (Asana) og kundefordringer (Visma Business NXT). Fortsatt testdata: den
 * ukentlige utviklings-grafen for kundefordringer (NXT har ikke ukentlig historikk) og Privat-fanen.
 */
export function buildDashboardContext(): string {
  const lines: string[] = [];

  lines.push("KALENDER (ekte, fra Outlook — kun møter med andre deltakere, personlige blokker filtrert bort):");
  if (CALENDAR_EVENTS.length === 0) {
    lines.push("- Ingen møter i perioden.");
  } else {
    for (const m of CALENDAR_EVENTS) {
      lines.push(`- ${m.dato} ${m.start}–${m.slutt} ${m.mote} (${m.beskrivelse}, ${m.sted})${m.merknad ? ` — ${m.merknad}` : ""}`);
    }
  }

  lines.push("\nNYE KONTRAKTER (siste 30 dager):");
  for (const c of CONTRACTS) {
    lines.push(
      `- ${c.kunde} | signert ${c.signeringsdato} | start ${c.startdato} | ${formatKr(c.arsbelop)}/år | ${c.bygg} | ${c.kvm} kvm | ${c.leietype}${c.sfUrl ? ` | SF: ${c.sfUrl}` : " | ikke funnet i Salesforce"}`,
    );
  }

  lines.push(`\nGARANTIOVERSIKT (ekte, fra Asana): ${GUARANTEE_TOTAL} innflyttinger mangler bankgaranti/depositum`);
  for (const g of GUARANTEES) lines.push(`- [${g.status}] ${g.leietaker}, frist ${g.frist}`);

  const totalFordringer = RECEIVABLES.reduce((s, r) => s + r.utestaende, 0);
  lines.push(`\nKUNDEFORDRINGER (ekte, fra Visma Business NXT): ${formatKr(totalFordringer)} totalt (topp 5 kunder)`);
  for (const r of RECEIVABLES) {
    lines.push(
      `- ${r.leietaker}: ${formatKr(r.utestaende)} utestående (${formatKr(r.utestaende60)} er 60+ dager forfalt), ${r.dagerSidenBetaling} dager siden forrige innbetaling`,
    );
  }
  lines.push(`Ukentlig utvikling siste 12 uker (kr, FORTSATT TESTDATA — NXT har kun månedlige perioder): ${RECEIVABLES_TREND.join(", ")}`);

  lines.push("\nLEIEINNTEKT 2026 per bygg (ekte tall, topp 5 — Fazile har ikke budsjett-data):");
  for (const b of BUILDINGS) {
    lines.push(`- ${b.navn}: ${formatKr(b.leieinntekt2026)} (${b.antallLinjer} kontraktslinjer)`);
  }

  lines.push("\nPRIVAT:");
  for (const w of PRIVAT_WIDGETS) lines.push(`- ${w.title}: ${w.value} (${w.hint}). ${w.detail}`);

  return lines.join("\n");
}

/**
 * Utvidet kontekst for Privat-fanen: sport-fixtures, FPL og de ekte,
 * skyllagrede påminnelsene/kalenderhendelsene. Hver kilde hentes uavhengig
 * (Promise.allSettled) slik at én treg/feilende kilde ikke velter hele
 * chat-svaret.
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
