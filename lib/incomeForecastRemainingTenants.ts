import { hgetJSON } from "./kv";
import { anonymizeIfPerson, withProdAnonymization } from "./tenantAnonymize";

interface RemainingTenantLine {
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
  // v14: Mustad Eiendom AS som leietaker i bygg som kun eies av Mustad Eiendom AS selv - egenleie i
  // samme selskap, aldri bokførbar. Gjenstår 0 (i motsetning til intern-mustad, som er fakturerbar
  // konsernleie mellom to selskap).
  | "intern-egenleie"
  | "forklart-parkering-onepark"
  | "forklart-parkering-uten-fazile-linje"
  // v13: modellen sier det gjenstår penger, men Fazile har ingen planlagt faktura for resten av
  // året - beholdt modelltall, må avgjøres manuelt (kontrakt ikke aktivert / fakturering stoppet /
  // reelt ferdig fakturert).
  | "fazile-plan-mangler"
  // v56: avtale/oppstart ikke sikret - gjenstår er tatt ut herfra og ligger i `usikreInntekter`
  // (vektes under Risikoforhold i UI-en).
  | "usikker-oppstart";

// v56 (2026-09-18): inntekt modellen regner med, men som ikke er sikret (estimert oppstart,
// avtale ikke endelig). Tatt UT av gjenstår i REMAINING; UI-en legger det vektede beløpet inn i
// prognosen én gang, med sannsynlighet fra jobb:inntektsprognose-signaler (id = usikkerSignalId).
// v59 (2026-09-19): rene informasjonsrisikoer for "Øvrig risiko i prognosen" - teller ALDRI i noen
// sum (verken gjenstår, vektet risiko eller hovedprognosen), kun en opplysende rad i UI-en. Se
// scripts/refresh-data/_private-ovrig-risiko.json.
export interface OvrigRisikoManuellRad {
  leietaker: string;
  forklaring: string;
  belop: number;
}

export interface UsikkerInntekt {
  leietaker: string;
  bygg: string;
  kontraktId: number | null;
  leietype: string | null;
  startDato: string | null;
  belop: number;
  belopDelA: number;
  belopDelB: number;
  forklaring: string;
}

export interface RemainingKontoBelop {
  konto: string;
  belop: number;
}

interface RemainingByggGruppe {
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

interface RemainingTenant {
  navn: string;
  fullArsverdi2026: number;
  alleredeFakturertNxt2026: number;
  totalBelop: number; // netto gjenstår - kan i sjeldne tilfeller være negativ, se byggGrupper[].forklaring
  byggGrupper: RemainingByggGruppe[];
  lines: RemainingTenantLine[];
}

interface Omsetningsavregning2025Info {
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
interface FazileFakturaplanInfo {
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

// v55 (2026-09-18): avstemming av leietaker-summen ("allerede fakturert" summert over alle
// byggGrupper) mot den kontobaserte NXT-summen (samme grunnlag som BOOKED_3600_3699) - regnet ut i
// scripts/build-remaining-summary.js. `forklart` er de bevisste grepene i scriptet, `ikkeKonsumertNxt`
// er NXT-bokføring på kunder/bygg ingen Fazile-kontrakt tok inn, og `uforklartRest` skal være ~0.
export interface AvstemmingMotNxt {
  nxtBokfort36xx: number;
  remainingFakturert: number;
  differanse: number;
  forklart: { post: string; belop: number }[];
  uforklartRest: number;
  ikkeKonsumertNxt: {
    antall: number;
    sum: number;
    storste: { selskap: string; customerNo: number; navn: string; bygg: string; belop: number }[];
  };
}

export interface RemainingTenantsSnapshot {
  sistOppdatert: string;
  ar: number;
  totalBelop: number;
  antallLeietakere: number;
  tenants: RemainingTenant[];
  omsetningsavregning2025: Omsetningsavregning2025Info;
  fazileFakturaplan?: FazileFakturaplanInfo | null;
  avstemmingMotNxt?: AvstemmingMotNxt;
  usikreInntekter?: UsikkerInntekt[];
  ovrigRisikoManuell?: OvrigRisikoManuellRad[];
  // v17 (2026-09-07): data-kvalitetsvarsler fra scripts/build-remaining-summary.js sin egen
  // kjøring (manglende crosswalk/detaljfiler, ekstrapoleringskandidater uten kontraktslinje-
  // sluttdato, o.l.) - tidligere kun synlig i konsollen til den som kjørte scriptet, nå med i
  // snapshotet slik at ReconciliationPanel (app/IncomeForecastSection.tsx) kan vise dem.
  advarsler?: string[];
  // v70 (2026-09-24, controller-notat punkt 3): fullstendighets-sjekk av selve KILDEN (antall/
  // beløp Fazile-kildelinjer i dette uttrekket vs. forrige kjøring), ikke bare nøyaktighet av
  // det som ble fanget opp. Vises kun i det skjulte "Verktøy og avstemming"-panelet.
  fullstendighetssjekk?: {
    antallKildelinjer: number;
    sumKildelinjer: number;
    forrigeAntallKildelinjer: number | null;
    forrigeSumKildelinjer: number | null;
    forrigeSistOppdatert: string | null;
    avvikAntallPct: number | null;
    avvikSumPct: number | null;
    mistenkelig: boolean;
    sistOppdatert: string;
  };
}

const HASH_KEY = "jobb:inntektsprognose-gjenstar-leietakere";
const FIELD = "snapshot";

function anonymizeSnapshot(snapshot: RemainingTenantsSnapshot): RemainingTenantsSnapshot {
  return {
    ...snapshot,
    tenants: snapshot.tenants.map((t) => ({ ...t, navn: anonymizeIfPerson(t.navn) })),
    usikreInntekter: snapshot.usikreInntekter?.map((u) => ({ ...u, leietaker: anonymizeIfPerson(u.leietaker) })),
    ovrigRisikoManuell: snapshot.ovrigRisikoManuell?.map((r) => ({ ...r, leietaker: anonymizeIfPerson(r.leietaker) })),
  };
}

export async function getRemainingTenantsSnapshot(): Promise<RemainingTenantsSnapshot | null> {
  const snapshot = await hgetJSON<RemainingTenantsSnapshot>(HASH_KEY, FIELD);
  if (!snapshot) return null;
  // Samme app kjører både lokalt (ekte data ønsket) og på den offentlige Vercel-siden
  // (kun demokunder tillatt) mot SAMME Redis - anonymiser derfor privatpersoner i farten
  // her, ikke ved lagring, se ANONYMISERING.md.
  return withProdAnonymization(snapshot, anonymizeSnapshot);
}
