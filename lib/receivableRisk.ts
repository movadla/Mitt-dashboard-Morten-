import { hdel, hgetallJSON, hsetJSON } from "./kv";

// Hash-nøkkelen inneholder KUN manuelle overstyringer av risiko, satt av Morten selv i
// dropdownen. Er en leietaker ikke i denne hashen, brukes computeAutoRisk() (lib/receivablesAging.ts)
// som effektiv verdi i UI. Nøkkelen er Receivable.id (r1, r2, ...), som er posisjonsbasert og kan
// skifte leietaker ved neste NXT-oppdatering (samme kjente begrensning som allerede gjelder
// kommentarer på kundefordringer).
export type ReceivableRiskLevel = "lav" | "medium" | "hoy";

const HASH_KEY = "jobb:kundefordringer-risiko";

export async function getReceivableRisks(): Promise<Record<string, ReceivableRiskLevel>> {
  return hgetallJSON<ReceivableRiskLevel>(HASH_KEY);
}

export async function setReceivableRisk(id: string, risk: ReceivableRiskLevel | null): Promise<void> {
  if (risk === null) {
    await hdel(HASH_KEY, id);
  } else {
    await hsetJSON(HASH_KEY, id, risk);
  }
}
