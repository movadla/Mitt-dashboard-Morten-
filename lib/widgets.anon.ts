import { buildIncomeForecastContext } from "./incomeForecast";

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
 * MIDLERTIDIG ANONYMISERT (se AGENTS.md-historikk/commit-melding for dato) — kundenavn er
 * byttet ut med "Demokunde N" på Mortens forespørsel før dashboardet skulle vises frem.
 * Beløp/datoer/bygg er ekte (fra Fazile, hentet 2026-08-10). Ekte kundenavn og SF-lenker
 * finnes i git-historikken før denne endringen — spør Morten før du bytter tilbake.
 */
export interface Contract {
  id: string;
  kunde: string;
  signeringsdato: string;
  startdato: string;
  arsbelop: number;
  bygg: string;
  kvm: number;
  leietype: string;
  sfUrl: string | null;
}

// `id` er posisjonsbasert (c1, c2, ...) — IKKE avledet av kundenavn, siden navnet er
// anonymisert her men ekte i widgets.local.ts og må gi SAMME id i begge filer for at
// kommentarer (lib/comments.ts) skal treffe riktig rad uansett hvilken variant som kjører.
export const CONTRACTS: Contract[] = [
  { id: "c1", kunde: "Demokunde 1", signeringsdato: "2026-08-08", startdato: "2026-09-01", arsbelop: 186800, bygg: "Lilleakerveien 31", kvm: 135.6, leietype: "Lagerleie", sfUrl: null },
  { id: "c2", kunde: "Demokunde 2 AS", signeringsdato: "2026-08-07", startdato: "2026-05-18", arsbelop: 67400, bygg: "Strandveien 4-8", kvm: 63, leietype: "Lagerleie", sfUrl: null },
  { id: "c3", kunde: "Demokunde 3 AS", signeringsdato: "2026-08-03", startdato: "2026-08-01", arsbelop: 34800, bygg: "Lilleakerveien 2E", kvm: 12.9, leietype: "Husleie", sfUrl: null },
  { id: "c4", kunde: "Demokunde 4 AS", signeringsdato: "2026-07-24", startdato: "2026-07-15", arsbelop: 60000, bygg: "Lilleakerveien 4CDEF", kvm: 0, leietype: "Parkering", sfUrl: null },
  { id: "c5", kunde: "Demokunde 5 AS", signeringsdato: "2026-07-09", startdato: "2026-07-01", arsbelop: 33127, bygg: "Lilleakerveien 10", kvm: 11.3, leietype: "Garasje/El-bil", sfUrl: null },
];

export type GuaranteeStatus = "Mangler" | "Forespurt" | "Kommer";

export interface Guarantee {
  id: string;
  status: GuaranteeStatus;
  leietaker: string;
  belop: number | null;
  frist: string;
}

/**
 * MIDLERTIDIG ANONYMISERT — se merknad over CONTRACTS. Beløp/frister ekte (fra Asana,
 * hentet 2026-08-10), leietakernavn byttet til "Demokunde N". `id` posisjonsbasert (g1, g2, ...).
 */
export const GUARANTEE_TOTAL = 5;
export const GUARANTEES: Guarantee[] = [
  { id: "g1", status: "Mangler", leietaker: "Demokunde 6 (Lv2C)", belop: null, frist: "2026-08-01" },
  { id: "g2", status: "Mangler", leietaker: "Demokunde 7 (Lv19)", belop: null, frist: "2026-08-01" },
  { id: "g3", status: "Mangler", leietaker: "Demokunde 8 (Lv4A)", belop: null, frist: "2026-08-15" },
  { id: "g4", status: "Mangler", leietaker: "Demokunde 9 (Lv2B)", belop: null, frist: "2026-09-01" },
  { id: "g5", status: "Mangler", leietaker: "Demokunde 10 (Vollsveien 17)", belop: null, frist: "2026-09-04" },
];

export interface Receivable {
  id: string;
  leietaker: string;
  utestaende: number;
  utestaende60: number;
  dagerSidenBetaling: number;
}

/**
 * MIDLERTIDIG ANONYMISERT — se merknad over CONTRACTS. Beløp ekte (fra Visma Business NXT,
 * hentet 2026-08-10), leietakernavn byttet til "Demokunde N". `id` posisjonsbasert (r1, r2, ...)
 * — bygges om til en ekte Visma-kundenummer-basert id når Kundefordringer utvides (se plan).
 */
export const RECEIVABLES: Receivable[] = [
  { id: "r1", leietaker: "Demokunde 11 AS", utestaende: 1619508, utestaende60: 1619508, dagerSidenBetaling: 40 },
  { id: "r2", leietaker: "Demokunde 12 AS", utestaende: 1585743, utestaende60: 0, dagerSidenBetaling: 4 },
  { id: "r3", leietaker: "Demokunde 13 AS", utestaende: 964501, utestaende60: 634104, dagerSidenBetaling: 7 },
  { id: "r4", leietaker: "Demokunde 14 AS", utestaende: 916488, utestaende60: 0, dagerSidenBetaling: 31 },
  { id: "r5", leietaker: "Demokunde 15 AS", utestaende: 640746, utestaende60: 0, dagerSidenBetaling: 109 },
];

/**
 * IKKE ekte ennå — Visma NXT sine regnskapsperioder er månedlige, ikke ukentlige, så en ren
 * "12 uker"-historikk finnes ikke direkte. Beholdt som illustrasjon til vi bestemmer om grafen
 * heller skal vise månedlig utvikling (som faktisk finnes i NXT).
 */
export const RECEIVABLES_TREND = [
  1950000, 2010000, 2080000, 1990000, 2150000, 2220000, 2090000, 2260000, 2310000, 2180000, 2260000, 2400000,
];

export interface ExpiringLine {
  linjeId: number;
  beskrivelse: string;
  bygg: string;
  arealtype: string;
  leietype: string;
  slutt: string; // "YYYY-MM-DD"
  dagerTilUtlop: number;
  totalArsleie: number;
  reforhandlet: boolean;
  nyKontraktsnokkel?: string;
  nyKontraktStart?: string;
  gapDager?: number;
}

export type ExpiryStatus = "Reforhandlet" | "Terminert" | "Mulig endring" | "Reforhandling pågår" | "Ingen varsel";

export interface ExpiringTenant {
  leietaker: string;
  customerId: number;
  bygg: string;
  totalArsleie: number;
  status: ExpiryStatus;
  statusKilde?: string;
  lines: ExpiringLine[];
}

/**
 * MIDLERTIDIG ANONYMISERT — se merknad over CONTRACTS. Beløp/datoer/arealtype ekte (fra Fazile,
 * hentet 2026-08-12 via kontraktsutlop-verktøyet, maneder_frem=1, hele porteføljen). Vinduet er
 * 2026-08-12 til 2026-09-12 (31 dager — verktøyet støtter kun hele måneder). Leietakernavn byttet
 * til samme "Demokunde N"-nummerering som CONTRACTS/GUARANTEES/RECEIVABLES der samme leietaker
 * opptrer flere steder (Demokunde 1 = Kristin Mustad Bevreng, Demokunde 10 = Origon AS, Demokunde 13
 * = Møllefossen Cafe AS). "kontraktsutløp" er LINJENS sluttdato, ikke kontraktens. Rene
 * "leiefritak"-linjer er filtrert bort (2 linjer, hver eneste linje for sin leietaker, fjernet
 * 2026-08-12 — derfor "hopper" Demokunde-nummereringen over 17 og 28). `status`/`statusKilde` er et
 * manuelt kryssreferert øyeblikksbilde (Fazile `reforhandlet`-flagg + Salesforce Case/Prosjekt-søk
 * 2026-08-12), IKKE en live sjekk — se AGENTS.md-historikk for research-grunnlaget. `ExpiringTenant.bygg`
 * er leietakerens HOVEDBYGG (bygget knyttet til kontor-/husleielinjen, ikke en kommaseparert liste over
 * alle bygg) — leietakere med linjer i flere bygg (f.eks. Scandinavian Cosmetics AS) viser de andre
 * byggene per linje i `ExpiringLine.bygg` i stedet.
 */
export const EXPIRIES_WINDOW = { fraDato: "2026-08-12", tilDato: "2026-09-12" };
export const EXPIRIES_TOTAL_ARSLEIE = 9109581.5;
export const EXPIRIES_REELL_EKSPONERING = 8922781.5;
export const EXPIRIES: ExpiringTenant[] = [
  {
    leietaker: "Demokunde 16", customerId: 67110, bygg: "Lilleakerveien 4A", totalArsleie: 384649.65,
    status: "Ingen varsel",
    lines: [
      { linjeId: 158079, beskrivelse: "Felleskostnader for Husleie avg.fritt", bygg: "(ukjent bygg)", arealtype: "Kontor", leietype: "Husleie", slutt: "2026-08-14", dagerTilUtlop: 2, totalArsleie: 0, reforhandlet: false },
      { linjeId: 158080, beskrivelse: "Husleie avg.fritt", bygg: "Lilleakerveien 4A", arealtype: "Kontor", leietype: "Husleie", slutt: "2026-08-14", dagerTilUtlop: 2, totalArsleie: 384649.65, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 13", customerId: 67267, bygg: "Lilleakerveien 2E", totalArsleie: 101081,
    status: "Reforhandling pågår",
    statusKilde: "SF-prosjekt (Reforhandling, Gjennomføring): «Selskapslokaler - Lilleakerveien 2 E» — byggnavn-match, ikke direkte kontraktkobling",
    lines: [
      { linjeId: 185901, beskrivelse: "Felleskostnader for Husleie avg.pl", bygg: "(ukjent bygg)", arealtype: "Lager", leietype: "Husleie", slutt: "2026-08-18", dagerTilUtlop: 6, totalArsleie: 0, reforhandlet: false },
      { linjeId: 185902, beskrivelse: "Husleie avg.pl", bygg: "Lilleakerveien 2E", arealtype: "Lager", leietype: "Husleie", slutt: "2026-08-18", dagerTilUtlop: 6, totalArsleie: 101081, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 18", customerId: 67199, bygg: "Vollsveien 13D", totalArsleie: 4318.1,
    status: "Ingen varsel",
    lines: [
      { linjeId: 159175, beskrivelse: "Felleskostnader for Lagerleie avg.fritt", bygg: "(ukjent bygg)", arealtype: "Lager", leietype: "Lagerleie", slutt: "2026-08-30", dagerTilUtlop: 18, totalArsleie: 0, reforhandlet: false },
      { linjeId: 213729, beskrivelse: "Energi fast avg.pl.", bygg: "Vollsveien 13D", arealtype: "Lager", leietype: "Energi", slutt: "2026-08-30", dagerTilUtlop: 18, totalArsleie: 1816.05, reforhandlet: false },
      { linjeId: 159176, beskrivelse: "Lagerleie avg.fritt", bygg: "Vollsveien 13D", arealtype: "Lager", leietype: "Lagerleie", slutt: "2026-08-30", dagerTilUtlop: 18, totalArsleie: 2502.05, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 19", customerId: 68074, bygg: "Gamle Drammensvei 10", totalArsleie: 120000,
    status: "Ingen varsel",
    lines: [
      { linjeId: 186558, beskrivelse: "Felleskostnader for Husleie avg.fritt", bygg: "(ukjent bygg)", arealtype: "Lager", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 186559, beskrivelse: "Husleie avg.fritt", bygg: "Gamle Drammensvei 10", arealtype: "Lager", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 120000, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 20", customerId: 68084, bygg: "Gamle Drammensvei 10", totalArsleie: 171587.88,
    status: "Mulig endring",
    statusKilde: "SF-sak: «Flytte ut?» / «Re: Flytte ut?» (Account Ozog/Jeziorwski, uklart utfall)",
    lines: [
      { linjeId: 214104, beskrivelse: "Felleskostnader for Husleie avg.fritt", bygg: "(ukjent bygg)", arealtype: "Annet", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 214105, beskrivelse: "Husleie avg.fritt", bygg: "Gamle Drammensvei 10", arealtype: "Annet", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 171587.88, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 21", customerId: 68091, bygg: "Gamle Drammensvei 10", totalArsleie: 184367.88,
    status: "Mulig endring",
    statusKilde: "SF-sak: «Flyttedato» (Avventer kunde)",
    lines: [
      { linjeId: 159219, beskrivelse: "Felleskostnader for Husleie avg.fritt", bygg: "(ukjent bygg)", arealtype: "Lager", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 159220, beskrivelse: "Husleie avg.fritt", bygg: "Gamle Drammensvei 10", arealtype: "Lager", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 184367.88, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 22", customerId: 68163, bygg: "Arnstein Arnebergsvei 4", totalArsleie: 279731.6,
    status: "Ingen varsel",
    lines: [
      { linjeId: 159211, beskrivelse: "Felleskostnader for Husleie avg.fritt", bygg: "(ukjent bygg)", arealtype: "Annet", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 159212, beskrivelse: "Husleie avg.fritt", bygg: "Arnstein Arnebergsvei 4", arealtype: "Annet", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 279731.6, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 23", customerId: 67275, bygg: "Lilleakerveien 4CDEF Uteparkering", totalArsleie: 86623.05,
    status: "Ingen varsel",
    lines: [
      { linjeId: 158099, beskrivelse: "Felleskostnader for Parkering avg.pl. fri flyt 3 pl.", bygg: "(ukjent bygg)", arealtype: "Annet", leietype: "Parkering", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 158101, beskrivelse: "Parkering avg.pl. fri flyt 3 pl.", bygg: "Lilleakerveien 4CDEF Uteparkering", arealtype: "Fri flyt", leietype: "Parkering", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 86623.05, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 24", customerId: 67521, bygg: "Lilleakerveien 10", totalArsleie: 5249828.64,
    status: "Ingen varsel",
    lines: [
      { linjeId: 159924, beskrivelse: "Felleskostnader", bygg: "(ukjent bygg)", arealtype: "Fast plass", leietype: "Felleskostnader", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 158611, beskrivelse: "Felleskostnader for Garasje avg.pl. 19 pl", bygg: "(ukjent bygg)", arealtype: "El-bil plass", leietype: "Garasjeleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 158610, beskrivelse: "Felleskostnader avg.pl.", bygg: "(ukjent bygg)", arealtype: "Kontor", leietype: "Felleskostnader", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 727430, reforhandlet: false },
      { linjeId: 158609, beskrivelse: "Felleskostnader for Parkering avg.pl. 2 pl", bygg: "(ukjent bygg)", arealtype: "Annet", leietype: "Parkering", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 158778, beskrivelse: "Felleskostnader", bygg: "(ukjent bygg)", arealtype: "El-bil plass", leietype: "Felleskostnader", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 156917, beskrivelse: "Felleskostnader avg.pl.", bygg: "(ukjent bygg)", arealtype: "Lager", leietype: "Felleskostnader", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 36639, reforhandlet: false },
      { linjeId: 161284, beskrivelse: "à konto energi avg.pl.", bygg: "Lilleakerveien 14", arealtype: "Lager", leietype: "Energi", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 116601.44, reforhandlet: false },
      { linjeId: 161848, beskrivelse: "à konto energi avg.pl.", bygg: "Lilleakerveien 10", arealtype: "Kontor", leietype: "Energi", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 304885.56, reforhandlet: false },
      { linjeId: 161849, beskrivelse: "Kantinebidrag avg.fritt (47)", bygg: "Lilleakerveien 10", arealtype: "Kontor", leietype: "Kantinebidrag", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 200000.04, reforhandlet: false },
      { linjeId: 158613, beskrivelse: "Husleie avg.pl.", bygg: "Lilleakerveien 10", arealtype: "Kontor", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 2461799.14, reforhandlet: false },
      { linjeId: 158779, beskrivelse: "Parkering avg.pl. el-bil", bygg: "P-Bro Uteparkering", arealtype: "El-bil plass", leietype: "Parkering", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 17875.78, reforhandlet: false },
      { linjeId: 158614, beskrivelse: "Garasje avg.pl. 19 pl", bygg: "Lilleakerveien 10", arealtype: "El-bil plass", leietype: "Garasjeleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 433921.95, reforhandlet: false },
      { linjeId: 159925, beskrivelse: "Parkering avg.pl. 5 pl", bygg: "Lilleakerveien 6 Uteparkering", arealtype: "Fast plass", leietype: "Parkering", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 113852.7, reforhandlet: false },
      { linjeId: 158612, beskrivelse: "Parkering avg.pl. 2 pl", bygg: "Lilleakerveien 10", arealtype: "Annet", leietype: "Parkering", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 26482.64, reforhandlet: false },
      { linjeId: 156918, beskrivelse: "Lagerleie avg.pl.", bygg: "Lilleakerveien 14", arealtype: "Lager", leietype: "Lagerleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 719355.79, reforhandlet: false },
      { linjeId: 161850, beskrivelse: "Eiendomsskatt avg.pl.", bygg: "Lilleakerveien 10", arealtype: "Kontor", leietype: "Annet", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 90984.6, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 25", customerId: 66939, bygg: "Lilleakerveien 31", totalArsleie: 92535.21,
    status: "Terminert",
    statusKilde: "SF-sak: «Oppsigelse - Lilleakerveien 31, oppgang B» (Lukket)",
    lines: [
      { linjeId: 156850, beskrivelse: "Felleskostnader for Kontorleie avg.pl.", bygg: "(ukjent bygg)", arealtype: "Kontor", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 156852, beskrivelse: "Kontorleie avg.pl.", bygg: "Lilleakerveien 31", arealtype: "Kontor", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 92535.21, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 1", customerId: 68049, bygg: "Lilleakerveien 31", totalArsleie: 186800,
    status: "Reforhandlet",
    statusKilde: "Fazile: signert etterfølgerkontrakt RM6909",
    lines: [
      { linjeId: 156687, beskrivelse: "Felleskostnader for Lagerleie avg.fritt", bygg: "(ukjent bygg)", arealtype: "Lager", leietype: "Lagerleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: true, nyKontraktsnokkel: "RM6909", nyKontraktStart: "2026-09-01", gapDager: 1 },
      { linjeId: 156688, beskrivelse: "Felleskostnader for Lagerleie avg.fritt.", bygg: "(ukjent bygg)", arealtype: "Lager", leietype: "Lagerleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: true, nyKontraktsnokkel: "RM6909", nyKontraktStart: "2026-09-01", gapDager: 1 },
      { linjeId: 156689, beskrivelse: "Lagerleie avg.fritt", bygg: "Lilleakerveien 31", arealtype: "Lager", leietype: "Lagerleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 95600, reforhandlet: true, nyKontraktsnokkel: "RM6909", nyKontraktStart: "2026-09-01", gapDager: 1 },
      { linjeId: 156690, beskrivelse: "Lagerleie avg.fritt.", bygg: "Lilleakerveien 31", arealtype: "Lager", leietype: "Lagerleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 91200, reforhandlet: true, nyKontraktsnokkel: "RM6909", nyKontraktStart: "2026-09-01", gapDager: 1 }
    ],
  },
  {
    leietaker: "Demokunde 26", customerId: 67290, bygg: "Vollsveien 13D", totalArsleie: 22957.17,
    status: "Ingen varsel",
    lines: [
      { linjeId: 159165, beskrivelse: "Felleskostnader for Lagerleie avg.pl.", bygg: "(ukjent bygg)", arealtype: "Lager", leietype: "Lagerleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 159166, beskrivelse: "Lagerleie avg.pl.", bygg: "Vollsveien 13D", arealtype: "Lager", leietype: "Lagerleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 22957.17, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 27", customerId: 67283, bygg: "Vollsveien 13B", totalArsleie: 211694.04,
    status: "Ingen varsel",
    lines: [
      { linjeId: 178697, beskrivelse: "Felleskostnader for Kantine", bygg: "(ukjent bygg)", arealtype: "Kantine", leietype: "Felleskostnader", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 158931, beskrivelse: "Felleskostnader for Husleie avg.fritt", bygg: "(ukjent bygg)", arealtype: "Kontor", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 48256, reforhandlet: false },
      { linjeId: 161914, beskrivelse: "à konto energi avg.pl.", bygg: "Vollsveien 13B", arealtype: "Kontor", leietype: "Energi", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 13581.3, reforhandlet: false },
      { linjeId: 161916, beskrivelse: "Kantinebidrag avg.fritt (1)", bygg: "Vollsveien 19", arealtype: "Kantine", leietype: "Kantinebidrag", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 6000, reforhandlet: false },
      { linjeId: 158932, beskrivelse: "Husleie avg.fritt", bygg: "Vollsveien 13B", arealtype: "Kontor", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 143856.74, reforhandlet: false },
      { linjeId: 178698, beskrivelse: "Kantine", bygg: "Vollsveien 19", arealtype: "Kantine", leietype: "Annet", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 10", customerId: 67352, bygg: "Vollsveien 13B", totalArsleie: 1383407.28,
    status: "Ingen varsel",
    lines: [
      { linjeId: 159040, beskrivelse: "Felleskostnader kontor avg.pl", bygg: "(ukjent bygg)", arealtype: "Kontor", leietype: "Felleskostnader", slutt: "2026-09-03", dagerTilUtlop: 22, totalArsleie: 302592, reforhandlet: false },
      { linjeId: 161954, beskrivelse: "à konto energi avg.pl. kontor", bygg: "Vollsveien 13B", arealtype: "Kontor", leietype: "Energi", slutt: "2026-09-03", dagerTilUtlop: 22, totalArsleie: 85162.74, reforhandlet: false },
      { linjeId: 159044, beskrivelse: "Kontorleie avg.pl", bygg: "Vollsveien 13B", arealtype: "Kontor", leietype: "Husleie", slutt: "2026-09-03", dagerTilUtlop: 22, totalArsleie: 995652.54, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 29", customerId: 101620, bygg: "Lilleakerveien 8", totalArsleie: 630000,
    status: "Ingen varsel",
    lines: [
      { linjeId: 226388, beskrivelse: "Felleskostnader for Kantinebidrag  (4)", bygg: "(ukjent bygg)", arealtype: "Kantine", leietype: "Kantinebidrag", slutt: "2026-09-04", dagerTilUtlop: 23, totalArsleie: 0, reforhandlet: false },
      { linjeId: 215236, beskrivelse: "Felleskostnader avg.pl.", bygg: "(ukjent bygg)", arealtype: "Kontor", leietype: "Felleskostnader", slutt: "2026-09-04", dagerTilUtlop: 23, totalArsleie: 82500, reforhandlet: false },
      { linjeId: 215238, beskrivelse: "à konto energi avg.pl.", bygg: "Lilleakerveien 8", arealtype: "Kontor", leietype: "Energi", slutt: "2026-09-04", dagerTilUtlop: 23, totalArsleie: 22500, reforhandlet: false },
      { linjeId: 215235, beskrivelse: "Kontorleie avg.pl.", bygg: "Lilleakerveien 8", arealtype: "Kontor", leietype: "Husleie", slutt: "2026-09-04", dagerTilUtlop: 23, totalArsleie: 525000, reforhandlet: false },
      { linjeId: 226389, beskrivelse: "Kantinebidrag  (4)", bygg: "Lilleakerveien 8", arealtype: "Kantine", leietype: "Kantinebidrag", slutt: "2026-09-04", dagerTilUtlop: 23, totalArsleie: 0, reforhandlet: false }
    ],
  },
];


/**
 * Kompakt tekst-sammendrag av dashboardets egne data, til bruk som kontekst for chatboten.
 * Ekte data: kontrakter (Fazile+Salesforce), inntektsprognose (Fazile+Visma NXT, se
 * lib/incomeForecast.ts), kalender (Outlook), garantioversikt (Asana) og kundefordringer
 * (Visma Business NXT). Fortsatt testdata: den ukentlige utviklings-grafen for
 * kundefordringer (NXT har ikke ukentlig historikk) og Privat-fanen.
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

  lines.push(`\n${buildIncomeForecastContext()}`);

  lines.push(
    `\nUTLØPSLISTE (ekte, fra Fazile — kontraktslinjer som utløper ${EXPIRIES_WINDOW.fraDato} til ${EXPIRIES_WINDOW.tilDato}): ` +
      `${formatKr(EXPIRIES_TOTAL_ARSLEIE)} total eksponering, ${formatKr(EXPIRIES_REELL_EKSPONERING)} reell eksponering (ekskl. reforhandlede linjer)`,
  );
  for (const t of EXPIRIES) {
    const nearest = Math.min(...t.lines.map((l) => l.dagerTilUtlop));
    const renegotiated = t.lines.some((l) => l.reforhandlet);
    lines.push(
      `- ${t.leietaker}: ${formatKr(t.totalArsleie)}/år, ${t.lines.length} linje(r), nærmeste utløp om ${nearest} dager${renegotiated ? " (allerede reforhandlet/sikret)" : ""}`,
    );
  }

  return lines.join("\n");
}
