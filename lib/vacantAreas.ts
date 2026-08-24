import { hgetJSON } from "./kv";

// Ledige arealer pr bygg (Fazile arealoversikt, status=Ledig) - ingen persondata
// (leietaker er alltid null på ledige arealer), trygt å vise identisk i produksjon.
export interface VacantAreasBuilding {
  bygg: string;
  totalKvm: number;
  antall: number;
  perArealtype: Record<string, number>;
}

export interface VacantAreasSnapshot {
  sistOppdatert: string;
  totalLedigKvm: number;
  antallArealer: number;
  antallBygg: number;
  perArealtype: Record<string, number>;
  bygg: VacantAreasBuilding[];
}

const HASH_KEY = "jobb:inntektsprognose-ledige-arealer";
const FIELD = "snapshot";

export async function getVacantAreasSnapshot(): Promise<VacantAreasSnapshot | null> {
  return hgetJSON<VacantAreasSnapshot>(HASH_KEY, FIELD);
}
