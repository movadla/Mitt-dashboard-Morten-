import { hgetJSON } from "./kv";
import { anonymizeIfPerson } from "./tenantAnonymize";

export interface OmsetningsavregningButikk {
  butikk: string;
  // Lagt til v3 (2026-08-27, Morten ba om full tabell) - bygg + minimumsleie/omsetningsleie-
  // type (fra Amesto sin "Kontraktsobjekt"-kolonne H i Avregnet omsetning 2025.xlsx).
  bygg: string;
  leietype: "Minimumsleie" | "Omsetningsleie" | "Fast leie";
  omsetningKorr: number | null; // null = ingen live omsetningskilde for dette bygget (kun CC Vest senter har butikkomsetning-data pt.)
  avtaltOmsProsent: number | null;
  forventetOmsetningsleie: number | null; // null når omsetningKorr/avtaltOmsProsent mangler
  fakturertPlusGjenstar: number | null; // null = ikke matchet mot noe CC Vest-leieforhold
  ekstrafakturering: number | null; // "Avregning" i UI - MAX(0, forventetOmsetningsleie - fakturertPlusGjenstar), null hvis forventetOmsetningsleie mangler
  // Fritekst fra build-scriptet. v5 (2026-09-04): "v5 automatisk (...)", evt. med
  // "- krever manuell sjekk" / "- delt leieforhold (...)", eller "ikke-matchet ...".
  matchStatus: string;
  // Butikker som deler samme Fazile-leieforhold/selskap (f.eks. to avdelinger under én
  // kontrakt) - fakturertPlusGjenstar er da FELLES, og ekstrafakturering er fordelt
  // proporsjonalt mellom dem (se scripts/build-omsetningsavregning.js).
  delerLeieforholdMed: string[];
  // Kjerneleie (minimumsleie/omsetningsleie) fakturert + gjenstår 2026, fra REMAINING-
  // snapshotet (v13: bokført NXT + Fazile-fakturaplan) - samme tall som leietaker-tabellen.
  fakturert2026: number | null;
  gjenstar2026: number | null;
  // Rullerende 12 mnd omsetning (Omsetningsleie-fanen) mot Amestos 2025-omsetning, i prosent.
  omsetningYoyPct?: number | null;
  // v5 (2026-09-04) - gulv-kontroll og 2025-fasit fra Amestos avregning.
  kontraktsminimum2026?: number | null; // Fazile-linjenes årsverdi for kjerneleien
  gulvavvik?: number | null; // kontraktsminimum - (fakturert + gjenstår); positivt = REMAINING ligger under kontrakten
  andelAvAr?: number; // andel av 2026 leieforholdet er aktivt (inn-/utflyttere), forventet er skalert med denne
  omsetning2025?: number | null;
  avregning2025?: number | null; // faktisk avregnet merleie for 2025 (Amesto)
  akonto2025?: number | null;
  remainingNavn?: string | null; // leietakernavn i REMAINING (kan avvike fra butikknavnet)
  remainingStatus?: string | null;
  kjerneLinjer?: string[];
  krevManuellSjekk?: boolean;
  kommentar?: string;
}

export interface OmsetningsavregningSnapshot {
  sistOppdatert: string;
  kilde: string;
  totalEkstrafakturering: number;
  antallButikker: number;
  antallMatchet: number;
  antallIkkeMatchet: number;
  antallUtelatt: number;
  butikkerUtelatt: string[]; // bekreftet av Morten som ikke omsetningsbasert - ikke en matchefeil
  butikker: OmsetningsavregningButikk[];
  // v5 (2026-09-04)
  buildingTurnoverNote?: string;
  omsetningHentetDato?: string;
  remainingDato?: string;
  antallKrevManuellSjekk?: number;
  antallGulvavvik?: number;
  sumGulvavvik?: number;
  sumForventet?: number;
  sumFakturertPlusGjenstar?: number;
  sumAvregning2025?: number;
}

const HASH_KEY = "jobb:inntektsprognose-omsetningsavregning";
const FIELD = "snapshot";

function anonymizeSnapshot(snapshot: OmsetningsavregningSnapshot): OmsetningsavregningSnapshot {
  return {
    ...snapshot,
    butikkerUtelatt: snapshot.butikkerUtelatt.map((b) => anonymizeIfPerson(b)),
    butikker: snapshot.butikker.map((b) => ({
      ...b,
      butikk: anonymizeIfPerson(b.butikk),
      delerLeieforholdMed: b.delerLeieforholdMed.map((d) => anonymizeIfPerson(d)),
      remainingNavn: b.remainingNavn ? anonymizeIfPerson(b.remainingNavn) : b.remainingNavn,
    })),
  };
}

export async function getOmsetningsavregningSnapshot(): Promise<OmsetningsavregningSnapshot | null> {
  const snapshot = await hgetJSON<OmsetningsavregningSnapshot>(HASH_KEY, FIELD);
  if (!snapshot) return null;
  // Samme Redis brukes lokalt (ekte data) og i prod (kun demokunder) - se ANONYMISERING.md.
  if (process.env.NODE_ENV === "production") return anonymizeSnapshot(snapshot);
  return snapshot;
}
