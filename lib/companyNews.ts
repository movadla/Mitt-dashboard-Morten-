import { randomUUID } from "crypto";
import { hgetallJSON, hsetJSON, hdel } from "./kv";

// "Mustad-nyheter" — periodiske sammendrag Claude henter fra Teams, e-post,
// SharePoint, Salesforce og åpne nettsider i en arbeidsøkt (se
// app/api/company-news/route.ts for hvordan disse skrives inn) og som
// dashboardet deretter viser og lar Morten bla tilbake i historikk på —
// samme dato-nøklede Redis-hash-mønster som lib/receivablesSnapshots.ts.
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
