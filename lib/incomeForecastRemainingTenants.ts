import { hgetJSON } from "./kv";
import { anonymizeIfPerson } from "./tenantAnonymize";

export interface RemainingTenantLine {
  eiendom: string;
  bygg: string;
  linjetype: string;
  beskrivelse: string;
  del: "A" | "B";
  fullArsverdi2026: number;
  // Kontraktslinjens egne start-/sluttdato (ISO, kan være null for løpende/uten sluttdato) -
  // brukes til å varsle når en leietakers kontrakt starter eller slutter i 2026, se
  // "Start/slutt 2026"-kolonnen i app/IncomeForecastSection.tsx.
  startDato: string | null;
  sluttDato: string | null;
}

export type RemainingByggStatus =
  | "ok"
  | "avsluttet"
  | "ikke-matchet-i-nxt"
  | "forklart-omsetningsleie"
  | "forklart-kontraktsendring"
  | "forklart-engangsgebyr"
  | "forklart-nxt-feilkoding"
  | "intern-mustad"
  | "forklart-parkering-onepark";

export interface RemainingByggGruppe {
  bygg: string;
  fullArsverdi2026DelA: number;
  fullArsverdi2026DelB: number;
  alleredeFakturertDelA: number;
  alleredeFakturertDelB: number;
  gjenstarDelA: number;
  gjenstarDelB: number;
  gjenstarTotal: number;
  status: RemainingByggStatus;
  forklaring: string | null;
}

export interface RemainingTenant {
  navn: string;
  fullArsverdi2026: number;
  alleredeFakturertNxt2026: number;
  totalBelop: number; // netto gjenstår - kan i sjeldne tilfeller være negativ, se byggGrupper[].forklaring
  byggGrupper: RemainingByggGruppe[];
  lines: RemainingTenantLine[];
}

export interface Omsetningsavregning2025Info {
  avsetning: number;
  fordeltPerLeietaker: number;
  nettoEffekt2026: number;
}

export interface RemainingTenantsSnapshot {
  sistOppdatert: string;
  ar: number;
  totalBelop: number;
  antallLeietakere: number;
  tenants: RemainingTenant[];
  omsetningsavregning2025: Omsetningsavregning2025Info;
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
