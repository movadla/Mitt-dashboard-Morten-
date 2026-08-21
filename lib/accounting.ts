import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

export type AccountingEntryType = "inntekt" | "utgift";

export interface AccountingEntry {
  id: string;
  type: AccountingEntryType;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  note?: string;
}

export interface NewAccountingEntryInput {
  type: AccountingEntryType;
  description: string;
  amount: number;
  date: string;
  note?: string;
}

export interface AccountingEntryUpdateInput {
  type?: AccountingEntryType;
  description?: string;
  amount?: number;
  date?: string;
  note?: string | null;
}

const HASH_KEY = "privat:accounting";

function sortEntries(entries: AccountingEntry[]): AccountingEntry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date));
}

export async function getAccountingEntries(): Promise<AccountingEntry[]> {
  const map = await hgetallJSON<AccountingEntry>(HASH_KEY);
  return sortEntries(Object.values(map));
}

export async function addAccountingEntry(input: NewAccountingEntryInput): Promise<AccountingEntry> {
  if (!input.description?.trim()) throw new Error("Posten mangler beskrivelse");
  if (typeof input.amount !== "number" || Number.isNaN(input.amount)) throw new Error("Posten mangler beløp");
  if (!input.date) throw new Error("Posten mangler dato");
  if (input.type !== "inntekt" && input.type !== "utgift") throw new Error("Ugyldig type");
  const entry: AccountingEntry = {
    id: randomUUID(),
    type: input.type,
    description: input.description.trim(),
    amount: input.amount,
    date: input.date,
    note: input.note,
  };
  await hsetJSON(HASH_KEY, entry.id, entry);
  return entry;
}

export async function updateAccountingEntry(id: string, updates: AccountingEntryUpdateInput): Promise<AccountingEntry | null> {
  const current = await hgetJSON<AccountingEntry>(HASH_KEY, id);
  if (!current) return null;

  const description = updates.description !== undefined ? updates.description.trim() : current.description;
  if (!description) throw new Error("Posten mangler beskrivelse");

  const next: AccountingEntry = {
    ...current,
    type: updates.type ?? current.type,
    description,
    amount: updates.amount !== undefined ? updates.amount : current.amount,
    date: updates.date ?? current.date,
    note: updates.note !== undefined ? (updates.note ?? undefined) : current.note,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteAccountingEntry(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
