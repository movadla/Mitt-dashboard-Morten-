import { hdel, hgetallJSON, hsetJSON } from "./kv";

export interface EveningLogEntry {
  date: string; // "YYYY-MM-DD"
  categories: string[]; // undermengde av kategori-nøklene i EveningCheckIn.tsx
  notes: string;
  updatedAt: string; // ISO
}

const HASH_KEY = "privat:evening-log";

export async function getEveningLog(): Promise<EveningLogEntry[]> {
  const map = await hgetallJSON<EveningLogEntry>(HASH_KEY);
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

export async function upsertEveningLogEntry(
  date: string,
  categories: string[],
  notes: string,
): Promise<EveningLogEntry> {
  const entry: EveningLogEntry = { date, categories, notes, updatedAt: new Date().toISOString() };
  await hsetJSON(HASH_KEY, date, entry);
  return entry;
}

export async function deleteEveningLogEntry(date: string): Promise<void> {
  await hdel(HASH_KEY, date);
}
