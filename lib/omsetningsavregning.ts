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
  matchStatus:
    | "eksakt"
    | "kjerne-navn"
    | "kjerne-navn (uten mellomrom)"
    | "delstreng"
    | "bekreftet av Morten"
    | "ikke-matchet"
    | "verifisert mot Fazile+NXT 2026-08-27"
    // v4 (2026-08-27) - se buildingTurnoverNote i scripts/refresh-data/omsetningsavregning-2026-verified.json
    | "verifisert mot Fazile+NXT 2026-08-27 (2025-avregning ekskludert, kjerneleie-konti 3620+3630)"
    | "verifisert mot Fazile+NXT 2026-08-27 - Lilleakerveien 14, 0 kr netto fakturert (faktura opprettet+reversert samme dag, reell forsinkelse i fakturering av bygget)";
  // Butikker som deler samme Fazile-leieforhold/selskap (f.eks. to avdelinger under én
  // kontrakt) - fakturertPlusGjenstar er da FELLES, og ekstrafakturering er fordelt
  // proporsjonalt mellom dem (se scripts/build-omsetningsavregning.js).
  delerLeieforholdMed: string[];
  // Lagt til v2 (2026-08-27) - selve fakturert/gjenstår-kontrollen mot Visma NXT
  // (orgUnit3-scoped per bygg, 2025-avregningslinjer ekskludert), pluss faktisk
  // omsetningsvekst (YoY) fra Fazile butikkomsetning.
  fakturert2026: number | null;
  gjenstar2026: number | null;
  omsetningYoyPct?: number | null;
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
