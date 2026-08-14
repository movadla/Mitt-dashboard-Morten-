import { hgetallJSON, hsetJSON } from "./kv";
import type { ReceivableRiskLevel } from "./receivableRisk";

export interface ReceivableSnapshotRow {
  id: string;
  leietaker: string;
  utestaende: number;
  ikkeForfalt: number;
  forfalt: number;
  forfalt91: number;
  risiko: ReceivableRiskLevel | null;
}

export interface ReceivableSnapshot {
  dato: string; // YYYY-MM-DD — perioden dette snapshotet representerer
  rader: ReceivableSnapshotRow[];
}

// Risiko fryses PER RAD på snapshot-tidspunktet, slik at en senere endring av
// risikonivå ikke skriver om historiske perioder — "Analyse"-fanen skal vise
// hva risikoen FAKTISK var da tallene ble tatt.
const HASH_KEY = "jobb:kundefordringer-perioder";

export async function getSnapshots(): Promise<ReceivableSnapshot[]> {
  const map = await hgetallJSON<ReceivableSnapshot>(HASH_KEY);
  return Object.values(map).sort((a, b) => a.dato.localeCompare(b.dato));
}

export async function getLatestTwoSnapshots(): Promise<{
  previous: ReceivableSnapshot | null;
  latest: ReceivableSnapshot | null;
}> {
  const all = await getSnapshots();
  return {
    latest: all.length > 0 ? all[all.length - 1] : null,
    previous: all.length > 1 ? all[all.length - 2] : null,
  };
}

export async function saveSnapshot(snapshot: ReceivableSnapshot): Promise<void> {
  await hsetJSON(HASH_KEY, snapshot.dato, snapshot);
}
