import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

export interface SavingsAccount {
  id: string;
  name: string; // f.eks. "Fondskonto" eller "Nordnet ISK"
  institution: string;
  balance: number;
  note?: string;
}

export interface NewSavingsInput {
  name: string;
  institution: string;
  balance: number;
  note?: string;
}

export interface SavingsUpdateInput {
  name?: string;
  institution?: string;
  balance?: number;
  note?: string | null;
}

const HASH_KEY = "privat:savings";

function sortSavings(items: SavingsAccount[]): SavingsAccount[] {
  return [...items].sort((a, b) => b.balance - a.balance);
}

export async function getSavings(): Promise<SavingsAccount[]> {
  const map = await hgetallJSON<SavingsAccount>(HASH_KEY);
  return sortSavings(Object.values(map));
}

export async function addSavings(input: NewSavingsInput): Promise<SavingsAccount> {
  if (!input.name?.trim()) throw new Error("Sparekonto mangler navn");
  if (!input.institution?.trim()) throw new Error("Sparekonto mangler bank");
  if (typeof input.balance !== "number" || Number.isNaN(input.balance)) {
    throw new Error("Sparekonto mangler saldo");
  }
  const account: SavingsAccount = {
    id: randomUUID(),
    name: input.name.trim(),
    institution: input.institution.trim(),
    balance: input.balance,
    note: input.note,
  };
  await hsetJSON(HASH_KEY, account.id, account);
  return account;
}

export async function updateSavings(id: string, updates: SavingsUpdateInput): Promise<SavingsAccount | null> {
  const current = await hgetJSON<SavingsAccount>(HASH_KEY, id);
  if (!current) return null;

  const name = updates.name !== undefined ? updates.name.trim() : current.name;
  if (!name) throw new Error("Sparekonto mangler navn");
  const institution = updates.institution !== undefined ? updates.institution.trim() : current.institution;
  if (!institution) throw new Error("Sparekonto mangler bank");

  const next: SavingsAccount = {
    ...current,
    name,
    institution,
    balance: updates.balance !== undefined ? updates.balance : current.balance,
    note: updates.note !== undefined ? (updates.note ?? undefined) : current.note,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteSavings(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
