import { hgetJSON } from "./kv";
import { anonymizeIfPerson, withProdAnonymization } from "./tenantAnonymize";
import { getTenantForecastComments } from "./tenantForecastComments";
import { isSystemRow } from "./tenantForecastSystemRow";

// Re-eksportert for eksisterende importer (lib/tenantForecastTable.test.ts) - selve
// definisjonen bor i tenantForecastSystemRow.ts siden DENNE filen importerer kv.ts (server-only)
// på toppnivå, se dens filhode for hvorfor det er farlig for klientkode.
export { isSystemRow } from "./tenantForecastSystemRow";

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
interface LedigPost {
  navn: string;
  belop: number;
  // "nestet" manglet her til 2026-09-18 selv om build-tenant-forecast-table.js har sendt den
  // siden v52 - en leietaker som har flyttet inn i arealet UTEN egen budsjettlinje. Den teller
  // bevisst ikke i `ledigTrukketUt` (se "v52: 'nestet' teller IKKE i sum" der), fordi arealet
  // allerede ligger i de gjenværende forventet-linjene. Konsumenter som summerer poster må
  // filtrere den bort, ellers dobbelttelles beløpet.
  type: "leietaker" | "intern" | "usporet" | "nestet";
  beskrivelse?: string;
  // v60 (2026-09-19, Morten: "Ledige lokaler" er ren info, positive avvik bør vises): leietakerens
  // EGEN fullårsverdi på nøyaktig dette bygget (fra deres egne Fazile-linjer), uavhengig av `belop`
  // (som er en skive av det GAMLE Ledig-budsjettet, aldri større enn budsjettet selv). Mangler for
  // "usporet"-poster (ingen leietakerrad å hente fra) - UI-en faller da tilbake til `belop`.
  faktiskInntekt?: number;
}

interface TenantForecastKonto {
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
  // v16 (2026-09-07) match-kvalitet, kun "leietaker"-grupperingen. Gjør det synlig i UI-en hvor
  // usikker koblingen mellom de tre kildene er, slik at en fuzzy-kobling med stort beløp kan
  // kontrolleres - i stedet for at den ser like sikker ut som en kundenummer-match.
  // - remainingStatuser: byggGruppe-statuser i REMAINING utenom "ok" (avsluttet, forklart-*,
  //   fazile-plan-mangler, ikke-matchet-i-nxt, intern-*).
  // - nxtMatch: den svakeste NXT-koblingen blant byggGruppene: "kundenr" | "navn-eksakt" |
  //   "alias" | "kjerne-navn" | "ingen".
  // - budsjettVia: hvordan budsjettraden(e) ble funnet: "alias" | "eksakt" | "kjerne-navn" |
  //   "bygg+beskrivelse" | "delstreng" | "kjerne-navn (tabell)" | "uten treff".
  // - excelNavn: navnet/navnene budsjettarket brukte når det avviker fra Fazile-navnet.
  remainingStatuser?: string[];
  nxtMatch?: string;
  budsjettVia?: string[];
  excelNavn?: string[];
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
  // v17 (2026-09-07): sum-garanti-/data-kvalitetsvarsler fra scripts/build-tenant-forecast-table.js
  // sin egen kjøring ("fant ingen linje som matcher", "gjenstående budsjett != sum linjer", o.l.) -
  // tidligere kun console.warn, nå med i snapshotet slik at ReconciliationPanel kan vise dem.
  advarsler?: string[];
}

const HASH_KEY = "jobb:inntektsprognose-leietaker-tabell";
const FIELD = "snapshot";

// isSystemRow (og SYSTEM_ROW_LABELS/LEDIG_ROW_PREFIX) bor i ./tenantForecastSystemRow - se
// import/re-export øverst i filen og den filens eget filhode for hvorfor.

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
      ...(r.excelNavn ? { excelNavn: r.excelNavn.map(anonymizeIfPerson) } : {}),
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
  // v69 (2026-09-20, Morten: "enkel forklarbar kommentar til avvikene pr. leietype ... og
  // forklaring også på avvikene pr. bygg"): bygg-/leietype-radene har samme auto-kommentar-
  // mekanisme som leietaker-radene (skrevet av settAutoKommentarAggregat() i
  // build-tenant-forecast-table.js) - må derfor kobles inn her på samme måte, ellers vises de
  // aldri (withComments ble tidligere kun kalt på leietaker-arrayene).
  const withKommentarer: TenantForecastTableSnapshot = {
    ...snapshot,
    delA: {
      leietaker: withComments(snapshot.delA.leietaker, comments),
      bygg: withComments(snapshot.delA.bygg, comments),
      leietype: withComments(snapshot.delA.leietype, comments),
    },
    delB: {
      leietaker: withComments(snapshot.delB.leietaker, comments),
      bygg: withComments(snapshot.delB.bygg, comments),
      leietype: withComments(snapshot.delB.leietype, comments),
    },
  };
  // Samme app kjører både lokalt (ekte data ønsket) og på den offentlige Vercel-siden
  // (kun demokunder tillatt) mot SAMME Redis - anonymiser derfor privatpersoner i farten
  // her, ikke ved lagring, se ANONYMISERING.md.
  return withProdAnonymization(withKommentarer, (s) => ({
    ...s,
    delA: anonymizeGrupper(s.delA),
    delB: anonymizeGrupper(s.delB),
  }));
}
