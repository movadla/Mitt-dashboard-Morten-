import { randomUUID } from "crypto";
import { hgetallJSON, hsetJSON, hdel } from "./kv";

// "Mustad-nyheter" — periodiske sammendrag Claude henter fra Teams, e-post,
// SharePoint, Salesforce og åpne nettsider i en arbeidsøkt (se
// app/api/company-news/route.ts for hvordan disse skrives inn) og som
// dashboardet deretter viser og lar Morten bla tilbake i historikk på —
// samme dato-nøklede Redis-hash-mønster som lib/receivablesSnapshots.ts.
//
// `date` = datoen NYHETEN GJELDER/BLE PUBLISERT (den faktiske hendelsen),
// IKKE datoen Claude fant den i en research-økt — bruk den ekte hendelses-
// datoen selv om det er lenge siden (se "date": "2024-09-02"-eksempelet for
// styreleder-bytte), slik at historikk-navigeringen faktisk stemmer.
//
// Hva regnes som en nyhet (redaksjonelle kriterier fra Morten, 2026-08-19):
// alt som kan interessere ham i hans rolle og handler om Mustad. Eksempler:
// - Teams: noen skriver at man er i sluttforhandlinger med en stor kunde
// - En faktisk innflyttingsdato inntreffer (f.eks. en ny leietaker flytter inn)
// - Mustad Felles-kanalen i Teams: styremøter, allsamling, noe om ansatte
//   (nyansettelser, noen slutter, forfremmelser)
// - Reguleringsplan, oppkjøp/salg, nye større kontrakter, omsetning på CC,
//   økonomi, drift, utleie, marked, ledelse, HR
// Vær raus med hva som telles som nyhet heller enn streng — målet er at
// Morten skal få med seg ting han ellers ville måttet lete etter selv.
//
// KJENTE GJENTAKENDE KILDER — søk ALLTID opp disse spesifikt (avsender-/
// kanalnavn), ikke bare generiske nettsøk/nøkkelord. Generiske søk (WebSearch,
// SharePoint-fritekst) finner nesten aldri interne e-poster/Teams-tråder — det
// var feilen 2026-08-19 som gjorde at en 2024-tall for CC Vest-omsetning stod
// uimotsagt lenge etter at ferskere data fantes i innboksen:
// - "Harald" / harald.t.nilsen@gmail.com (Harald T Nilsen, Handelsanalyse):
//   sender MÅNEDLIG omsetningsrapport for CC Vest til Olav Line, Camilla Bang
//   Hoff, Jeanette Andersson, Tone Engnes m.fl. — søk outlook_email_search
//   med sender:"harald" hver runde, ikke bare webCC Vest-søk.
// - "Mustad Felles"-kanalen i Teams: styremøter, allsamling, ansatte.
// Legg til nye kjente avsendere/kanaler her når de dukker opp, slik at neste
// research-runde vet å sjekke dem direkte i stedet for å gjette på nytt.
//
// SIST OPPDATERT vs. HENDELSESDATO: UI viser begge — `date` (se over) for når
// hendelsen faktisk skjedde, og `createdAt` for når Claude la den inn her
// (vises som "lagt inn i dashboardet Xt/Xd siden" og en samlet "sist
// research-runde"-tekst i toppen av seksjonen). Bland ikke disse to — det er
// nettopp forskjellen på dem som lar Morten vurdere hvor fersk informasjonen
// faktisk er.
export type NewsCategory =
  | "regulering"
  | "oppkjop-salg"
  | "kontrakter"
  | "personal"
  | "styremote"
  | "omsetning-cc"
  | "okonomi"
  | "drift"
  | "utleie"
  | "marked"
  | "ledelse"
  | "hr"
  | "annet";

export type NewsSourceType = "teams" | "email" | "sharepoint" | "salesforce" | "web" | "annet";

export type NewsImportance = "hoy" | "middels" | "lav";

export interface NewsItem {
  id: string;
  date: string; // YYYY-MM-DD — dagen nyheten gjelder/ble funnet
  category: NewsCategory;
  title: string;
  summary: string;
  fullText?: string;
  sourceType: NewsSourceType;
  sourceRef?: string; // lenke eller referanse (URL, SF-sak-ID, Teams-kanal-navn)
  importance: NewsImportance;
  createdAt: string; // ISO — når oppføringen ble lagt inn
}

export interface NewNewsItemInput {
  date: string;
  category: NewsCategory;
  title: string;
  summary: string;
  fullText?: string;
  sourceType: NewsSourceType;
  sourceRef?: string;
  importance: NewsImportance;
}

const HASH_KEY = "jobb:mustad-nyheter";

// Ett felt per dato — verdien er ALLE nyhetene for den dagen samlet, slik at
// flere oppføringer samme dag ikke overskriver hverandre (i motsetning til
// om vi hadde brukt dato som eneste nøkkel per oppføring).
export async function getAllCompanyNews(): Promise<NewsItem[]> {
  const map = await hgetallJSON<NewsItem[]>(HASH_KEY);
  return Object.values(map)
    .flat()
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export async function getCompanyNewsForDate(date: string): Promise<NewsItem[]> {
  const map = await hgetallJSON<NewsItem[]>(HASH_KEY);
  return map[date] ?? [];
}

// Legger til en batch nyheter — grupperer på dato og SLÅR SAMMEN med det som
// allerede ligger der for hver dato (i stedet for å overskrive), slik at flere
// separate research-runder samme dag ikke sletter tidligere funn.
export async function addCompanyNewsItems(inputs: NewNewsItemInput[]): Promise<NewsItem[]> {
  const createdAt = new Date().toISOString();
  const byDate = new Map<string, NewNewsItemInput[]>();
  for (const input of inputs) {
    const list = byDate.get(input.date) ?? [];
    list.push(input);
    byDate.set(input.date, list);
  }

  const created: NewsItem[] = [];
  for (const [date, items] of byDate) {
    const existing = await getCompanyNewsForDate(date);
    const newItems: NewsItem[] = items.map((input) => ({
      id: randomUUID(),
      createdAt,
      ...input,
    }));
    await hsetJSON(HASH_KEY, date, [...existing, ...newItems]);
    created.push(...newItems);
  }
  return created;
}

export async function deleteCompanyNewsItem(date: string, id: string): Promise<void> {
  const existing = await getCompanyNewsForDate(date);
  const next = existing.filter((item) => item.id !== id);
  if (next.length === 0) {
    await hdel(HASH_KEY, date);
  } else {
    await hsetJSON(HASH_KEY, date, next);
  }
}
