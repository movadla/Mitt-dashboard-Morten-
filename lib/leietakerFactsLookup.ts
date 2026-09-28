import { LEIETAKER_FACTS, type LeietakerFact } from "./leietakerFacts";

// Delt navnematching-normalisering (2026-09-28: eksportert og gjenbrukt i receivableBuilding.ts
// og IncomeForecastSection.tsx sin garantisjekk - tidligere hadde hvert sted sin egen eksakte
// `===`-match, som mister treff pga. ren stor/liten bokstav-variasjon mellom kildene, f.eks.
// "Cc Vest Legesenter Da" (Fazile) vs "CC Vest Legesenter DA" (Salesforce/SharePoint)).
export function normaliserLeietakerNavn(navn: string): string {
  return navn.trim().toLowerCase().replace(/\s+/g, " ");
}

let normalisertIndeks: Map<string, LeietakerFact> | null = null;

function getIndeks(): Map<string, LeietakerFact> {
  if (!normalisertIndeks) {
    normalisertIndeks = new Map(LEIETAKER_FACTS.map((f) => [normaliserLeietakerNavn(f.leietaker), f]));
  }
  return normalisertIndeks;
}

// Returnerer null (ikke en gjettet verdi) når leietakeren ikke finnes i tabellen - dekningen er
// bevisst delvis, se filhode-kommentaren i lib/leietakerFacts.local.ts.
export function finnLeietakerFact(navn: string): LeietakerFact | null {
  return getIndeks().get(normaliserLeietakerNavn(navn)) ?? null;
}
