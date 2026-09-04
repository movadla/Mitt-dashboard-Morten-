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
  | "forklart-historisk-kundenummer"
  | "forklart-manglende-linje"
  | "intern-mustad"
  | "forklart-parkering-onepark"
  | "forklart-parkering-uten-fazile-linje"
  // v13: modellen sier det gjenstår penger, men Fazile har ingen planlagt faktura for resten av
  // året - beholdt modelltall, må avgjøres manuelt (kontrakt ikke aktivert / fakturering stoppet /
  // reelt ferdig fakturert).
  | "fazile-plan-mangler";

export interface RemainingKontoBelop {
  konto: string;
  belop: number;
}

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
  // NXT-kontofordeling av alleredeFakturertDelA/DelB (pr. bokføringskonto) - kun til drilldown-
  // visning i UI-en (app/IncomeForecastSection.tsx), ikke brukt i noen beregning. Valgfri siden
  // enkelte synteiske byggGrupper (Onepark-estimatet) ikke har noen reell kontofordeling.
  kontoFordelingDelA?: RemainingKontoBelop[];
  kontoFordelingDelB?: RemainingKontoBelop[];
  // v13: hvor gjenstår-tallet kommer fra. "fazile-fakturaplan" = summen av Fazile sine
  // genererte/planlagte fakturalinjer for resten av året (primærkilde); "modell" = Fazile-årsverdi
  // minus NXT-bokført (fallback der Fazile mangler plan). modellGjenstarTotal er alltid modellens
  // tall, slik at avviket mot planen kan vises i drilldownen.
  gjenstarKilde?: "fazile-fakturaplan" | "modell";
  modellGjenstarTotal?: number;
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
  // v13: kreditnotaer bokført på 3630 (minimumsleie) som speiler en avregning på 3632 - nøytralisert
  // parvis så avregningen ikke trekker ned gjenstår-husleien. Ren sammenslåing av 3630+3632 var
  // ikke trygg (3630 bærer også ordinær minimumsleie, 3632 ubalanserte a konto-poster).
  kreditnotaerPaa3630Noytralisert?: number;
  antallKreditnotaerPaa3630Noytralisert?: number;
}

// v13: metadata om Fazile-fakturaplanen som er brukt som primærkilde for gjenstår. null hvis
// planen ikke var tilgjengelig og modellen ble brukt alene.
export interface FazileFakturaplanInfo {
  uttrekksdato: string;
  nxtCacheDato: string;
  planStart: string;
  antallFakturaer: number;
  sumPlan36xx: number;
  antallLeieforholdMedPlan: number;
  antallPlanMangler: number;
  sumPlanMangler: number;
  gamlePerioderBelop: number;
  ekstrapolertBelop: number;
  antallEkstrapolerteLinjer: number;
}

export interface RemainingTenantsSnapshot {
  sistOppdatert: string;
  ar: number;
  totalBelop: number;
  antallLeietakere: number;
  tenants: RemainingTenant[];
  omsetningsavregning2025: Omsetningsavregning2025Info;
  fazileFakturaplan?: FazileFakturaplanInfo | null;
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
