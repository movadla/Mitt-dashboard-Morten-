import { hgetJSON } from "./kv";
import { anonymizeIfPerson, withProdAnonymization } from "./tenantAnonymize";
import type { ContractExpiry2026Snapshot } from "./contractExpiry2026";

// Del B (parkering)-motstykket til lib/contractExpiry2026.ts - lagt til 2026-09-21 (Morten:
// "parkering har kontrakter med reforhandlingspotensial ogsa"). Samme snapshot-form (gjenbrukt
// type), samme byggeskript (scripts/build-contract-expiry-2026.js bygger na begge deler), men EGEN
// Redis-nokkel - holder Del A og Del B strukturelt fra hverandre nedstroms (se
// buildKontraktSnapshot i skriptet for hvorfor de aldri deler kontraktsnokler i praksis).

const HASH_KEY = "jobb:inntektsprognose-kontraktsutlop-2026-parkering";
const FIELD = "snapshot";

function anonymizeSnapshot(snapshot: ContractExpiry2026Snapshot): ContractExpiry2026Snapshot {
  return {
    ...snapshot,
    contracts: snapshot.contracts.map((c) => ({ ...c, leietaker: anonymizeIfPerson(c.leietaker) })),
    ekstraI2026PerLeietaker: snapshot.ekstraI2026PerLeietaker.map((p) => ({ ...p, leietaker: anonymizeIfPerson(p.leietaker) })),
  };
}

export async function getContractExpiryParking2026Snapshot(): Promise<ContractExpiry2026Snapshot | null> {
  const snapshot = await hgetJSON<ContractExpiry2026Snapshot>(HASH_KEY, FIELD);
  if (!snapshot) return null;
  // Samme app kjører både lokalt (ekte data ønsket) og på den offentlige Vercel-siden
  // (kun demokunder tillatt) mot SAMME Redis - anonymiser derfor privatpersoner i farten
  // her, ikke ved lagring, se ANONYMISERING.md.
  return withProdAnonymization(snapshot, anonymizeSnapshot);
}
