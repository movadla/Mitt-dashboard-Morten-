import { hgetJSON } from "./kv";
import { anonymizeIfPerson } from "./tenantAnonymize";
import { getTenantForecastComments } from "./tenantForecastComments";

export interface TenantForecastLine {
  eiendom: string;
  bygg: string;
  linjetype: string;
  beskrivelse: string;
  del: "A" | "B";
  fullArsverdi2026: number;
  // Kun satt for bygg-/leietype-grupperingen (en drilldown-rad der kan romme linjer fra flere
  // forskjellige leietakere) - leietaker-grupperingen trenger den ikke, siden raden ALLEREDE
  // er én bestemt leietaker.
  leietaker?: string;
  // Kontraktslinjens egne start-/sluttdato (ISO, kan være null) - brukes til å varsle når en
  // leietakers kontrakt starter eller slutter i 2026, se "Start/slutt 2026"-kolonnen i
  // app/IncomeForecastSection.tsx.
  startDato: string | null;
  sluttDato: string | null;
  // Byggruppens gjenstår-beløp proporsjonalt fordelt over linjene i gruppen (etter linjas andel
  // av full 2026-verdi) - REMAINING har kun gjenstår pr. byggGruppe, ikke pr. linje. Kun satt for
  // leietaker-grupperingen (se buildLeietakerMap() i build-tenant-forecast-table.js) - bygg-/
  // leietype-grupperingen bruker linesA/linesB sin egen fordeling, ikke dette feltet.
  gjenstarShare?: number;
  // Kun på gjenværende linjer i Ledig-rader (v15, 2026-09-06), hentet fra Finance sin egen
  // månedlige prognoselogg (ledig-finance-juli-2026.json i scripts/refresh-data):
  //  - ledigVurdering: "nullet" = Finance har tatt hele beløpet ut av prognosen (står ledig ut
  //    året), "forventet" = fortsatt forventet utleid i år (helt eller delvis).
  //  - financeEndring: Finance sin akkumulerte justering av linjen (jan-jul), kr/år, negativ =
  //    nedjustert.
  //  - financeKommentar: siste ikke-tomme månedskommentar, "mnd: tekst" (privatpersonnavn strippet
  //    ved bygging).
  ledigVurdering?: "forventet" | "nullet";
  financeEndring?: number;
  financeKommentar?: string;
  // Budsjettets egen "Kommentar inntekt" (Excel kol. AE) for gjenværende Ledig-linjer - hva Finance
  // budsjetterte utleid som ikke ble det. Samme tekst som suffikset i `beskrivelse` etter " — ".
  budsjettKommentar?: string;
}

// Én post som er trukket ut av en Ledig-rad (v15): en leietaker som har tatt linjen(e) (budsjettet
// er flyttet til leietakerens egen rad), internleie (flyttet til intern-raden) eller en
// dobbeltbudsjettert linje som bare er fjernet (leietakeren har allerede egen budsjettrad).
export interface LedigPost {
  navn: string;
  belop: number;
  type: "leietaker" | "intern" | "usporet";
  beskrivelse?: string;
}

export interface TenantForecastKonto {
  // NXT-bokføringskonto (f.eks. "3600"), eller en syntetisk merkelapp for en manuell korreksjon
  // (f.eks. "Overtatt fra gammelt kundenummer") - se RemainingKontoBelop i
  // lib/incomeForecastRemainingTenants.ts.
  konto: string;
  belop: number;
}

export type TenantForecastGruppering = "leietaker" | "bygg" | "leietype";

export interface TenantForecastRow {
  navn: string;
  fakturert: number;
  gjenstar: number;
  budsjett: number | null; // null = budsjett finnes strukturelt ikke her (Del B/parkering)
  avvik: number | null; // (fakturert + gjenstår) - budsjett; null hvis budsjett er null
  linjer: TenantForecastLine[];
  // NXT-kontofordeling av `fakturert` - kun satt for leietaker-grupperingen (bygg-/leietype-
  // grupperingen blander sammen flere leietakeres posteringer, gir ikke mening som én kontoliste).
  kontoer?: TenantForecastKonto[];
  // Kun satt for MUSTAD_INTERN_LABEL-raden (Mustad Eiendom/Eiendomsdrift sine egne lokaler) -
  // vises som fullt fakturert (fakturert=budsjett, gjenstår=0, avvik=0) siden det ikke er et
  // reelt eksternt leieforhold å måle mot NXT/Fazile, men markeres visuelt annerledes i UI-en.
  internleie?: boolean;
  // Fri kommentar Morten kan skrive inn pr. leietaker (kun "leietaker"-grupperingen - "bygg"/
  // "leietype" er aggregater av flere leietakere, gir ikke mening der). Lagres i en egen Redis-
  // hash (lib/tenantForecastComments.ts), IKKE i dette snapshotet, slik at kommentarer overlever
  // at pipelinen kjøres på nytt.
  kommentar?: string;
  // Navnet på en "Ledig <kortkode>"-rad denne leietakeren sannsynligvis flyttet inn i (satt av
  // scripts/build-tenant-forecast-table.js sin kobleFlyttetInnOgTrekkFra(), v7/v8 2026-08-28/29) -
  // UI-en nester slike rader under riktig Ledig-rad i stedet for å vise dem løsrevet, se
  // app/IncomeForecastSection.tsx sin TenantForecastTable/TenantDrilldown/LedigeLokalerBlock.
  flyttetInnI?: string;
  // Kun satt på Ledig-rader (v8, 2026-08-29; v15 2026-09-06 for alle Ledig-rader): `budsjett` over
  // er GJENSTÅENDE budsjett = summen av de Ledig-linjene som ikke er tatt av noen (aldri negativt
  // siden v15 - det som trekkes ut er eksakte linjeverdier). Disse feltene bevarer det opprinnelige
  // budsjetterte beløpet, summen som er trukket ut, og hva/hvem den består av, til bruk i den
  // dedikerte "Ledige lokaler"-oversikten.
  ledigOpprinneligBudsjett?: number;
  ledigTrukketUt?: number;
  ledigPoster?: LedigPost[];
}

export interface TenantForecastGrupper {
  leietaker: TenantForecastRow[];
  bygg: TenantForecastRow[];
  leietype: TenantForecastRow[];
}

export interface TenantForecastTableSnapshot {
  sistOppdatert: string;
  ar: number;
  delA: TenantForecastGrupper;
  delB: TenantForecastGrupper;
  // Parkering budsjetteres kun som ÉN totallinje i kildefila (ikke pr. leietaker/bygg/leietype -
  // se build-tenant-budget.js) - delB sine rader har derfor alltid budsjett=null, og denne
  // verdien brukes i stedet for én samlet Totalt-rad i UI-en.
  delBBudsjettTotal: number;
}

const HASH_KEY = "jobb:inntektsprognose-leietaker-tabell";
const FIELD = "snapshot";

// Syntetiske rad-navn fra scripts/build-tenant-budget.js (MUSTAD_INTERN_LABEL/AVSTEMMING_LABEL
// der) - IKKE ekte leietakernavn, og skal derfor ALDRI anonymiseres (ellers vises de som
// misvisende "Demokunde N" i prod). Hold i sync hvis label-tekstene endres.
const SYSTEM_ROW_LABELS = new Set([
  "Mustad Eiendom (intern bruk, ikke leieforhold)",
  "Avstemmingsdifferanse (Excel redigert etter at 'harde tall' ble limt inn i Oppsummering-arket)",
]);
// "Ledig (vakante lokaler)" er siden v6 (2026-08-28) splittet i én rad pr. bygg, og siden v8
// (2026-08-29) med korte radnavn ("Ledig V13D" osv., se BYGG_KORTKODE i build-tenant-budget.js) -
// derfor en prefix-sjekk her i stedet for eksakt Set-medlemskap som de to andre systemradene.
const LEDIG_ROW_PREFIX = "Ledig";

function isSystemRow(navn: string): boolean {
  return SYSTEM_ROW_LABELS.has(navn) || navn.startsWith(LEDIG_ROW_PREFIX);
}

// Ledig-radenes auto-kommentar (settAutoKommentar i build-tenant-forecast-table.js) lister
// postene ved navn - må bygges på nytt fra de anonymiserte postene i prod, ellers lekker
// privatpersonnavn via kommentarteksten selv om `ledigPoster` er anonymisert.
const LEDIG_AUTO_KOMMENTAR_PREFIX = "Utleid/trukket ut fra denne Ledig-raden";
const nb = (n: number) => n.toLocaleString("nb-NO");

function anonymizeRows(rows: TenantForecastRow[]): TenantForecastRow[] {
  return rows.map((r) => {
    const ledigPoster = r.ledigPoster?.map((p) => (p.type === "leietaker" ? { ...p, navn: anonymizeIfPerson(p.navn) } : p));
    const kommentar =
      ledigPoster && r.kommentar?.startsWith(LEDIG_AUTO_KOMMENTAR_PREFIX)
        ? `${LEDIG_AUTO_KOMMENTAR_PREFIX} (samlet ${nb(r.ledigTrukketUt ?? 0)} kr/år): ${ledigPoster.map((p) => `${p.navn} (${nb(p.belop)} kr)`).join("; ")}.`
        : r.kommentar;
    return {
      ...r,
      navn: isSystemRow(r.navn) ? r.navn : anonymizeIfPerson(r.navn),
      linjer: r.linjer.map((l) => (l.leietaker ? { ...l, leietaker: anonymizeIfPerson(l.leietaker) } : l)),
      ...(ledigPoster ? { ledigPoster } : {}),
      ...(kommentar !== undefined ? { kommentar } : {}),
    };
  });
}

function anonymizeGrupper(grupper: TenantForecastGrupper): TenantForecastGrupper {
  return {
    leietaker: anonymizeRows(grupper.leietaker),
    bygg: anonymizeRows(grupper.bygg),
    leietype: anonymizeRows(grupper.leietype),
  };
}

function withComments(rows: TenantForecastRow[], comments: Record<string, string>): TenantForecastRow[] {
  return rows.map((r) => {
    const kommentar = comments[r.navn.trim().toLowerCase()];
    return kommentar ? { ...r, kommentar } : r;
  });
}

export async function getTenantForecastTable(): Promise<TenantForecastTableSnapshot | null> {
  const [snapshot, comments] = await Promise.all([
    hgetJSON<TenantForecastTableSnapshot>(HASH_KEY, FIELD),
    getTenantForecastComments(),
  ]);
  if (!snapshot) return null;
  // Kommentarer kobles inn FØR anonymisering (matcher på ekte navn - se withComments).
  const withKommentarer: TenantForecastTableSnapshot = {
    ...snapshot,
    delA: { ...snapshot.delA, leietaker: withComments(snapshot.delA.leietaker, comments) },
    delB: { ...snapshot.delB, leietaker: withComments(snapshot.delB.leietaker, comments) },
  };
  // Samme app kjører både lokalt (ekte data ønsket) og på den offentlige Vercel-siden
  // (kun demokunder tillatt) mot SAMME Redis - anonymiser derfor privatpersoner i farten
  // her, ikke ved lagring, se ANONYMISERING.md.
  if (process.env.NODE_ENV === "production") {
    return { ...withKommentarer, delA: anonymizeGrupper(withKommentarer.delA), delB: anonymizeGrupper(withKommentarer.delB) };
  }
  return withKommentarer;
}
