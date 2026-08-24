import { hgetJSON } from "./kv";

// Budsjett 2026 fra Visma NXT, konto 3600-3699 (samme kontogruppe som INVOICED/
// BOOKED_3600_3699) - hentet direkte fra budget/budgetLine-tabellene per selskap,
// eierandel-korrigert (samme 3 selskaper som ellers i prosjektet). Ingen persondata -
// kun selskap/bygg-navn og beløp, trygt å vise identisk i produksjon.
export interface NxtBudgetCompanyBuilding {
  bygg: string;
  belop: number;
}

export interface NxtBudgetCompany {
  selskap: string;
  eierandel: number;
  belop: number;
  bygg: NxtBudgetCompanyBuilding[];
}

export interface NxtBudgetSnapshot {
  sistOppdatert: string;
  ar: number;
  budgetNo: number;
  totalBelop: number;
  perSelskap: NxtBudgetCompany[];
  perBygg: { bygg: string; belop: number }[];
  selskaperUtenBudsjett: string[];
}

const HASH_KEY = "jobb:inntektsprognose-nxt-budsjett";
const FIELD = "snapshot";

export async function getNxtBudgetSnapshot(): Promise<NxtBudgetSnapshot | null> {
  return hgetJSON<NxtBudgetSnapshot>(HASH_KEY, FIELD);
}
