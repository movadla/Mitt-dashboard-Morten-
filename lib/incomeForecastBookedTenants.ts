import { hgetJSON } from "./kv";

export interface BookedTenantLine {
  selskap: string;
  accountNo: number;
  bygg: string;
  belop: number;
}

export interface BookedTenant {
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

// Grov, bevisst konservativ heuristikk: "ser ut som et firma/organisasjon" krever et
// gjenkjennelig selskapsformkjennetegn eller institusjonsord. Alt som IKKE treffer her
// blir behandlet som mulig privatperson og anonymisert i prod - default er "anonymiser",
// ikke "vis", nettopp for å unngå å eksponere ekte personnavn ved usikkerhet.
const ORG_PATTERN =
  /\b(AS|ASA|DA|ANS|BA|NUF|ENK|SA|KS)\b|kommune|forening|klubb|sameie|selskap|stiftelse|menighet|departementet|direktoratet|universitet|skole|kirke|idrettslag|musikkorps|borettslag|komit[eè]|nemnda|byr[åa]|etat|turistforening/i;

function looksLikeOrganization(navn: string): boolean {
  return ORG_PATTERN.test(navn);
}

function anonymizeName(navn: string): string {
  // Deterministisk basert på navnet (samme leietaker => samme Demokunde-nummer hver gang),
  // uavhengig av de andre Demokunde-nummerseriene brukt andre steder i appen.
  let hash = 0;
  for (let i = 0; i < navn.length; i++) hash = (hash * 31 + navn.charCodeAt(i)) >>> 0;
  return `Demokunde ${(hash % 500) + 1}`;
}

function anonymizeSnapshot(snapshot: BookedTenantsSnapshot): BookedTenantsSnapshot {
  return {
    ...snapshot,
    tenants: snapshot.tenants.map((t) =>
      looksLikeOrganization(t.navn) ? t : { ...t, navn: anonymizeName(t.navn) },
    ),
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
