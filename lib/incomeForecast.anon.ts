import type { IncomeForecastPart } from "./incomeForecastManual";

// Egen formatKr her (ikke import fra ./widgets) for å unngå sirkulær import:
// widgets.local.ts kaller buildIncomeForecastContext() herfra via lib/incomeForecast.ts.
function formatKr(n: number): string {
  return `${n.toLocaleString("nb-NO")} kr`;
}

export interface InvoicedPeriodTotal {
  periode: string; // "YYYY-MM"
  delA: number; // netto fakturert leie (3600-3699 ekskl. 3640/41/42)
  delB: number; // netto fakturert parkering (3640/41/42)
}

export interface InvoicedSnapshot {
  sistOppdatert: string; // "YYYY-MM-DD"
  ar: number;
  periods: InvoicedPeriodTotal[];
}

// Kilde: Visma Business NXT, generalLedgerPeriodBalance (accountNo 3600-3699 ekskl.
// 3640/41/42 = Del A leie, 3640-3642 = Del B parkering), aggregert per periode 1-8
// (jan-aug, periode 8 delvis siden dagens dato er 2026-08-14), summert over alle
// 22 Mustad-selskaper. Selskapsnivå-totaler, ingen leietaker-identifiserende data
// her — samme reelle tall som i .local.ts, se der for full metodikk-kommentar.
export const INVOICED: InvoicedSnapshot = {
  sistOppdatert: "2026-08-14",
  ar: 2026,
  periods: [
    { periode: "2026-01", delA: 154311013, delB: 13116314 },
    { periode: "2026-02", delA: 9071947, delB: 290250 },
    { periode: "2026-03", delA: 2951922, delB: 111299 },
    { periode: "2026-04", delA: 182432604, delB: 14235646 },
    { periode: "2026-05", delA: -5202894, delB: 870658 },
    { periode: "2026-06", delA: 13087349, delB: 1113836 },
    { periode: "2026-07", delA: 169688044, delB: 12527989 },
    { periode: "2026-08", delA: 5275689, delB: 157037 },
  ],
};

export type RenewalCertainty = "sikker" | "usikker";

export interface RemainingContractLine {
  linjeId: number;
  beskrivelse: string;
  del: IncomeForecastPart;
  leietype: "RENT" | "DISCOUNT" | "CUSTOM_PARKERING";
  periodeFra: string;
  periodeTil: string; // reell kontraktsslutt, ELLER 31.12 hvis fornyelsesregelen er brukt
  belopGjenstaende: number;
  sikkerhet: RenewalCertainty;
  fornyelseAntatt: boolean; // true kun når sikkerhet === "usikker" via fornyelsesregelen
  originalSluttdato?: string; // linjens faktiske kontraktsslutt før antatt forlengelse
  nyKontraktsnokkel?: string; // satt når en reell signert etterfølgerkontrakt finnes
  nyKontraktStart?: string;
}

export interface RemainingTenantGroup {
  leietaker: string;
  customerId: number;
  bygg: string;
  lines: RemainingContractLine[];
}

export interface RemainingSnapshot {
  sistOppdatert: string;
  ar: number;
  sikkerTotalDelA: number;
  sikkerTotalDelB: number;
  tenants: RemainingTenantGroup[];
}

// Se lib/incomeForecast.local.ts for full metodikk-kommentar. leietaker anonymisert til
// "Demokunde N" (gjenbrukt fra RECEIVABLES/CONTRACTS-krysskoblingen der navnet finnes fra
// før, ellers nye numre 278-293). bygg er reelle Mustad-seksjonsnavn (ikke sensitivt).
export const REMAINING: RemainingSnapshot = {
  sistOppdatert: "2026-08-14",
  ar: 2026,
  sikkerTotalDelA: 263196663,
  sikkerTotalDelB: 10190166,
  tenants: [
  { leietaker: "Demokunde 22", customerId: 9001, bygg: "Arnstein Arnebergsvei 4", lines: [
      { linjeId: 1, beskrivelse: "Kontrakt 82418", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 106528, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-31" }
  ] },
  { leietaker: "Demokunde 242", customerId: 9002, bygg: "Gamle Drammensvei 10", lines: [
      { linjeId: 2, beskrivelse: "Kontrakt 101943", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 45699, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-31" }
  ] },
  { leietaker: "Demokunde 21", customerId: 9003, bygg: "Gamle Drammensvei 10", lines: [
      { linjeId: 3, beskrivelse: "Kontrakt 82422", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 70211, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-31" }
  ] },
  { leietaker: "Demokunde 20", customerId: 9004, bygg: "Gamle Drammensvei 10", lines: [
      { linjeId: 4, beskrivelse: "Kontrakt 121658", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 65344, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-31" }
  ] },
  { leietaker: "Demokunde 278", customerId: 9005, bygg: "Lilleakerveien 16", lines: [
      { linjeId: 5, beskrivelse: "Kontrakt 81665", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 1217413, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-11-22" }
  ] },
  { leietaker: "Demokunde 279", customerId: 9006, bygg: "Lilleakerveien 16", lines: [
      { linjeId: 6, beskrivelse: "Kontrakt 81695", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 169750, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-31" }
  ] },
  { leietaker: "Demokunde 69", customerId: 9007, bygg: "Lilleakerveien 16", lines: [
      { linjeId: 7, beskrivelse: "Kontrakt 81708", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 155716, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 280", customerId: 9008, bygg: "Lilleakerveien 16", lines: [
      { linjeId: 8, beskrivelse: "Kontrakt 81711", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 3266, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 260 AS", customerId: 9009, bygg: "Lilleakerveien 16", lines: [
      { linjeId: 9, beskrivelse: "Kontrakt 84683", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 0, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 281", customerId: 9010, bygg: "Lilleakerveien 16", lines: [
      { linjeId: 10, beskrivelse: "Kontrakt 81726", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 8399, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 282", customerId: 9011, bygg: "Lilleakerveien 2 Garasje", lines: [
      { linjeId: 11, beskrivelse: "Kontrakt 81817", del: "B", leietype: "CUSTOM_PARKERING", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 28212, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-31" },
      { linjeId: 12, beskrivelse: "Kontrakt 81817", del: "B", leietype: "CUSTOM_PARKERING", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 18808, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-31" }
  ] },
  { leietaker: "Demokunde 254 AS", customerId: 9012, bygg: "Lilleakerveien 2 Garasje", lines: [
      { linjeId: 13, beskrivelse: "Kontrakt 81820", del: "B", leietype: "CUSTOM_PARKERING", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 9766, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 254 AS", customerId: 9013, bygg: "Lilleakerveien 2A", lines: [
      { linjeId: 14, beskrivelse: "Kontrakt 84853", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 0, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 254 AS", customerId: 9014, bygg: "Lilleakerveien 2C", lines: [
      { linjeId: 15, beskrivelse: "Kontrakt 81889", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 29299, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 282", customerId: 9015, bygg: "Lilleakerveien 2D", lines: [
      { linjeId: 16, beskrivelse: "Kontrakt 81887", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 254557, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-31" },
      { linjeId: 17, beskrivelse: "Kontrakt 81887", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 4314, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-31" }
  ] },
  { leietaker: "Demokunde 283", customerId: 9016, bygg: "Lilleakerveien 2E", lines: [
      { linjeId: 18, beskrivelse: "Kontrakt 81962", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 7616, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 13", customerId: 9017, bygg: "Lilleakerveien 2E", lines: [
      { linjeId: 19, beskrivelse: "Kontrakt 89776", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 38494, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-18" }
  ] },
  { leietaker: "Demokunde 186", customerId: 9018, bygg: "Lilleakerveien 4CDEF Uteparkering", lines: [
      { linjeId: 20, beskrivelse: "Kontrakt 82007", del: "B", leietype: "CUSTOM_PARKERING", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 32988, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-31" }
  ] },
  { leietaker: "Demokunde 24", customerId: 9019, bygg: "Lilleakerveien 6 Uteparkering", lines: [
      { linjeId: 21, beskrivelse: "Kontrakt 82856", del: "B", leietype: "CUSTOM_PARKERING", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 43358, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-31" }
  ] },
  { leietaker: "Demokunde 284", customerId: 9020, bygg: "Lilleakerveien 8", lines: [
      { linjeId: 22, beskrivelse: "Kontrakt 82046", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 699853, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-11-30" },
      { linjeId: 23, beskrivelse: "Kontrakt 82046", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 101047, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-11-30" },
      { linjeId: 24, beskrivelse: "Kontrakt 82046", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 101047, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-11-30" },
      { linjeId: 25, beskrivelse: "Kontrakt 82046", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 23721, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-11-30" }
  ] },
  { leietaker: "Demokunde 285", customerId: 9021, bygg: "Lilleakerveien 8", lines: [
      { linjeId: 26, beskrivelse: "Kontrakt 82062", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 97351, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" },
      { linjeId: 27, beskrivelse: "Kontrakt 82062", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 6882, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 286", customerId: 9022, bygg: "Lilleakerveien 8", lines: [
      { linjeId: 28, beskrivelse: "Kontrakt 82068", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 139492, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-31" }
  ] },
  { leietaker: "Demokunde 163", customerId: 9023, bygg: "Lilleakerveien 8", lines: [
      { linjeId: 29, beskrivelse: "Kontrakt 82071", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 10780, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-31" },
      { linjeId: 30, beskrivelse: "Kontrakt 82070", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 305019, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-31" }
  ] },
  { leietaker: "Demokunde 201", customerId: 9024, bygg: "Lilleakerveien 8", lines: [
      { linjeId: 31, beskrivelse: "Kontrakt 82089", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 297481, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-26" },
      { linjeId: 32, beskrivelse: "Kontrakt 82089", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 10786, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-26" },
      { linjeId: 33, beskrivelse: "Kontrakt 82089", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 38717, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-26" },
      { linjeId: 34, beskrivelse: "Kontrakt 82098", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 10678, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-26" }
  ] },
  { leietaker: "Demokunde 29", customerId: 9025, bygg: "Lilleakerveien 8", lines: [
      { linjeId: 35, beskrivelse: "Kontrakt 122831", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 199932, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-04" },
      { linjeId: 36, beskrivelse: "Kontrakt 131837", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 0, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-04" }
  ] },
  { leietaker: "Demokunde 194", customerId: 9026, bygg: "Lilleakerveien 8 Uteparkering", lines: [
      { linjeId: 37, beskrivelse: "Kontrakt 82050", del: "B", leietype: "CUSTOM_PARKERING", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 31766, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 285", customerId: 9027, bygg: "Lilleakerveien 10", lines: [
      { linjeId: 38, beskrivelse: "Kontrakt 82113", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 10093, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" },
      { linjeId: 39, beskrivelse: "Kontrakt 82113", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 2937, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 215", customerId: 9028, bygg: "Lilleakerveien 10", lines: [
      { linjeId: 40, beskrivelse: "Kontrakt 82115", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 21894, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" },
      { linjeId: 41, beskrivelse: "Kontrakt 82115", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 10756, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" },
      { linjeId: 42, beskrivelse: "Kontrakt 82115", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 10678, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" },
      { linjeId: 43, beskrivelse: "Kontrakt 82115", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 5865, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" },
      { linjeId: 44, beskrivelse: "Kontrakt 82115", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 2881, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" },
      { linjeId: 45, beskrivelse: "Kontrakt 82115", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 2860, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 163", customerId: 9029, bygg: "Lilleakerveien 10", lines: [
      { linjeId: 46, beskrivelse: "Kontrakt 82117", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 10678, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-31" },
      { linjeId: 47, beskrivelse: "Kontrakt 82117", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 9890, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-31" },
      { linjeId: 48, beskrivelse: "Kontrakt 82118", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 9890, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-31" },
      { linjeId: 49, beskrivelse: "Kontrakt 82117", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 39559, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-31" },
      { linjeId: 50, beskrivelse: "Kontrakt 82117", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 2937, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-31" }
  ] },
  { leietaker: "Demokunde 121", customerId: 9030, bygg: "Lilleakerveien 10", lines: [
      { linjeId: 51, beskrivelse: "Kontrakt 82126", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 10079, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 24", customerId: 9031, bygg: "Lilleakerveien 10", lines: [
      { linjeId: 52, beskrivelse: "Kontrakt 82130", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 937507, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-31" },
      { linjeId: 53, beskrivelse: "Kontrakt 82130", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 165247, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-31" },
      { linjeId: 54, beskrivelse: "Kontrakt 82130", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 10085, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-31" }
  ] },
  { leietaker: "Demokunde 260 AS", customerId: 9032, bygg: "Lilleakerveien 14", lines: [
      { linjeId: 55, beskrivelse: "Kontrakt 81612", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 1663241, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 24", customerId: 9033, bygg: "Lilleakerveien 14", lines: [
      { linjeId: 56, beskrivelse: "Kontrakt 81618", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 273946, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-31" }
  ] },
  { leietaker: "Demokunde 260 AS", customerId: 9034, bygg: "Lilleakerveien 14 Uteparkering", lines: [
      { linjeId: 57, beskrivelse: "Kontrakt 81612", del: "B", leietype: "CUSTOM_PARKERING", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 4097, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 1", customerId: 9035, bygg: "Lilleakerveien 31", lines: [
      { linjeId: 58, beskrivelse: "Kontrakt 81556", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 34731, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-31" },
      { linjeId: 59, beskrivelse: "Kontrakt 81556", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 36407, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-31" }
  ] },
  { leietaker: "Demokunde 25", customerId: 9036, bygg: "Lilleakerveien 31", lines: [
      { linjeId: 60, beskrivelse: "Kontrakt 81598", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 35239, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-31" }
  ] },
  { leietaker: "Demokunde 260 AS", customerId: 9037, bygg: "P-Bro mellom LV8 og LV4", lines: [
      { linjeId: 61, beskrivelse: "Kontrakt 91842", del: "B", leietype: "CUSTOM_PARKERING", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 18008, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 286", customerId: 9038, bygg: "P-Bro Uteparkering", lines: [
      { linjeId: 62, beskrivelse: "Kontrakt 82215", del: "B", leietype: "CUSTOM_PARKERING", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 8595, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-31" }
  ] },
  { leietaker: "Demokunde 24", customerId: 9039, bygg: "P-Bro Uteparkering", lines: [
      { linjeId: 63, beskrivelse: "Kontrakt 82223", del: "B", leietype: "CUSTOM_PARKERING", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 6807, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-31" }
  ] },
  { leietaker: "Demokunde 287", customerId: 9040, bygg: "Sponhoggveien 2", lines: [
      { linjeId: 64, beskrivelse: "Kontrakt 82271", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 12087, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 244 AS", customerId: 9041, bygg: "Sponhoggveien 2", lines: [
      { linjeId: 65, beskrivelse: "Kontrakt 82274", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 19193, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 265", customerId: 9042, bygg: "Sponhoggveien 2", lines: [
      { linjeId: 66, beskrivelse: "Kontrakt 82275", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 325475, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" },
      { linjeId: 67, beskrivelse: "Kontrakt 82276", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 288524, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" },
      { linjeId: 68, beskrivelse: "Kontrakt 82275", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 94859, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" },
      { linjeId: 69, beskrivelse: "Kontrakt 82277", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 6043, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" },
      { linjeId: 70, beskrivelse: "Kontrakt 82276", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 40161, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 288", customerId: 9043, bygg: "Sponhoggveien 2", lines: [
      { linjeId: 71, beskrivelse: "Kontrakt 82272", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 6043, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 289", customerId: 9044, bygg: "Sponhoggveien 2", lines: [
      { linjeId: 72, beskrivelse: "Kontrakt 82273", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 6043, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 87", customerId: 9045, bygg: "Strandveien 4-8", lines: [
      { linjeId: 73, beskrivelse: "Kontrakt 82452", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 143494, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-31" },
      { linjeId: 74, beskrivelse: "Kontrakt 82452", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 7760, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-31" }
  ] },
  { leietaker: "Demokunde 129", customerId: 9046, bygg: "Strandveien 4-8", lines: [
      { linjeId: 75, beskrivelse: "Kontrakt 82459", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 22491, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 290", customerId: 9047, bygg: "13-17-19 Uteparkering", lines: [
      { linjeId: 76, beskrivelse: "Kontrakt 82759", del: "B", leietype: "CUSTOM_PARKERING", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 22252, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 291", customerId: 9048, bygg: "13-17-19 Uteparkering", lines: [
      { linjeId: 77, beskrivelse: "Kontrakt 82767", del: "B", leietype: "CUSTOM_PARKERING", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 6112, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 291", customerId: 9049, bygg: "13B", lines: [
      { linjeId: 78, beskrivelse: "Kontrakt 82294", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 64914, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 27", customerId: 9050, bygg: "13B", lines: [
      { linjeId: 79, beskrivelse: "Kontrakt 82306", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 54784, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-31" }
  ] },
  { leietaker: "Demokunde 199", customerId: 9051, bygg: "13B", lines: [
      { linjeId: 80, beskrivelse: "Kontrakt 93557", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 15876, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] },
  { leietaker: "Demokunde 221 AS", customerId: 9052, bygg: "13B", lines: [
      { linjeId: 81, beskrivelse: "Kontrakt 82331", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 72800, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-11-30" },
      { linjeId: 82, beskrivelse: "Kontrakt 82330", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 379166, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-03" }
  ] },
  { leietaker: "Demokunde 221 AS", customerId: 9053, bygg: "13C", lines: [
      { linjeId: 83, beskrivelse: "Kontrakt 82330", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 18173, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-11-30" },
      { linjeId: 84, beskrivelse: "Kontrakt 82330", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 15802, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-11-30" }
  ] },
  { leietaker: "Demokunde 27", customerId: 9054, bygg: "19", lines: [
      { linjeId: 85, beskrivelse: "Kontrakt 82306", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 0, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-31" }
  ] },
  { leietaker: "Demokunde 292", customerId: 9055, bygg: "Vollsveien 13D", lines: [
      { linjeId: 86, beskrivelse: "Kontrakt 82366", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 24412, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-31" }
  ] },
  { leietaker: "Demokunde 293", customerId: 9056, bygg: "Vollsveien 13D", lines: [
      { linjeId: 87, beskrivelse: "Kontrakt 82367", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 3545, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-10-30" }
  ] },
  { leietaker: "Demokunde 26", customerId: 9057, bygg: "Vollsveien 13D", lines: [
      { linjeId: 88, beskrivelse: "Kontrakt 82368", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 8743, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-31" }
  ] },
  { leietaker: "Demokunde 18", customerId: 9058, bygg: "Vollsveien 13D", lines: [
      { linjeId: 89, beskrivelse: "Kontrakt 82373", del: "A", leietype: "RENT", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 953, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-08-30" }
  ] },
  { leietaker: "Demokunde 159", customerId: 9059, bygg: "17-19-21 Uteparkering", lines: [
      { linjeId: 90, beskrivelse: "Kontrakt 82791", del: "B", leietype: "CUSTOM_PARKERING", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 74321, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" },
      { linjeId: 91, beskrivelse: "Kontrakt 82791", del: "B", leietype: "CUSTOM_PARKERING", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 8461, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" },
      { linjeId: 92, beskrivelse: "Kontrakt 82791", del: "B", leietype: "CUSTOM_PARKERING", periodeFra: "2026-08-15", periodeTil: "2026-12-31", belopGjenstaende: 49547, sikkerhet: "usikker", fornyelseAntatt: true, originalSluttdato: "2026-09-30" }
  ] }
  ],
};

export interface ManualNxtVoucher {
  bilagsnr: string;
  dato: string;
  periode: string; // "YYYY-MM"
  konto: string;
  bygg: string;
  del: IncomeForecastPart;
  belop: number;
  kategori: string;
  tekst: string;
}

export interface ManualNxtSnapshot {
  sistOppdatert: string;
  ar: number;
  vouchers: ManualNxtVoucher[];
}

// Se lib/incomeForecast.local.ts for full metodikk-kommentar. Leietakernavn i bilagstekst
// er anonymisert til "Demokunde N" (samme krysskobling som ellers) siden dette er en
// leietaker-identifiserende tekststreng.
export const MANUAL_NXT: ManualNxtSnapshot = {
  sistOppdatert: "2026-08-14",
  ar: 2026,
  vouchers: [
    {
      bilagsnr: "28779-4",
      dato: "2025-12-31",
      periode: "2026-01",
      konto: "3632",
      bygg: "Ukjent (ikke spesifisert i bilagstekst)",
      del: "A",
      belop: -12141099,
      kategori: "Omsetningsleie-avsetning (justering/reversering)",
      tekst: "Avsetning omsetningsleie 2025 iht vedlegg",
    },
    {
      bilagsnr: "29478-6",
      dato: "2026-02-19",
      periode: "2026-03",
      konto: "3640",
      bygg: "CC Vest senter",
      del: "B",
      belop: 15863.2,
      kategori: "Parkering",
      tekst: "CC Vest senter - Parkering avg.pl. 3 pl",
    },
    {
      bilagsnr: "29478-10",
      dato: "2026-02-19",
      periode: "2026-03",
      konto: "3640",
      bygg: "Granfoss Parkering ute",
      del: "B",
      belop: 1538.4,
      kategori: "Parkering",
      tekst: "Granfoss Parkering ute - Parkering avg.pl fri-flyt",
    },
    {
      bilagsnr: "29478-14",
      dato: "2026-02-19",
      periode: "2026-03",
      konto: "3640",
      bygg: "Granfoss Parkering ute",
      del: "B",
      belop: 2167.2,
      kategori: "Parkering",
      tekst: "Granfoss Parkering ute - Parkering avg.pl fri-flyt",
    },
    {
      bilagsnr: "29478-3",
      dato: "2026-02-20",
      periode: "2026-03",
      konto: "3601",
      bygg: "P-Bro",
      del: "A",
      belop: 4140,
      kategori: "Garasje",
      tekst: "P-Bro - Garasje avg.pl. 2 pl",
    },
    {
      bilagsnr: "29478-18",
      dato: "2026-03-01",
      periode: "2026-03",
      konto: "3640",
      bygg: "Granfoss Parkering ute",
      del: "B",
      belop: 2167.2,
      kategori: "Parkering",
      tekst: "Granfoss Parkering ute - Parkering avg.pl fri-flyt",
    },
    {
      bilagsnr: "19644-15",
      dato: "2026-03-31",
      periode: "2026-03",
      konto: "3637",
      bygg: "CC Vest senter",
      del: "A",
      belop: -107142.86,
      kategori: "Tilskudd til leietaker (LTP)",
      tekst: "Tilskudd LTP CC Vest - Demokunde 40",
    },
    {
      bilagsnr: "19644-17",
      dato: "2026-06-30",
      periode: "2026-06",
      konto: "3637",
      bygg: "CC Vest senter",
      del: "A",
      belop: -107142.86,
      kategori: "Tilskudd til leietaker (LTP)",
      tekst: "Tilskudd LTP CC Vest - Demokunde 40",
    },
    {
      bilagsnr: "19644-19",
      dato: "2026-09-30",
      periode: "2026-09",
      konto: "3637",
      bygg: "CC Vest senter",
      del: "A",
      belop: -107142.86,
      kategori: "Tilskudd til leietaker (LTP) - forhåndsbokført",
      tekst: "Tilskudd LTP CC Vest - Demokunde 40",
    },
    {
      bilagsnr: "19644-21",
      dato: "2026-12-31",
      periode: "2026-12",
      konto: "3637",
      bygg: "CC Vest senter",
      del: "A",
      belop: -107142.86,
      kategori: "Tilskudd til leietaker (LTP) - forhåndsbokført",
      tekst: "Tilskudd LTP CC Vest - Demokunde 40",
    },
  ],
};

export interface BookedAccountRangeBuildingTotal {
  bygg: string;
  belop: number;
}

export interface BookedAccountRangeCompanyTotal {
  selskap: string;
  belop: number;
  bygg: BookedAccountRangeBuildingTotal[];
}

export interface BookedAccountRangeSnapshot {
  sistOppdatert: string;
  ar: number;
  kontoFra: number;
  kontoTil: number;
  totalBelop: number;
  perSelskap: BookedAccountRangeCompanyTotal[];
}

// Bygg-/selskapsnavn, ikke leietaker-identifiserende - identisk med .local.ts, ingen
// anonymisering nødvendig. Se lib/incomeForecast.local.ts for full metodikk-kommentar.
export const BOOKED_3600_3699: BookedAccountRangeSnapshot = {
  sistOppdatert: "2026-08-24",
  ar: 2026,
  kontoFra: 3600,
  kontoTil: 3699,
  totalBelop: 577808364.82,
  perSelskap: [
    {
      selskap: "Mustad Eiendom AS",
      belop: 457603880.39,
      bygg: [
        { bygg: "Mustads vei 1", belop: 12807323.07 },
        { bygg: "Sponhoggveien 2", belop: 1534648.76 },
        { bygg: "Lilleakerveien 8", belop: 34812848.87 },
        { bygg: "P-Bro mellom LV8 og LV4", belop: 968059.11 },
        { bygg: "Lilleakerveien 10", belop: 11347054.73 },
        { bygg: "Mustads vei 12", belop: 277931.6 },
        { bygg: "Mustads vei 10", belop: 471734.97 },
        { bygg: "Lilleakerveien 14", belop: 0 },
        { bygg: "CC Vest Senter", belop: 118910053.15 },
        { bygg: "Lilleakerveien 16 Bilforretning", belop: 703333.33 },
        { bygg: "Lilleakerveien 18", belop: 696736.54 },
        { bygg: "Lilleakerveien 20", belop: 78232 },
        { bygg: "(Ikke bruk) Uteområde Sør", belop: 371968 },
        { bygg: "Lilleakerveien 24C", belop: 1687812.4 },
        { bygg: "Lilleakerveien 30", belop: 1277648.42 },
        { bygg: "Lilleakerveien 4A", belop: 12304432.33 },
        { bygg: "Lilleakerveien 4C", belop: 17359264.18 },
        { bygg: "Lilleakerveien 4D", belop: 160244.64 },
        { bygg: "Lilleakerveien 4E", belop: 36886606.68 },
        { bygg: "Lilleakerveien 4CDEF Uteparkering", belop: 2115520.88 },
        { bygg: "Lilleakerveien 6", belop: 58138396.32 },
        { bygg: "Lilleakerveien 6D", belop: 10321655.74 },
        { bygg: "Parkering ute Lilleakerveien", belop: 167122 },
        { bygg: "Områdekostnader - Felles", belop: 110651 },
        { bygg: "Vollsveien 17", belop: 8206342.61 },
        { bygg: "Vollsveien 19", belop: 8710110.03 },
        { bygg: "Vollsveien 21", belop: 1536300.04 },
        { bygg: "Vollsveien 13B", belop: 2098079.4 },
        { bygg: "Vollsveien 13C", belop: 4864487.21 },
        { bygg: "Vollsveien 13D", belop: 2192951.19 },
        { bygg: "Vollsveien 13E", belop: 1446392.98 },
        { bygg: "Vollsveien 13F", belop: 697199.16 },
        { bygg: "Vollsveien 13G", belop: 71361 },
        { bygg: "Vollsveien 13H", belop: 21096274.79 },
        { bygg: "Lilleakerveien 2 - Felles", belop: 2217767 },
        { bygg: "Lilleakerveien 2A", belop: 28937030.09 },
        { bygg: "Lilleakerveien 2B", belop: 23455365.88 },
        { bygg: "Lilleakerveien 2C", belop: 6704528.93 },
        { bygg: "Lilleakerveien 2D", belop: 5167521.8 },
        { bygg: "Lilleakerveien 2E", belop: 4605279.59 },
        { bygg: "Lilleakerveien 2G", belop: 284044 },
        { bygg: "Lilleakerveien 2 - Garasje", belop: 4217011.22 },
        { bygg: "Fåbro Gårdeierforening", belop: 49216 },
        { bygg: "Lilleakerveien 4A Modus", belop: 1159782 },
        { bygg: "Arnstein Arnebergs vei 4", belop: 31500 },
        { bygg: "Lilleakerveien 10 Uteparkering", belop: 61358 },
        { bygg: "Vollsveien 13-17-19 Uteparkering", belop: 907919.68 },
        { bygg: "Lilleakerveien 14 Uteparkering", belop: 273460.41 },
        { bygg: "Lilleakerveien 16 Uteparkering", belop: 21987.54 },
        { bygg: "Vollsveien 17 Sør Uteparkering", belop: 5872.8 },
        { bygg: "Vollsveien 17-19-21 Uteparkering", belop: 1490334.17 },
        { bygg: "Vollsveien 13D Uteparkering", belop: 181788.34 },
        { bygg: "Lilleakerveien 4A Uteparkering", belop: 80441.53 },
        { bygg: "Lilleakerveien 6 P-hus", belop: 3120305.28 },
        { bygg: "Carl Lundgrensvei Uteparkering", belop: 43250 },
        { bygg: "Lilleakerveien 2C, Plan 3 Co-work", belop: 159339 },
      ],
    },
    {
      selskap: "Fåbro Eiendom AS",
      belop: 35770717.3,
      bygg: [
        { bygg: "Lilleakerveien 20", belop: 14842233.58 },
        { bygg: "Lilleakerveien 22", belop: 20570287.92 },
        { bygg: "Lilleakerveien 20-22 Uteparkering", belop: 358195.8 },
      ],
    },
    {
      selskap: "Lilleaker Næring AS",
      belop: 972309.1,
      bygg: [{ bygg: "Lilleakerveien 2F", belop: 972309.1 }],
    },
    {
      selskap: "Lilleaker Sentrum AS",
      belop: 10299476.25,
      bygg: [
        { bygg: "Lilleakerveien 29", belop: 363262.84 },
        { bygg: "Lilleakerveien 31", belop: 9936213.41 },
      ],
    },
    {
      selskap: "Lilleakerveien 14 AS",
      belop: 21013425.75,
      bygg: [
        { bygg: "Lilleakerveien 14", belop: 20584277.38 },
        { bygg: "Lilleakerveien 14 Uteparkering", belop: 429148.37 },
      ],
    },
    {
      selskap: "Lilleakerveien 32B AS",
      belop: 758061,
      bygg: [{ bygg: "Lilleakerveien 32B", belop: 758061 }],
    },
    {
      selskap: "Mustadboliger AS",
      belop: 3398800.35,
      bygg: [
        { bygg: "Lilleakerveien 19", belop: 341618.19 },
        { bygg: "Lilleakerveien 26", belop: 1804307.71 },
        { bygg: "Arnstein Arnebergs vei 4", belop: 445487.85 },
        { bygg: "Holmenveien 16", belop: 142200 },
        { bygg: "Gamle Drammensvei 10", belop: 640186.6 },
        { bygg: "Mustadkroken", belop: 25000 },
      ],
    },
    {
      selskap: "Strandveien 10 AS",
      belop: 1164482.11,
      bygg: [{ bygg: "Strandveien 10", belop: 1164482.11 }],
    },
    {
      selskap: "Strandveien 4-8 AS",
      belop: 46827212.57,
      bygg: [
        { bygg: "Fellesanlegg", belop: 0 },
        { bygg: "Strandveien 4-8", belop: 46827212.57 },
      ],
    },
  ],
};

export type ReconciliationStatus = "ok" | "varsel" | "feil";

export interface ReconciliationCheck {
  id: string;
  label: string;
  status: ReconciliationStatus;
  notat: string;
}

export interface ReconciliationSnapshot {
  sistOppdatert: string;
  checks: ReconciliationCheck[];
}

export const RECONCILIATION: ReconciliationSnapshot = {
  sistOppdatert: "2026-08-14",
  checks: [
    {
      id: "totalsum-plausibel",
      label: "Total prognose 2026 er i rimelig størrelsesorden",
      status: "ok",
      notat:
        "Del A ~791,4 mill kr + Del B ~53,0 mill kr = ~844,4 mill kr totalt for 2026 (fakturert hittil + gjenstående + manuelle bilag). Virker konsistent med porteføljens størrelse.",
    },
    {
      id: "stort-enkeltbilag",
      label: "Stort enkeltstående manuelt bilag",
      status: "varsel",
      notat:
        "Bilag 28779-4 (Mustad Eiendom AS, 'Avsetning omsetningsleie 2025 iht vedlegg', -12,14 mill kr) er uvanlig stort sammenlignet med de andre manuelle postene. Bør verifiseres mot regnskap/vedlegg før tallet stoles på fullt ut.",
    },
    {
      id: "fornyelsesregel-konservativ",
      label: "Fornyelsesregelen antar ingen reell fornyelse er sjekket",
      status: "varsel",
      notat:
        "59 leietaker/bygg-kombinasjoner (92 linjer, ~9,5 mill kr) er merket 'usikker' fordi kontrakten utløper før 31.12.2026 - ingen sjekk er gjort for om en reell etterfølgerkontrakt allerede finnes (ville krevd egne spørringer per leietaker). Tallet er en konservativ antagelse, ikke bekreftet fornyelse.",
    },
    {
      id: "del-ab-metodikk-ulik",
      label: "Del A/B-splitten er ikke identisk metodikk på tvers av kilder",
      status: "varsel",
      notat:
        "INVOICED bruker NXT-kontonummer (3640-3642=Del B). REMAINING (Fazile) bruker en seksjonsnavn-heuristikk ('garasje'/'parkering'/'p-hus'/'p-bro' i navnet). Grov, men konsistent innad i hver kilde.",
    },
    {
      id: "gnr-bnr-uverifisert",
      label: "8 mindre tomteeiendommer (Gnr./Bnr.) ga ingen treff i Fazile",
      status: "varsel",
      notat:
        "Rent roll-spørringen for disse 8 eiendommene ('Gnr. 10 Bnr. 704' m.fl.) returnerte 'ingen seksjoner matchet filtrene' for alle - ikke bekreftet om dette er reelt tomme tomter eller en navnestreng-mismatch. Lav sannsynlig påvirkning (små tomter), men ikke verifisert.",
    },
  ],
};

export interface OwnershipShareRule {
  bygg: string;
  andelProsent: number; // Mustads eierandel av inntekten fra dette bygget (resten tilhører medeier)
  notat?: string;
}

export interface OwnershipShareSnapshot {
  sistOppdatert: string;
  rules: OwnershipShareRule[];
}

// Bygg-navn, ikke leietaker-identifiserende - identisk med .local.ts, ingen anonymisering
// nødvendig. Se lib/incomeForecast.local.ts for full kommentar.
export const OWNERSHIP_SHARE_RULES: OwnershipShareSnapshot = {
  sistOppdatert: "2026-08-24",
  rules: [
    { bygg: "Strandveien 4-8", andelProsent: 50 },
    { bygg: "Strandveien 10", andelProsent: 50 },
    { bygg: "Lilleakerveien 20-22", andelProsent: 50 },
  ],
};

export function buildIncomeForecastContext(): string {
  const lines: string[] = [];

  const invoicedA = INVOICED.periods.reduce((s, p) => s + p.delA, 0);
  const invoicedB = INVOICED.periods.reduce((s, p) => s + p.delB, 0);
  lines.push(
    `INNTEKTSPROGNOSE ${INVOICED.ar} (snapshot, sist oppdatert ${INVOICED.sistOppdatert || "ukjent"} — ikke live, oppdateres manuelt ved forespørsel):`,
  );
  lines.push(`- Fakturert hittil (Visma NXT): Del A (leie) ${formatKr(invoicedA)}, Del B (parkering) ${formatKr(invoicedB)}`);

  const manualNxtA = MANUAL_NXT.vouchers.filter((v) => v.del === "A").reduce((s, v) => s + v.belop, 0);
  const manualNxtB = MANUAL_NXT.vouchers.filter((v) => v.del === "B").reduce((s, v) => s + v.belop, 0);
  lines.push(`- Manuelle bilag allerede i NXT: Del A ${formatKr(manualNxtA)}, Del B ${formatKr(manualNxtB)} (${MANUAL_NXT.vouchers.length} bilag)`);

  const remainingLines = REMAINING.tenants.flatMap((t) => t.lines);
  const remainingSikker = remainingLines.filter((l) => l.sikkerhet === "sikker").reduce((s, l) => s + l.belopGjenstaende, 0);
  const remainingUsikker = remainingLines.filter((l) => l.sikkerhet === "usikker").reduce((s, l) => s + l.belopGjenstaende, 0);
  lines.push(
    `- Gjenstår å fakturere resten av året (Fazile, ${REMAINING.tenants.length} leietakere): sikkert ${formatKr(remainingSikker)}, usikkert/antatt fornyelse ${formatKr(remainingUsikker)}`,
  );

  lines.push("\nAVSTEMMINGSKONTROLLER:");
  if (RECONCILIATION.checks.length === 0) {
    lines.push("- Ingen kontroller kjørt ennå.");
  } else {
    for (const c of RECONCILIATION.checks) {
      lines.push(`- [${c.status}] ${c.label}: ${c.notat}`);
    }
  }

  return lines.join("\n");
}
