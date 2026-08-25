import { hgetJSON } from "./kv";
import { anonymizeIfPerson } from "./tenantAnonymize";

export interface OmsetningsavregningButikk {
  butikk: string;
  omsetningKorr: number;
  avtaltOmsProsent: number;
  forventetOmsetningsleie: number;
  fakturertPlusGjenstar: number | null; // null = ikke matchet mot noe CC Vest-leieforhold
  ekstrafakturering: number;
  matchStatus: "eksakt" | "kjerne-navn" | "kjerne-navn (uten mellomrom)" | "delstreng" | "bekreftet av Morten" | "ikke-matchet";
  // Butikker som deler samme Fazile-leieforhold/selskap (f.eks. to avdelinger under én
  // kontrakt) - fakturertPlusGjenstar er da FELLES, og ekstrafakturering er fordelt
  // proporsjonalt mellom dem (se scripts/build-omsetningsavregning.js).
  delerLeieforholdMed: string[];
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
