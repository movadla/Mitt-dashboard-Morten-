import { hgetallJSON, hsetJSON } from "./kv";
import { getReceivableRisks, type ReceivableRiskLevel } from "./receivableRisk";
import { computeAging, computeAutoRisk } from "./receivablesAging";
import { RECEIVABLES } from "./widgets";
import { localDateString } from "./payday";

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

// Delt av både den manuelle "Start ny periode"-knappen og den automatiske
// ukentlige cron-jobben (app/api/cron/receivables-snapshot) — begge skal
// bygge og lagre et snapshot på nøyaktig samme måte.
export async function buildTodaysSnapshot(): Promise<ReceivableSnapshot> {
  const risks = await getReceivableRisks();
  const today = localDateString();
  return {
    dato: today,
    rader: RECEIVABLES.map((r) => {
      const aging = computeAging(r, today);
      return {
        id: r.id,
        leietaker: r.leietaker,
        utestaende: r.utestaende,
        ikkeForfalt: Math.round(aging.ikkeForfalt * 100) / 100,
        forfalt: Math.round(aging.forfalt * 100) / 100,
        forfalt91: Math.round(aging.d91Plus * 100) / 100,
        risiko: risks[r.id] ?? computeAutoRisk(r, today),
      };
    }),
  };
}

export async function createAndSaveTodaysSnapshot(): Promise<ReceivableSnapshot> {
  const snapshot = await buildTodaysSnapshot();
  await saveSnapshot(snapshot);
  return snapshot;
}
