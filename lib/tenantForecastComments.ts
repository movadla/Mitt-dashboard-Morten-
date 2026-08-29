import { hgetallJSON, hsetJSON } from "./kv";

// Frie kommentarer pr. leietaker i "Gjenstår per leietaker"/"Leieinntekter"-tabellene
// (Inntektsprognose). Holdes i en EGEN Redis-hash, ikke i selve tenant-forecast-table-
// snapshotet - det snapshotet bygges på nytt av scripts/build-tenant-forecast-table.js
// hver gang pipelinen kjøres, og ville ha overskrevet/mistet kommentarene ellers.
// Kobles inn i lib/tenantForecastTable.ts ved lesing (samme mønster som anonymisering der).

export interface TenantForecastComment {
  navn: string;
  kommentar: string;
  sistOppdatert: string;
}

const HASH_KEY = "jobb:inntektsprognose-leietaker-kommentarer";

function normalizeKey(navn: string): string {
  return navn.trim().toLowerCase();
}

export async function getTenantForecastComments(): Promise<Record<string, string>> {
  const stored = await hgetallJSON<TenantForecastComment>(HASH_KEY);
  const result: Record<string, string> = {};
  for (const entry of Object.values(stored)) {
    if (entry.kommentar) result[normalizeKey(entry.navn)] = entry.kommentar;
  }
  return result;
}

export async function setTenantForecastComment(navn: string, kommentar: string): Promise<TenantForecastComment> {
  const trimmedNavn = navn.trim();
  if (!trimmedNavn) throw new Error("Mangler leietakernavn");
  const entry: TenantForecastComment = {
    navn: trimmedNavn,
    kommentar: kommentar.trim(),
    sistOppdatert: new Date().toISOString().slice(0, 10),
  };
  await hsetJSON(HASH_KEY, normalizeKey(trimmedNavn), entry);
  return entry;
}
