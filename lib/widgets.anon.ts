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

export interface ReceivableCompany {
  selskap: string;
  belop: number;
  antallLinjer: number;
  underInkasso?: boolean;
}

export interface Receivable {
  id: string;
  leietaker: string;
  utestaende: number;
  selskaper: ReceivableCompany[];
}

/**
 * MIDLERTIDIG ANONYMISERT — se merknad over CONTRACTS. Beløp/selskapsnavn/inkassostatus ekte
 * (fra Visma Business NXT, hentet 2026-08-14, ALLE 22 Mustad-selskaper), leietakernavn byttet til
 * "Demokunde N" — samme nummer gjenbrukt der leietakeren allerede opptrer i CONTRACTS/GUARANTEES/
 * EXPIRIES (Demokunde 1, 7, 9, 11, 12, 13, 15, 16, 18, 20, 21, 24, 29 — se lib/widgets.local.ts
 * for hvilken ekte leietaker hvert nummer tilsvarer; navnene skal IKKE stå i denne filen). Nye
 * leietakere denne runden er nummerert 30–218. `id` er posisjonsbasert (r1, r2, ...), sortert
 * etter størst utestående først.
 */
export const RECEIVABLES: Receivable[] = [
  { id: "r1", leietaker: "Demokunde 30", utestaende: 5262199.59, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 5262199.59, antallLinjer: 1 }] },
  { id: "r2", leietaker: "Demokunde 31", utestaende: 3102881.05, selskaper: [{ selskap: "B3 Lilleaker Eiendom AS", belop: 3102881.05, antallLinjer: 3 }] },
  { id: "r3", leietaker: "Demokunde 32", utestaende: 2936250, selskaper: [{ selskap: "Vollsveien 9-11 AS", belop: 2936250, antallLinjer: 1 }] },
  { id: "r4", leietaker: "Demokunde 12", utestaende: 1693098.92, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 1585743.18, antallLinjer: 4, underInkasso: true }, { selskap: "Mustad Eiendomsdrift AS", belop: 97131.74, antallLinjer: 1 }, { selskap: "Lilleaker Service AS", belop: 10224, antallLinjer: 1 }] },
  { id: "r5", leietaker: "Demokunde 11", utestaende: 1619507.9, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 1619507.9, antallLinjer: 1, underInkasso: true }] },
  { id: "r6", leietaker: "Demokunde 13", utestaende: 854163.09, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 854163.09, antallLinjer: 10, underInkasso: true }] },
  { id: "r7", leietaker: "Demokunde 33", utestaende: 853834.36, selskaper: [{ selskap: "Lilleakerveien 32B AS", belop: 822870, antallLinjer: 5, underInkasso: true }, { selskap: "CC Vest Stormarked AS", belop: 30964.36, antallLinjer: 2, underInkasso: true }] },
  { id: "r8", leietaker: "Demokunde 34", utestaende: 700270.42, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 441360.91, antallLinjer: 1 }, { selskap: "CC Vest Stormarked AS", belop: 258909.51, antallLinjer: 1 }] },
  { id: "r9", leietaker: "Demokunde 35", utestaende: 691676.58, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 494012.38, antallLinjer: 1 }, { selskap: "CC Vest Stormarked AS", belop: 195887.74, antallLinjer: 1 }, { selskap: "Mustad Eiendomsdrift AS", belop: 1776.46, antallLinjer: 1 }] },
  { id: "r10", leietaker: "Demokunde 36", utestaende: 690975.87, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 352613.67, antallLinjer: 10, underInkasso: true }, { selskap: "Mustad Eiendomsdrift AS", belop: 338362.2, antallLinjer: 13, underInkasso: true }] },
  { id: "r11", leietaker: "Demokunde 37", utestaende: 690114.16, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 468788.66, antallLinjer: 2 }, { selskap: "CC Vest Stormarked AS", belop: 221325.5, antallLinjer: 2, underInkasso: true }] },
  { id: "r12", leietaker: "Demokunde 15", utestaende: 661223.31, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 640746.31, antallLinjer: 1, underInkasso: true }, { selskap: "Lilleaker Service AS", belop: 20477, antallLinjer: 3, underInkasso: true }] },
  { id: "r13", leietaker: "Demokunde 38", utestaende: 654656.12, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 522770.82, antallLinjer: 4, underInkasso: true }, { selskap: "Mustad Eiendomsdrift AS", belop: 116600.3, antallLinjer: 2, underInkasso: true }, { selskap: "CC Vest Stormarked AS", belop: 15285, antallLinjer: 1, underInkasso: true }] },
  { id: "r14", leietaker: "Demokunde 39", utestaende: 494436.3, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 306716.3, antallLinjer: 1, underInkasso: true }, { selskap: "Lilleaker Service AS", belop: 181470, antallLinjer: 3, underInkasso: true }, { selskap: "Mustad Eiendom AS", belop: 6250, antallLinjer: 1 }] },
  { id: "r15", leietaker: "Demokunde 40", utestaende: 489393.55, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 342097.51, antallLinjer: 3 }, { selskap: "CC Vest Stormarked AS", belop: 147296.04, antallLinjer: 1 }] },
  { id: "r16", leietaker: "Demokunde 41", utestaende: 459876.05, selskaper: [{ selskap: "Lilleaker Service AS", belop: 335147.5, antallLinjer: 2 }, { selskap: "Mustad Eiendomsdrift AS", belop: 124728.55, antallLinjer: 10 }] },
  { id: "r17", leietaker: "Demokunde 42", utestaende: 396216.21, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 263947.33, antallLinjer: 1 }, { selskap: "CC Vest Stormarked AS", belop: 132268.88, antallLinjer: 1 }] },
  { id: "r18", leietaker: "Demokunde 43", utestaende: 330161.89, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 330161.89, antallLinjer: 2, underInkasso: true }] },
  { id: "r19", leietaker: "Demokunde 44", utestaende: 316804.76, selskaper: [{ selskap: "Lilleaker Service AS", belop: 157901.6, antallLinjer: 8, underInkasso: true }, { selskap: "Mustad Eiendomsdrift AS", belop: 130400.16, antallLinjer: 2, underInkasso: true }, { selskap: "Mustad Eiendom AS", belop: 28503, antallLinjer: 1, underInkasso: true }] },
  { id: "r20", leietaker: "Demokunde 45", utestaende: 294500.23, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 160698.19, antallLinjer: 3 }, { selskap: "CC Vest Stormarked AS", belop: 133802.04, antallLinjer: 2, underInkasso: true }] },
  { id: "r21", leietaker: "Demokunde 46", utestaende: 290008.52, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 255085.52, antallLinjer: 4, underInkasso: true }, { selskap: "Mustad Eiendomsdrift AS", belop: 34923, antallLinjer: 4, underInkasso: true }] },
  { id: "r22", leietaker: "Demokunde 47", utestaende: 288856.75, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 288856.75, antallLinjer: 7, underInkasso: true }] },
  { id: "r23", leietaker: "Demokunde 48", utestaende: 284917.27, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 164257.74, antallLinjer: 1 }, { selskap: "CC Vest Stormarked AS", belop: 120659.53, antallLinjer: 3, underInkasso: true }] },
  { id: "r24", leietaker: "Demokunde 49", utestaende: 259865.24, selskaper: [{ selskap: "Lilleakerveien 32B AS", belop: 152423.18, antallLinjer: 1, underInkasso: true }, { selskap: "Mustad Eiendomsdrift AS", belop: 107034.06, antallLinjer: 1, underInkasso: true }, { selskap: "CC Vest Stormarked AS", belop: 408, antallLinjer: 1, underInkasso: true }] },
  { id: "r25", leietaker: "Demokunde 50", utestaende: 253000.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 197217.46, antallLinjer: 4, underInkasso: true }, { selskap: "CC Vest Stormarked AS", belop: 54204.03, antallLinjer: 2, underInkasso: true }, { selskap: "Lilleakerveien 32B AS", belop: 1579.01, antallLinjer: 1 }] },
  { id: "r26", leietaker: "Demokunde 51", utestaende: 251702.68, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 251650.68, antallLinjer: 1, underInkasso: true }, { selskap: "Lilleaker Service AS", belop: 52, antallLinjer: 1 }] },
  { id: "r27", leietaker: "Demokunde 52", utestaende: 246705.77, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 226474.84, antallLinjer: 6 }, { selskap: "CC Vest Stormarked AS", belop: 20230.93, antallLinjer: 2, underInkasso: true }] },
  { id: "r28", leietaker: "Demokunde 53", utestaende: 226274.02, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 168351.33, antallLinjer: 1 }, { selskap: "CC Vest Stormarked AS", belop: 57922.69, antallLinjer: 2, underInkasso: true }] },
  { id: "r29", leietaker: "Demokunde 54", utestaende: 223507.84, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 143801.25, antallLinjer: 1 }, { selskap: "CC Vest Stormarked AS", belop: 79706.59, antallLinjer: 1 }] },
  { id: "r30", leietaker: "Demokunde 55", utestaende: 213597.61, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 152691.7, antallLinjer: 1 }, { selskap: "CC Vest Stormarked AS", belop: 60905.91, antallLinjer: 1 }] },
  { id: "r31", leietaker: "Demokunde 56", utestaende: 194056.36, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 121685.05, antallLinjer: 2, underInkasso: true }, { selskap: "Mustad Eiendom AS", belop: 72371.31, antallLinjer: 1, underInkasso: true }] },
  { id: "r32", leietaker: "Demokunde 29", utestaende: 193279.69, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 162889.32, antallLinjer: 4 }, { selskap: "Mustad Eiendomsdrift AS", belop: 30390.37, antallLinjer: 2 }] },
  { id: "r33", leietaker: "Demokunde 16", utestaende: 189486.11, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 144631.07, antallLinjer: 1 }, { selskap: "Mustad Eiendomsdrift AS", belop: 44855.04, antallLinjer: 2 }] },
  { id: "r34", leietaker: "Demokunde 57", utestaende: 172719.6, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 124953.86, antallLinjer: 1 }, { selskap: "CC Vest Stormarked AS", belop: 47765.74, antallLinjer: 2, underInkasso: true }] },
  { id: "r35", leietaker: "Demokunde 58", utestaende: 167464.76, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 151252.12, antallLinjer: 2 }, { selskap: "Mustad Eiendomsdrift AS", belop: 16212.64, antallLinjer: 2 }] },
  { id: "r36", leietaker: "Demokunde 9", utestaende: 155753.38, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 85937.5, antallLinjer: 1 }, { selskap: "Mustad Eiendom AS", belop: 69815.88, antallLinjer: 2 }] },
  { id: "r37", leietaker: "Demokunde 59", utestaende: 150847.57, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 107659.38, antallLinjer: 3 }, { selskap: "CC Vest Stormarked AS", belop: 43188.19, antallLinjer: 1 }] },
  { id: "r38", leietaker: "Demokunde 60", utestaende: 150284.19, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 116252.55, antallLinjer: 1 }, { selskap: "CC Vest Stormarked AS", belop: 34031.64, antallLinjer: 1 }] },
  { id: "r39", leietaker: "Demokunde 61", utestaende: 138700.1, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 138625.1, antallLinjer: 1 }, { selskap: "Lilleaker Service AS", belop: 75, antallLinjer: 1 }] },
  { id: "r40", leietaker: "Demokunde 62", utestaende: 135230.56, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 135230.56, antallLinjer: 19, underInkasso: true }] },
  { id: "r41", leietaker: "Demokunde 63", utestaende: 133393.45, selskaper: [{ selskap: "Lilleaker Service AS", belop: 66829.2, antallLinjer: 4, underInkasso: true }, { selskap: "Mustad Eiendom AS", belop: 66564.25, antallLinjer: 1, underInkasso: true }] },
  { id: "r42", leietaker: "Demokunde 64", utestaende: 128227.8, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 96977.8, antallLinjer: 2 }, { selskap: "Mustad Eiendomsdrift AS", belop: 31250, antallLinjer: 4, underInkasso: true }] },
  { id: "r43", leietaker: "Demokunde 65", utestaende: 123965.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 123965.5, antallLinjer: 2, underInkasso: true }] },
  { id: "r44", leietaker: "Demokunde 66", utestaende: 120436.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 120436.5, antallLinjer: 1 }] },
  { id: "r45", leietaker: "Demokunde 67", utestaende: 119914.44, selskaper: [{ selskap: "CC Vest Stormarked AS", belop: 116997.78, antallLinjer: 1 }, { selskap: "Mustad Eiendom AS", belop: 2916.66, antallLinjer: 1 }] },
  { id: "r46", leietaker: "Demokunde 68", utestaende: 118126.61, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 75168.46, antallLinjer: 1 }, { selskap: "Mustad Eiendomsdrift AS", belop: 42958.15, antallLinjer: 1 }] },
  { id: "r47", leietaker: "Demokunde 69", utestaende: 109437, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 109437, antallLinjer: 1, underInkasso: true }] },
  { id: "r48", leietaker: "Demokunde 70", utestaende: 99292.64, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 73250.85, antallLinjer: 1 }, { selskap: "Mustad Eiendomsdrift AS", belop: 26041.79, antallLinjer: 1 }] },
  { id: "r49", leietaker: "Demokunde 71", utestaende: 97369.53, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 79400.89, antallLinjer: 1 }, { selskap: "CC Vest Stormarked AS", belop: 17968.64, antallLinjer: 1 }] },
  { id: "r50", leietaker: "Demokunde 72", utestaende: 97359.33, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 85145.79, antallLinjer: 2 }, { selskap: "Mustad Eiendomsdrift AS", belop: 12213.54, antallLinjer: 1 }] },
  { id: "r51", leietaker: "Demokunde 73", utestaende: 94479.18, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 72500, antallLinjer: 3 }, { selskap: "Mustad Eiendomsdrift AS", belop: 21979.18, antallLinjer: 2, underInkasso: true }] },
  { id: "r52", leietaker: "Demokunde 74", utestaende: 87706.46, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 62429.53, antallLinjer: 2 }, { selskap: "CC Vest Stormarked AS", belop: 25276.93, antallLinjer: 1 }] },
  { id: "r53", leietaker: "Demokunde 75", utestaende: 87109.97, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 60875.59, antallLinjer: 2 }, { selskap: "Mustad Eiendomsdrift AS", belop: 26234.38, antallLinjer: 2 }] },
  { id: "r54", leietaker: "Demokunde 76", utestaende: 79895.08, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 57168.38, antallLinjer: 1 }, { selskap: "Mustad Eiendomsdrift AS", belop: 22726.7, antallLinjer: 1 }] },
  { id: "r55", leietaker: "Demokunde 77", utestaende: 78750, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 78750, antallLinjer: 3, underInkasso: true }] },
  { id: "r56", leietaker: "Demokunde 1", utestaende: 78171.74, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 78171.74, antallLinjer: 2, underInkasso: true }] },
  { id: "r57", leietaker: "Demokunde 78", utestaende: 78070, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 78070, antallLinjer: 3, underInkasso: true }] },
  { id: "r58", leietaker: "Demokunde 79", utestaende: 72482.1, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 72482.1, antallLinjer: 6 }] },
  { id: "r59", leietaker: "Demokunde 80", utestaende: 70000, selskaper: [{ selskap: "Mustadboliger AS", belop: 70000, antallLinjer: 2, underInkasso: true }] },
  { id: "r60", leietaker: "Demokunde 81", utestaende: 69819.06, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 45254.14, antallLinjer: 1 }, { selskap: "Mustad Eiendomsdrift AS", belop: 17320.75, antallLinjer: 1 }, { selskap: "Lilleaker Service AS", belop: 7244.17, antallLinjer: 2 }] },
  { id: "r61", leietaker: "Demokunde 82", utestaende: 62216.73, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 40226.24, antallLinjer: 1 }, { selskap: "CC Vest Stormarked AS", belop: 21990.49, antallLinjer: 1 }] },
  { id: "r62", leietaker: "Demokunde 83", utestaende: 61500, selskaper: [{ selskap: "Lilleaker Service AS", belop: 61500, antallLinjer: 1, underInkasso: true }] },
  { id: "r63", leietaker: "Demokunde 84", utestaende: 59551.23, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 41171.23, antallLinjer: 12, underInkasso: true }, { selskap: "Lilleaker Sentrum AS", belop: 18380, antallLinjer: 2, underInkasso: true }] },
  { id: "r64", leietaker: "Demokunde 85", utestaende: 53412.08, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 53412.08, antallLinjer: 1, underInkasso: true }] },
  { id: "r65", leietaker: "Demokunde 86", utestaende: 52543.38, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 47496.26, antallLinjer: 3, underInkasso: true }, { selskap: "Mustad Eiendomsdrift AS", belop: 5047.12, antallLinjer: 2, underInkasso: true }] },
  { id: "r66", leietaker: "Demokunde 24", utestaende: 51562.23, selskaper: [{ selskap: "Lilleaker Service AS", belop: 33333.34, antallLinjer: 1, underInkasso: true }, { selskap: "Mustad Eiendomsdrift AS", belop: 18228.89, antallLinjer: 1, underInkasso: true }] },
  { id: "r67", leietaker: "Demokunde 87", utestaende: 50252.92, selskaper: [{ selskap: "Strandveien 4-8 AS", belop: 32492.5, antallLinjer: 2 }, { selskap: "Mustad Eiendomsdrift AS", belop: 17760.42, antallLinjer: 2, underInkasso: true }] },
  { id: "r68", leietaker: "Demokunde 88", utestaende: 42810, selskaper: [{ selskap: "CC Vest Stormarked AS", belop: 42810, antallLinjer: 2, underInkasso: true }] },
  { id: "r69", leietaker: "Demokunde 89", utestaende: 42777.22, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 42777.22, antallLinjer: 1 }] },
  { id: "r70", leietaker: "Demokunde 90", utestaende: 41464.78, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 41464.78, antallLinjer: 2 }] },
  { id: "r71", leietaker: "Demokunde 91", utestaende: 40773.92, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 37523.92, antallLinjer: 16, underInkasso: true }, { selskap: "Lilleaker Service AS", belop: 3250, antallLinjer: 2, underInkasso: true }] },
  { id: "r72", leietaker: "Demokunde 92", utestaende: 40000, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 40000, antallLinjer: 3 }] },
  { id: "r73", leietaker: "Demokunde 93", utestaende: 39019.04, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 39019.04, antallLinjer: 1, underInkasso: true }] },
  { id: "r74", leietaker: "Demokunde 94", utestaende: 38862, selskaper: [{ selskap: "Lilleaker Service AS", belop: 38862, antallLinjer: 1 }] },
  { id: "r75", leietaker: "Demokunde 95", utestaende: 38480.29, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 38480.29, antallLinjer: 7, underInkasso: true }] },
  { id: "r76", leietaker: "Demokunde 96", utestaende: 37500, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 37500, antallLinjer: 1 }] },
  { id: "r77", leietaker: "Demokunde 97", utestaende: 35410.6, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 35410.6, antallLinjer: 1 }] },
  { id: "r78", leietaker: "Demokunde 98", utestaende: 34500, selskaper: [{ selskap: "Lilleaker Service AS", belop: 34500, antallLinjer: 4, underInkasso: true }] },
  { id: "r79", leietaker: "Demokunde 99", utestaende: 34309.35, selskaper: [{ selskap: "Mustadboliger AS", belop: 34309.35, antallLinjer: 4, underInkasso: true }] },
  { id: "r80", leietaker: "Demokunde 100", utestaende: 33677, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 33677, antallLinjer: 1, underInkasso: true }] },
  { id: "r81", leietaker: "Demokunde 101", utestaende: 31455, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 29250, antallLinjer: 1 }, { selskap: "Lilleaker Service AS", belop: 2205, antallLinjer: 1 }] },
  { id: "r82", leietaker: "Demokunde 102", utestaende: 30453.61, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 30453.61, antallLinjer: 2, underInkasso: true }] },
  { id: "r83", leietaker: "Demokunde 103", utestaende: 29446.88, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 29296.88, antallLinjer: 2, underInkasso: true }, { selskap: "Lilleaker Service AS", belop: 150, antallLinjer: 1 }] },
  { id: "r84", leietaker: "Demokunde 104", utestaende: 27942.48, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 27942.48, antallLinjer: 2 }] },
  { id: "r85", leietaker: "Demokunde 105", utestaende: 27807.84, selskaper: [{ selskap: "Strandveien 4-8 AS", belop: 23950.33, antallLinjer: 1 }, { selskap: "Mustad Eiendomsdrift AS", belop: 3857.51, antallLinjer: 1 }] },
  { id: "r86", leietaker: "Demokunde 106", utestaende: 26029.76, selskaper: [{ selskap: "Strandveien 4-8 AS", belop: 26029.76, antallLinjer: 1 }] },
  { id: "r87", leietaker: "Demokunde 107", utestaende: 25460, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 25000, antallLinjer: 2 }, { selskap: "Lilleaker Service AS", belop: 460, antallLinjer: 1 }] },
  { id: "r88", leietaker: "Demokunde 108", utestaende: 24388.71, selskaper: [{ selskap: "Lilleaker Service AS", belop: 21781.21, antallLinjer: 1 }, { selskap: "Mustad Eiendomsdrift AS", belop: 2607.5, antallLinjer: 1 }] },
  { id: "r89", leietaker: "Demokunde 109", utestaende: 24386.89, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 24386.89, antallLinjer: 1 }] },
  { id: "r90", leietaker: "Demokunde 110", utestaende: 24369.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 12444.5, antallLinjer: 1 }, { selskap: "Mustad Eiendom AS", belop: 11925, antallLinjer: 2 }] },
  { id: "r91", leietaker: "Demokunde 111", utestaende: 24000.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 24000, antallLinjer: 1, underInkasso: true }, { selskap: "Mustad Eiendomsdrift AS", belop: 0.5, antallLinjer: 1, underInkasso: true }] },
  { id: "r92", leietaker: "Demokunde 112", utestaende: 23810.61, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 23810.61, antallLinjer: 3 }] },
  { id: "r93", leietaker: "Demokunde 113", utestaende: 23647.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 23647.5, antallLinjer: 1 }] },
  { id: "r94", leietaker: "Demokunde 114", utestaende: 23647.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 23647.5, antallLinjer: 1 }] },
  { id: "r95", leietaker: "Demokunde 115", utestaende: 23647.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 23647.5, antallLinjer: 1 }] },
  { id: "r96", leietaker: "Demokunde 116", utestaende: 23647.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 23647.5, antallLinjer: 1 }] },
  { id: "r97", leietaker: "Demokunde 7", utestaende: 23000, selskaper: [{ selskap: "Mustadboliger AS", belop: 23000, antallLinjer: 1 }] },
  { id: "r98", leietaker: "Demokunde 117", utestaende: 22779.2, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 22779.2, antallLinjer: 1 }] },
  { id: "r99", leietaker: "Demokunde 118", utestaende: 22427, selskaper: [{ selskap: "CC Vest Stormarked AS", belop: 22427, antallLinjer: 1 }] },
  { id: "r100", leietaker: "Demokunde 119", utestaende: 21785.88, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 16699.6, antallLinjer: 1 }, { selskap: "CC Vest Stormarked AS", belop: 5086.28, antallLinjer: 1 }] },
  { id: "r101", leietaker: "Demokunde 120", utestaende: 21723.71, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 21723.71, antallLinjer: 1, underInkasso: true }] },
  { id: "r102", leietaker: "Demokunde 121", utestaende: 21284.25, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 21284.25, antallLinjer: 6, underInkasso: true }] },
  { id: "r103", leietaker: "Demokunde 21", utestaende: 20916.96, selskaper: [{ selskap: "Mustadboliger AS", belop: 20916.96, antallLinjer: 2, underInkasso: true }] },
  { id: "r104", leietaker: "Demokunde 122", utestaende: 20742, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 20742, antallLinjer: 2, underInkasso: true }] },
  { id: "r105", leietaker: "Demokunde 123", utestaende: 20554.93, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 20554.93, antallLinjer: 1, underInkasso: true }] },
  { id: "r106", leietaker: "Demokunde 124", utestaende: 20362.86, selskaper: [{ selskap: "CC Vest Stormarked AS", belop: 18750.71, antallLinjer: 1, underInkasso: true }, { selskap: "Mustad Eiendom AS", belop: 1612.15, antallLinjer: 2, underInkasso: true }] },
  { id: "r107", leietaker: "Demokunde 125", utestaende: 19943.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 19943.5, antallLinjer: 1 }] },
  { id: "r108", leietaker: "Demokunde 126", utestaende: 19446.88, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 19446.88, antallLinjer: 1, underInkasso: true }] },
  { id: "r109", leietaker: "Demokunde 127", utestaende: 18824.64, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 18824.64, antallLinjer: 2, underInkasso: true }] },
  { id: "r110", leietaker: "Demokunde 128", utestaende: 18793.4, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 10858.4, antallLinjer: 1, underInkasso: true }, { selskap: "Lilleaker Service AS", belop: 7935, antallLinjer: 1 }] },
  { id: "r111", leietaker: "Demokunde 129", utestaende: 18455.94, selskaper: [{ selskap: "Strandveien 4-8 AS", belop: 18455.94, antallLinjer: 1 }] },
  { id: "r112", leietaker: "Demokunde 130", utestaende: 18040.02, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 13340.96, antallLinjer: 1 }, { selskap: "CC Vest Stormarked AS", belop: 4699.06, antallLinjer: 1 }] },
  { id: "r113", leietaker: "Demokunde 131", utestaende: 17812.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 17812.5, antallLinjer: 1, underInkasso: true }] },
  { id: "r114", leietaker: "Demokunde 132", utestaende: 17705.54, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 17705.54, antallLinjer: 1, underInkasso: true }] },
  { id: "r115", leietaker: "Demokunde 133", utestaende: 17500, selskaper: [{ selskap: "Mustadboliger AS", belop: 17500, antallLinjer: 1 }] },
  { id: "r116", leietaker: "Demokunde 134", utestaende: 17000, selskaper: [{ selskap: "Mustadboliger AS", belop: 17000, antallLinjer: 1 }] },
  { id: "r117", leietaker: "Demokunde 135", utestaende: 17000, selskaper: [{ selskap: "Mustadboliger AS", belop: 17000, antallLinjer: 1 }] },
  { id: "r118", leietaker: "Demokunde 136", utestaende: 17000, selskaper: [{ selskap: "Mustadboliger AS", belop: 17000, antallLinjer: 1 }] },
  { id: "r119", leietaker: "Demokunde 137", utestaende: 16623.22, selskaper: [{ selskap: "Mustadboliger AS", belop: 16623.22, antallLinjer: 1 }] },
  { id: "r120", leietaker: "Demokunde 138", utestaende: 16600.13, selskaper: [{ selskap: "Mustadboliger AS", belop: 16600.13, antallLinjer: 2 }] },
  { id: "r121", leietaker: "Demokunde 139", utestaende: 16598.35, selskaper: [{ selskap: "Mustadboliger AS", belop: 16598.35, antallLinjer: 1 }] },
  { id: "r122", leietaker: "Demokunde 140", utestaende: 16585.95, selskaper: [{ selskap: "Mustadboliger AS", belop: 16585.95, antallLinjer: 1 }] },
  { id: "r123", leietaker: "Demokunde 141", utestaende: 16522.31, selskaper: [{ selskap: "CC Vest Stormarked AS", belop: 16522.31, antallLinjer: 2 }] },
  { id: "r124", leietaker: "Demokunde 142", utestaende: 16442.74, selskaper: [{ selskap: "Mustadboliger AS", belop: 16442.74, antallLinjer: 1 }] },
  { id: "r125", leietaker: "Demokunde 143", utestaende: 16012.9, selskaper: [{ selskap: "Mustadboliger AS", belop: 16012.9, antallLinjer: 2 }] },
  { id: "r126", leietaker: "Demokunde 144", utestaende: 15800, selskaper: [{ selskap: "Mustadboliger AS", belop: 15800, antallLinjer: 1 }] },
  { id: "r127", leietaker: "Demokunde 145", utestaende: 15690.08, selskaper: [{ selskap: "Mustadboliger AS", belop: 15690.08, antallLinjer: 1 }] },
  { id: "r128", leietaker: "Demokunde 146", utestaende: 15000, selskaper: [{ selskap: "Mustadboliger AS", belop: 15000, antallLinjer: 1 }] },
  { id: "r129", leietaker: "Demokunde 147", utestaende: 14650, selskaper: [{ selskap: "Mustadboliger AS", belop: 14650, antallLinjer: 1 }] },
  { id: "r130", leietaker: "Demokunde 20", utestaende: 14298.97, selskaper: [{ selskap: "Mustadboliger AS", belop: 14298.97, antallLinjer: 2 }] },
  { id: "r131", leietaker: "Demokunde 148", utestaende: 13750, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 13750, antallLinjer: 6, underInkasso: true }] },
  { id: "r132", leietaker: "Demokunde 149", utestaende: 13006.35, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 13006.35, antallLinjer: 1 }] },
  { id: "r133", leietaker: "Demokunde 150", utestaende: 12861.65, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 12861.65, antallLinjer: 2, underInkasso: true }] },
  { id: "r134", leietaker: "Demokunde 151", utestaende: 12421.46, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 12421.46, antallLinjer: 1, underInkasso: true }] },
  { id: "r135", leietaker: "Demokunde 152", utestaende: 12062.5, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 12062.5, antallLinjer: 1, underInkasso: true }] },
  { id: "r136", leietaker: "Demokunde 153", utestaende: 10721.6, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 10721.6, antallLinjer: 2 }] },
  { id: "r137", leietaker: "Demokunde 154", utestaende: 10708.38, selskaper: [{ selskap: "Mustadboliger AS", belop: 10708.38, antallLinjer: 1 }] },
  { id: "r138", leietaker: "Demokunde 155", utestaende: 10611.75, selskaper: [{ selskap: "Lilleaker Service AS", belop: 10611.75, antallLinjer: 1 }] },
  { id: "r139", leietaker: "Demokunde 156", utestaende: 9815.4, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 9815.4, antallLinjer: 2, underInkasso: true }] },
  { id: "r140", leietaker: "Demokunde 157", utestaende: 9313.52, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 5281.66, antallLinjer: 1, underInkasso: true }, { selskap: "Mustad Eiendom AS", belop: 4031.86, antallLinjer: 2 }] },
  { id: "r141", leietaker: "Demokunde 158", utestaende: 9265.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 9265.5, antallLinjer: 1 }] },
  { id: "r142", leietaker: "Demokunde 159", utestaende: 9181, selskaper: [{ selskap: "Lilleaker Service AS", belop: 9181, antallLinjer: 1 }] },
  { id: "r143", leietaker: "Demokunde 160", utestaende: 9150, selskaper: [{ selskap: "CC Vest Stormarked AS", belop: 9150, antallLinjer: 1, underInkasso: true }] },
  { id: "r144", leietaker: "Demokunde 161", utestaende: 8437.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 8437.5, antallLinjer: 2, underInkasso: true }] },
  { id: "r145", leietaker: "Demokunde 162", utestaende: 8012.84, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 8012.84, antallLinjer: 1 }] },
  { id: "r146", leietaker: "Demokunde 163", utestaende: 7332, selskaper: [{ selskap: "Lilleaker Service AS", belop: 7332, antallLinjer: 2, underInkasso: true }] },
  { id: "r147", leietaker: "Demokunde 18", utestaende: 7143.2, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 5070.94, antallLinjer: 13, underInkasso: true }, { selskap: "Mustad Eiendomsdrift AS", belop: 2072.26, antallLinjer: 8, underInkasso: true }] },
  { id: "r148", leietaker: "Demokunde 164", utestaende: 6955.5, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 4780.5, antallLinjer: 1, underInkasso: true }, { selskap: "Lilleaker Service AS", belop: 2175, antallLinjer: 1 }] },
  { id: "r149", leietaker: "Demokunde 165", utestaende: 6589.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 6589.5, antallLinjer: 1 }] },
  { id: "r150", leietaker: "Demokunde 166", utestaende: 6547, selskaper: [{ selskap: "Lilleaker Service AS", belop: 6547, antallLinjer: 1 }] },
  { id: "r151", leietaker: "Demokunde 167", utestaende: 6309, selskaper: [{ selskap: "Lilleaker Service AS", belop: 6309, antallLinjer: 1 }] },
  { id: "r152", leietaker: "Demokunde 168", utestaende: 5800, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 5800, antallLinjer: 1 }] },
  { id: "r153", leietaker: "Demokunde 169", utestaende: 5704.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 5704.5, antallLinjer: 1 }] },
  { id: "r154", leietaker: "Demokunde 170", utestaende: 5520.15, selskaper: [{ selskap: "Lilleakerveien 32B AS", belop: 5520.15, antallLinjer: 1 }] },
  { id: "r155", leietaker: "Demokunde 171", utestaende: 5519, selskaper: [{ selskap: "Lilleaker Service AS", belop: 5519, antallLinjer: 1 }] },
  { id: "r156", leietaker: "Demokunde 172", utestaende: 5469, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 5469, antallLinjer: 3 }] },
  { id: "r157", leietaker: "Demokunde 173", utestaende: 5281, selskaper: [{ selskap: "Lilleaker Service AS", belop: 5281, antallLinjer: 1 }] },
  { id: "r158", leietaker: "Demokunde 174", utestaende: 5238, selskaper: [{ selskap: "Lilleaker Service AS", belop: 5238, antallLinjer: 1 }] },
  { id: "r159", leietaker: "Demokunde 175", utestaende: 4812, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 3594, antallLinjer: 1, underInkasso: true }, { selskap: "Lilleaker Service AS", belop: 1218, antallLinjer: 1 }] },
  { id: "r160", leietaker: "Demokunde 176", utestaende: 4720.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 4720.5, antallLinjer: 1 }] },
  { id: "r161", leietaker: "Demokunde 177", utestaende: 4687.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 4687.5, antallLinjer: 1, underInkasso: true }] },
  { id: "r162", leietaker: "Demokunde 178", utestaende: 4167.24, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 4167.24, antallLinjer: 1, underInkasso: true }] },
  { id: "r163", leietaker: "Demokunde 179", utestaende: 4150, selskaper: [{ selskap: "Lilleaker Service AS", belop: 4150, antallLinjer: 1 }] },
  { id: "r164", leietaker: "Demokunde 180", utestaende: 3828.1, selskaper: [{ selskap: "Lilleaker Service AS", belop: 3828.1, antallLinjer: 2 }] },
  { id: "r165", leietaker: "Demokunde 181", utestaende: 3784, selskaper: [{ selskap: "Lilleaker Service AS", belop: 3784, antallLinjer: 1 }] },
  { id: "r166", leietaker: "Demokunde 182", utestaende: 3724, selskaper: [{ selskap: "Lilleaker Service AS", belop: 3724, antallLinjer: 1 }] },
  { id: "r167", leietaker: "Demokunde 183", utestaende: 3616, selskaper: [{ selskap: "Lilleaker Service AS", belop: 2636, antallLinjer: 1 }, { selskap: "Mustad Eiendomsdrift AS", belop: 980, antallLinjer: 1 }] },
  { id: "r168", leietaker: "Demokunde 184", utestaende: 3577.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 3577.5, antallLinjer: 1 }] },
  { id: "r169", leietaker: "Demokunde 185", utestaende: 3521, selskaper: [{ selskap: "Lilleaker Service AS", belop: 3521, antallLinjer: 1 }] },
  { id: "r170", leietaker: "Demokunde 186", utestaende: 3262.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 3262.5, antallLinjer: 1 }] },
  { id: "r171", leietaker: "Demokunde 187", utestaende: 2854, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 2854, antallLinjer: 1 }] },
  { id: "r172", leietaker: "Demokunde 188", utestaende: 2723, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 2723, antallLinjer: 1, underInkasso: true }] },
  { id: "r173", leietaker: "Demokunde 189", utestaende: 2644, selskaper: [{ selskap: "Lilleaker Service AS", belop: 2644, antallLinjer: 2, underInkasso: true }] },
  { id: "r174", leietaker: "Demokunde 190", utestaende: 2542.17, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 2429.67, antallLinjer: 1, underInkasso: true }, { selskap: "Lilleaker Service AS", belop: 112, antallLinjer: 1 }, { selskap: "Mustad Eiendomsdrift AS", belop: 0.5, antallLinjer: 1, underInkasso: true }] },
  { id: "r175", leietaker: "Demokunde 191", utestaende: 2416, selskaper: [{ selskap: "Lilleaker Service AS", belop: 2416, antallLinjer: 1, underInkasso: true }] },
  { id: "r176", leietaker: "Demokunde 192", utestaende: 2381.84, selskaper: [{ selskap: "Lilleaker Service AS", belop: 2381.48, antallLinjer: 1 }, { selskap: "Mustad Eiendomsdrift AS", belop: 0.36, antallLinjer: 1 }] },
  { id: "r177", leietaker: "Demokunde 193", utestaende: 2292.97, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 2292.97, antallLinjer: 3, underInkasso: true }] },
  { id: "r178", leietaker: "Demokunde 194", utestaende: 2283, selskaper: [{ selskap: "Lilleaker Service AS", belop: 2283, antallLinjer: 1 }] },
  { id: "r179", leietaker: "Demokunde 195", utestaende: 2187.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 2187.5, antallLinjer: 1, underInkasso: true }] },
  { id: "r180", leietaker: "Demokunde 196", utestaende: 2139, selskaper: [{ selskap: "Lilleaker Service AS", belop: 2139, antallLinjer: 1 }] },
  { id: "r181", leietaker: "Demokunde 197", utestaende: 1821, selskaper: [{ selskap: "Lilleaker Service AS", belop: 1821, antallLinjer: 1 }] },
  { id: "r182", leietaker: "Demokunde 198", utestaende: 1797, selskaper: [{ selskap: "Lilleaker Service AS", belop: 1797, antallLinjer: 2, underInkasso: true }] },
  { id: "r183", leietaker: "Demokunde 199", utestaende: 1635, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 1635, antallLinjer: 1, underInkasso: true }] },
  { id: "r184", leietaker: "Demokunde 200", utestaende: 1622, selskaper: [{ selskap: "Lilleaker Service AS", belop: 1622, antallLinjer: 1 }] },
  { id: "r185", leietaker: "Demokunde 201", utestaende: 1596.75, selskaper: [{ selskap: "Lilleaker Service AS", belop: 1596.75, antallLinjer: 1 }] },
  { id: "r186", leietaker: "Demokunde 202", utestaende: 1582.15, selskaper: [{ selskap: "Lilleaker Service AS", belop: 1582.15, antallLinjer: 2, underInkasso: true }] },
  { id: "r187", leietaker: "Demokunde 203", utestaende: 1568.8, selskaper: [{ selskap: "CC Vest Stormarked AS", belop: 1568.8, antallLinjer: 1, underInkasso: true }] },
  { id: "r188", leietaker: "Demokunde 204", utestaende: 1260, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 1260, antallLinjer: 1, underInkasso: true }] },
  { id: "r189", leietaker: "Demokunde 205", utestaende: 1038, selskaper: [{ selskap: "Lilleaker Service AS", belop: 1038, antallLinjer: 1 }] },
  { id: "r190", leietaker: "Demokunde 206", utestaende: 1008, selskaper: [{ selskap: "Lilleaker Service AS", belop: 1008, antallLinjer: 1 }] },
  { id: "r191", leietaker: "Demokunde 207", utestaende: 984.9, selskaper: [{ selskap: "Lilleaker Service AS", belop: 984.9, antallLinjer: 1 }] },
  { id: "r192", leietaker: "Demokunde 208", utestaende: 897, selskaper: [{ selskap: "Lilleaker Service AS", belop: 897, antallLinjer: 1 }] },
  { id: "r193", leietaker: "Demokunde 209", utestaende: 828.13, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 828.13, antallLinjer: 1 }] },
  { id: "r194", leietaker: "Demokunde 210", utestaende: 665, selskaper: [{ selskap: "Lilleaker Service AS", belop: 665, antallLinjer: 1 }] },
  { id: "r195", leietaker: "Demokunde 211", utestaende: 406, selskaper: [{ selskap: "Lilleaker Service AS", belop: 406, antallLinjer: 1 }] },
  { id: "r196", leietaker: "Demokunde 212", utestaende: 400.33, selskaper: [{ selskap: "CC Vest Stormarked AS", belop: 400.33, antallLinjer: 1, underInkasso: true }] },
  { id: "r197", leietaker: "Demokunde 213", utestaende: 354.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 354.5, antallLinjer: 1 }] },
  { id: "r198", leietaker: "Demokunde 214", utestaende: 306, selskaper: [{ selskap: "Lilleaker Service AS", belop: 306, antallLinjer: 1 }] },
  { id: "r199", leietaker: "Demokunde 215", utestaende: 135, selskaper: [{ selskap: "Lilleaker Service AS", belop: 135, antallLinjer: 1 }] },
  { id: "r200", leietaker: "Demokunde 216", utestaende: 81, selskaper: [{ selskap: "Lilleaker Service AS", belop: 81, antallLinjer: 1 }] },
  { id: "r201", leietaker: "Demokunde 217", utestaende: 50, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 50, antallLinjer: 1 }] },
  { id: "r202", leietaker: "Demokunde 218", utestaende: 0.09, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 0.09, antallLinjer: 1 }] },
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
 * opptrer flere steder (Demokunde 1, 10, 13 — se lib/widgets.local.ts for hvilken ekte leietaker
 * hvert nummer tilsvarer; navnene skal IKKE stå i denne filen). "kontraktsutløp" er LINJENS
 * sluttdato, ikke kontraktens. Rene "leiefritak"-linjer er filtrert bort (2 linjer, hver eneste
 * linje for sin leietaker, fjernet 2026-08-12 — derfor "hopper" Demokunde-nummereringen over 17 og
 * 28). `status`/`statusKilde` er et manuelt kryssreferert øyeblikksbilde (Fazile
 * `reforhandlet`-flagg + Salesforce Case/Prosjekt-søk 2026-08-12), IKKE en live sjekk — se
 * AGENTS.md-historikk for research-grunnlaget. `ExpiringTenant.bygg` er leietakerens HOVEDBYGG
 * (bygget knyttet til kontor-/husleielinjen, ikke en kommaseparert liste over alle bygg) —
 * leietakere med linjer i flere bygg viser de andre byggene per linje i `ExpiringLine.bygg` i stedet.
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
  const antallUnderInkasso = RECEIVABLES.filter((r) => r.selskaper.some((s) => s.underInkasso)).length;
  lines.push(
    `\nKUNDEFORDRINGER (ekte, fra Visma Business NXT, ALLE 22 Mustad-selskaper): ${formatKr(totalFordringer)} totalt utestående fordelt på ${RECEIVABLES.length} leietakere, hvorav ${antallUnderInkasso} har minst én åpen post under purring/inkasso. Topp 10 størst:`,
  );
  for (const r of RECEIVABLES.slice(0, 10)) {
    const perSelskap = r.selskaper.map((s) => `${s.selskap}: ${formatKr(s.belop)}`).join(", ");
    lines.push(`- ${r.leietaker}: ${formatKr(r.utestaende)} totalt (${perSelskap})`);
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
