// Typene for Fazilesjekk, holdt i en EGEN fil fra dataene fordi
// lib/fazilesjekk.ts byttes mellom .local (ekte leietakernavn) og .anon
// (demodata) av predev/prebuild — se scripts/use-local-data.js. Da må begge
// datafilene importere typene herfra i stedet for å duplisere dem, ellers
// drifter de fra hverandre ved neste endring.

export type FazilesjekkStatus = "ok" | "delvis-ok" | "avvik" | "finnes-ikke" | "kan-ikke-sjekkes";

// Hvilken KATEGORI avviket er i. Brukes til filtrering/gruppering i UI-et, så
// nye verdier må legges til her og ikke bare skrives som fritekst i kommentar.
export type FazilesjekkAvvikstype =
  | "startdato"
  | "sluttdato"
  | "mangler-sluttdato"
  | "husleie"
  | "felleskostnader"
  | "energi"
  | "dobbeltregistrering"
  | "leiehull"
  | "areal-id"
  | "mangler-belop-i-asana";

export interface FazilesjekkRow {
  leietaker: string;
  bygg?: string;
  sfKontraktId?: string;
  fazileKontraktsnokkel?: string;
  asanaStart?: string;
  asanaSlutt?: string;
  fazileStart?: string;
  fazileSlutt?: string;
  asanaArsbelop?: number;
  fazileHusleie?: number;
  asanaFelleskost?: number;
  fazileFelleskost?: number;
  status: FazilesjekkStatus;
  avvikstyper?: FazilesjekkAvvikstype[];
  // Kroner per år. POSITIVT = underfakturert (Mustad taper penger),
  // NEGATIVT = overfakturert. Udefinert når konsekvensen ikke er beregnet.
  belopspavirkning?: number;
  kommentar?: string;
  // Areal-ID-en Asana foreslo, og hva den faktisk viste seg å peke på.
  // Feltet er systematisk feil (0 av 31 verifiserte i gjennomgangen
  // 2026-09-04), så det brukes IKKE som koblingsnøkkel — kun som en egen
  // sjekk som selv rapporterer avvik.
  arealIdFazile?: string;
  arealIdVerifisert?: "ok" | "feil-bygg" | "finnes-ikke";
  trappetrinn?: string;
  duplikatOppgaver?: number;
}

// Aggregatet fra selve gjennomgangen. Holdes separat fra radene fordi
// detaljradene bevisst kun dekker avvikene — å liste 43 OK-kontrakter med
// fulle tall gir ingen handlingsverdi, men totalene må fortsatt stemme.
export interface FazilesjekkSammendrag {
  kjortDato: string; // ISO — øyeblikksbilde, se merknaden i UI-et
  vinduFra: string;
  vinduTil: string;
  asanaOppgaverIVinduet: number;
  unikeKontrakter: number;
  antallOk: number;
  antallDelvisOk: number;
  antallAvvik: number;
  antallFinnesIkke: number;
  antallKanIkkeSjekkes: number;
  arealIdUtfylt: number;
  arealIdKorrekt: number;
  trappetrinnUtfylt: number;
  trappetrinnMedReeltInnhold: number;
  duplikatOppgaver: number;
  // Navn på kontrakter som kom ut som OK. Bevisst ufullstendig — se
  // kommentaren i datafilen.
  okNavn: string[];
  delvisOkNavn: string[];
}
