import { hgetJSON } from "./kv";
import { anonymizeIfPerson } from "./tenantAnonymize";

interface BookedTenantLine {
  selskap: string;
  accountNo: number;
  bygg: string;
  belop: number;
}

interface BookedTenant {
  navn: string;
  totalBelop: number;
  lines: BookedTenantLine[];
}

export interface BookedTenantsSnapshot {
  sistOppdatert: string;
  ar: number;
  kontoFra: number;
  kontoTil: number;
  totalBelop: number;
  antallLeietakere: number;
  tenants: BookedTenant[];
}

const HASH_KEY = "jobb:inntektsprognose-bokfort-leietakere";
const FIELD = "snapshot";

function anonymizeSnapshot(snapshot: BookedTenantsSnapshot): BookedTenantsSnapshot {
  return {
    ...snapshot,
    tenants: snapshot.tenants.map((t) => ({ ...t, navn: anonymizeIfPerson(t.navn) })),
  };
}

export async function getBookedTenantsSnapshot(): Promise<BookedTenantsSnapshot | null> {
  const snapshot = await hgetJSON<BookedTenantsSnapshot>(HASH_KEY, FIELD);
  if (!snapshot) return null;
  // Samme app kjører både lokalt (ekte data ønsket) og på den offentlige Vercel-siden
  // (kun demokunder tillatt) mot SAMME Redis - anonymiser derfor privatpersoner i farten
  // her, ikke ved lagring, se ANONYMISERING.md.
  if (process.env.NODE_ENV === "production") return anonymizeSnapshot(snapshot);
  return snapshot;
}
