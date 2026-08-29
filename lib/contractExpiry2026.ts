import { hgetJSON } from "./kv";
import { anonymizeIfPerson } from "./tenantAnonymize";

export type ContractExpiryStatus = "apen" | "reforhandlet";

export interface ContractExpiryLine {
  linjenokkel: string;
  linjeBeskrivelse: string;
  arealtype: string;
  linjeSlutt: string;
  totalArsleie: number;
  ekstraI2026: number;
}

export interface ContractExpiryContract {
  leietaker: string;
  kontraktsnokkel: string;
  bygg: string;
  totalArsleie: number;
  minSlutt: string;
  maxSlutt: string;
  status: ContractExpiryStatus;
  nyKontraktsnokkel: string | null;
  ekstraI2026: number;
  lines: ContractExpiryLine[];
  // v2 (2026-08-29): varsel - leietakeren har allerede fakturert vesentlig MER i 2026 enn det
  // kontraktens egen (registrerte) sluttdato skulle tilsi - kan bety at ekstraI2026 dobbelttelles
  // mot en allerede realisert engangs-/dobbel-kvartal-betaling (se build-contract-expiry-2026.js).
  // null = ingen mistanke, eller kunne ikke sjekkes pålitelig (f.eks. bygg-navn fant ikke treff
  // for en leietaker med flere byggforhold - da IKKE flagget, for å unngå falske positiver).
  muligAlleredeDekket: { faktiskFakturert: number; forventetGjennomSlutt: number; overskudd: number } | null;
}

export interface ContractExpiryEkstraLeietaker {
  leietaker: string;
  ekstraI2026: number;
  kontrakter: { kontraktsnokkel: string; bygg: string; maxSlutt: string; ekstraI2026: number }[];
}

export interface ContractExpiry2026Snapshot {
  sistOppdatert: string;
  ar: number;
  totalArsleie: number;
  reforhandletArsleie: number;
  reellEksponeringArsleie: number;
  totalEkstraI2026: number;
  antallKontrakter: number;
  antallReforhandlet: number;
  antallApen: number;
  contracts: ContractExpiryContract[];
  ekstraI2026PerLeietaker: ContractExpiryEkstraLeietaker[];
}

const HASH_KEY = "jobb:inntektsprognose-kontraktsutlop-2026";
const FIELD = "snapshot";

function anonymizeSnapshot(snapshot: ContractExpiry2026Snapshot): ContractExpiry2026Snapshot {
  return {
    ...snapshot,
    contracts: snapshot.contracts.map((c) => ({ ...c, leietaker: anonymizeIfPerson(c.leietaker) })),
    ekstraI2026PerLeietaker: snapshot.ekstraI2026PerLeietaker.map((p) => ({ ...p, leietaker: anonymizeIfPerson(p.leietaker) })),
  };
}

export async function getContractExpiry2026Snapshot(): Promise<ContractExpiry2026Snapshot | null> {
  const snapshot = await hgetJSON<ContractExpiry2026Snapshot>(HASH_KEY, FIELD);
  if (!snapshot) return null;
  // Samme app kjører både lokalt (ekte data ønsket) og på den offentlige Vercel-siden
  // (kun demokunder tillatt) mot SAMME Redis - anonymiser derfor privatpersoner i farten
  // her, ikke ved lagring, se ANONYMISERING.md.
  if (process.env.NODE_ENV === "production") return anonymizeSnapshot(snapshot);
  return snapshot;
}
