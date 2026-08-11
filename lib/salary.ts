import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

export interface SalaryEntry {
  id: string;
  person: string; // f.eks. "Morten" eller "Charlotte"
  employer: string;
  grossMonthly: number;
  netMonthly?: number;
  note?: string;
}

export interface NewSalaryInput {
  person: string;
  employer: string;
  grossMonthly: number;
  netMonthly?: number;
  note?: string;
}

export interface SalaryUpdateInput {
  person?: string;
  employer?: string;
  grossMonthly?: number;
  netMonthly?: number | null;
  note?: string | null;
}

const HASH_KEY = "privat:salary";

function sortSalary(items: SalaryEntry[]): SalaryEntry[] {
  return [...items].sort((a, b) => a.person.localeCompare(b.person));
}

export async function getSalaryEntries(): Promise<SalaryEntry[]> {
  const map = await hgetallJSON<SalaryEntry>(HASH_KEY);
  return sortSalary(Object.values(map));
}

export async function addSalaryEntry(input: NewSalaryInput): Promise<SalaryEntry> {
  if (!input.person?.trim()) throw new Error("Mangler person");
  if (!input.employer?.trim()) throw new Error("Mangler arbeidsgiver");
  if (typeof input.grossMonthly !== "number" || Number.isNaN(input.grossMonthly)) {
    throw new Error("Mangler bruttolønn");
  }
  const entry: SalaryEntry = {
    id: randomUUID(),
    person: input.person.trim(),
    employer: input.employer.trim(),
    grossMonthly: input.grossMonthly,
    netMonthly: input.netMonthly,
    note: input.note,
  };
  await hsetJSON(HASH_KEY, entry.id, entry);
  return entry;
}

export async function updateSalaryEntry(id: string, updates: SalaryUpdateInput): Promise<SalaryEntry | null> {
  const current = await hgetJSON<SalaryEntry>(HASH_KEY, id);
  if (!current) return null;

  const person = updates.person !== undefined ? updates.person.trim() : current.person;
  if (!person) throw new Error("Mangler person");
  const employer = updates.employer !== undefined ? updates.employer.trim() : current.employer;
  if (!employer) throw new Error("Mangler arbeidsgiver");

  const next: SalaryEntry = {
    ...current,
    person,
    employer,
    grossMonthly: updates.grossMonthly !== undefined ? updates.grossMonthly : current.grossMonthly,
    netMonthly: updates.netMonthly !== undefined ? (updates.netMonthly ?? undefined) : current.netMonthly,
    note: updates.note !== undefined ? (updates.note ?? undefined) : current.note,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteSalaryEntry(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
