import { LEIETAKER_FACTS, type LeietakerFact } from "./leietakerFacts";

// Samme navnematching-stil som getMainBuilding() i receivableBuilding.ts - normaliserer bort
// mellomrom-/store bokstaver-varianter (LEIETAKER_FACTS kommer fra Fazile sitt customer.full_name,
// som ofte skriver seg litt annerledes enn Salesforce/SharePoint/Asana-kildene de andre
// seksjonene bruker, f.eks. "Cc Vest Legesenter Da" vs "CC Vest Legesenter DA").
function normaliser(navn: string): string {
  return navn.trim().toLowerCase().replace(/\s+/g, " ");
}

let normalisertIndeks: Map<string, LeietakerFact> | null = null;

function getIndeks(): Map<string, LeietakerFact> {
  if (!normalisertIndeks) {
    normalisertIndeks = new Map(LEIETAKER_FACTS.map((f) => [normaliser(f.leietaker), f]));
  }
  return normalisertIndeks;
}

// Returnerer null (ikke en gjettet verdi) når leietakeren ikke finnes i tabellen - dekningen er
// bevisst delvis, se filhode-kommentaren i lib/leietakerFacts.local.ts.
export function finnLeietakerFact(navn: string): LeietakerFact | null {
  return getIndeks().get(normaliser(navn)) ?? null;
}
