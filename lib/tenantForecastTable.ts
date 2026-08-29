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
}

export type TenantForecastGruppering = "leietaker" | "bygg" | "leietype";

export interface TenantForecastRow {
  navn: string;
  fakturert: number;
  gjenstar: number;
  budsjett: number | null; // null = budsjett finnes strukturelt ikke her (Del B/parkering)
  avvik: number | null; // (fakturert + gjenstår) - budsjett; null hvis budsjett er null
  linjer: TenantForecastLine[];
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
  // Kun satt på Ledig-rader (v8, 2026-08-29): `budsjett` over er GJENSTÅENDE budsjett etter at
  // bekreftet utleide arealer er trukket fra (gulvet på 0 ved overtrekk) - disse to feltene
  // bevarer henholdsvis det opprinnelige budsjetterte beløpet og summen som er trukket fra, til
  // bruk i den dedikerte "Ledige lokaler"-oversikten.
  ledigOpprinneligBudsjett?: number;
  ledigTrukketUt?: number;
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

function anonymizeRows(rows: TenantForecastRow[]): TenantForecastRow[] {
  return rows.map((r) => ({
    ...r,
    navn: isSystemRow(r.navn) ? r.navn : anonymizeIfPerson(r.navn),
    linjer: r.linjer.map((l) => (l.leietaker ? { ...l, leietaker: anonymizeIfPerson(l.leietaker) } : l)),
  }));
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
