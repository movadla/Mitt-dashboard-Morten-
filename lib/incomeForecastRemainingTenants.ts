import { hgetJSON } from "./kv";
import { anonymizeIfPerson } from "./tenantAnonymize";

export interface RemainingTenantLine {
  eiendom: string;
  bygg: string;
  linjetype: string;
  beskrivelse: string;
  gjenstaende: number;
}

export interface RemainingTenant {
  navn: string;
  totalBelop: number;
  lines: RemainingTenantLine[];
}

export interface RemainingTenantsSnapshot {
  sistOppdatert: string;
  ar: number;
  periodeFra: string;
  periodeTil: string;
  totalBelop: number;
  antallLeietakere: number;
  tenants: RemainingTenant[];
}

const HASH_KEY = "jobb:inntektsprognose-gjenstar-leietakere";
const FIELD = "snapshot";

function anonymizeSnapshot(snapshot: RemainingTenantsSnapshot): RemainingTenantsSnapshot {
  return {
    ...snapshot,
    tenants: snapshot.tenants.map((t) => ({ ...t, navn: anonymizeIfPerson(t.navn) })),
  };
}

export async function getRemainingTenantsSnapshot(): Promise<RemainingTenantsSnapshot | null> {
  const snapshot = await hgetJSON<RemainingTenantsSnapshot>(HASH_KEY, FIELD);
  if (!snapshot) return null;
  // Samme app kjører både lokalt (ekte data ønsket) og på den offentlige Vercel-siden
  // (kun demokunder tillatt) mot SAMME Redis - anonymiser derfor privatpersoner i farten
  // her, ikke ved lagring, se ANONYMISERING.md.
  if (process.env.NODE_ENV === "production") return anonymizeSnapshot(snapshot);
  return snapshot;
}
