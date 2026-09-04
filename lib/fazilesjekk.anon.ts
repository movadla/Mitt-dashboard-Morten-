import type { FazilesjekkRow, FazilesjekkSammendrag } from "./fazilesjekkTypes";

export type { FazilesjekkRow, FazilesjekkSammendrag, FazilesjekkStatus, FazilesjekkAvvikstype } from "./fazilesjekkTypes";

// ANONYMISERT demodata — dette er versjonen som committes og som havner i
// produksjonsbygget (se scripts/use-anon-data.js). Ingen ekte leietakernavn,
// ingen ekte Salesforce-ID-er, ingen ekte kontraktsnøkler. Beløpene er
// avrundede/oppdiktede tall som kun skal vise at UI-et fungerer.
// De ekte tallene ligger i lib/fazilesjekk.local.ts (gitignored).
export const FAZILESJEKK_SAMMENDRAG: FazilesjekkSammendrag = {
  kjortDato: "2026-09-04",
  vinduFra: "2026-03-01",
  vinduTil: "2027-09-30",
  asanaOppgaverIVinduet: 12,
  unikeKontrakter: 11,
  antallOk: 6,
  antallDelvisOk: 1,
  antallAvvik: 3,
  antallFinnesIkke: 1,
  antallKanIkkeSjekkes: 0,
  arealIdUtfylt: 4,
  arealIdKorrekt: 0,
  trappetrinnUtfylt: 1,
  trappetrinnMedReeltInnhold: 1,
  duplikatOppgaver: 1,
  okNavn: ["Demokunde A AS", "Demokunde B AS", "Demokunde C AS"],
  delvisOkNavn: ["Demokunde D AS"],
};

export const FAZILESJEKK_ROWS: FazilesjekkRow[] = [
  {
    leietaker: "Demokunde E AS",
    bygg: "Demobygg 1",
    asanaStart: "2026-10-01",
    fazileHusleie: 800000,
    status: "finnes-ikke",
    belopspavirkning: 800000,
    kommentar: "Demorad — kontrakten er ikke lagt inn i Fazile.",
  },
  {
    leietaker: "Demokunde F AS",
    bygg: "Demobygg 2",
    asanaStart: "2026-09-01",
    asanaSlutt: "2031-12-31",
    fazileStart: "2026-09-01",
    fazileSlutt: "2031-12-31",
    asanaArsbelop: 500000,
    fazileHusleie: 400000,
    asanaFelleskost: 120000,
    fazileFelleskost: 80000,
    status: "avvik",
    avvikstyper: ["leiehull", "felleskostnader"],
    belopspavirkning: 30000,
    kommentar: "Demorad — leielinjen starter en måned etter kontraktsstart.",
    trappetrinn: "2026-09-01 til 2027-12-31: 400 000 kr/år | 2028-01-01 til 2031-12-31: 500 000 kr/år",
    duplikatOppgaver: 2,
  },
  {
    leietaker: "Demokunde G AS",
    bygg: "Demobygg 3",
    asanaStart: "2026-05-04",
    asanaSlutt: "2027-08-31",
    fazileStart: "2026-04-01",
    fazileSlutt: "2028-07-31",
    asanaArsbelop: 30000,
    fazileHusleie: 60000,
    status: "avvik",
    avvikstyper: ["dobbeltregistrering"],
    belopspavirkning: -30000,
    kommentar: "Demorad — to parallelle linjer på samme kontrakt.",
  },
  {
    leietaker: "Demokunde H AS",
    bygg: "Demobygg 4",
    asanaStart: "2026-09-01",
    asanaSlutt: "2031-08-31",
    fazileStart: "2026-09-01",
    fazileSlutt: "2031-08-31",
    asanaArsbelop: 600000,
    fazileHusleie: 600000,
    status: "avvik",
    avvikstyper: ["areal-id"],
    kommentar: "Demorad — areal-ID peker på et annet bygg.",
    arealIdFazile: "100001",
    arealIdVerifisert: "feil-bygg",
  },
];
