import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

// Redis-backet ansatte-liste for Oppslag-fanen — flyttet ut av
// lib/companyInfo.local.ts (som var en statisk, ikke-redigerbar fil) slik at
// "employee"-forslag fra research-runder (lib/jobbSuggestions.ts) faktisk
// kan godtas og skrive en ekte oppføring, og slik at Morten selv kan
// redigere listen i UI — samme mønster som lib/leasingManagers.ts.
export interface Employee {
  id: string;
  name: string;
  title?: string;
  department?: string;
}

export interface NewEmployeeInput {
  name: string;
  title?: string;
  department?: string;
}

export interface EmployeeUpdateInput {
  name?: string;
  title?: string | null;
  department?: string | null;
}

const HASH_KEY = "jobb:ansatte";

export async function getEmployees(): Promise<Employee[]> {
  const map = await hgetallJSON<Employee>(HASH_KEY);
  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
}

export async function addEmployee(input: NewEmployeeInput): Promise<Employee> {
  if (!input.name?.trim()) throw new Error("Ansatt mangler navn");
  const employee: Employee = {
    id: randomUUID(),
    name: input.name.trim(),
    title: input.title?.trim() || undefined,
    department: input.department?.trim() || undefined,
  };
  await hsetJSON(HASH_KEY, employee.id, employee);
  return employee;
}

export async function updateEmployee(id: string, updates: EmployeeUpdateInput): Promise<Employee | null> {
  const current = await hgetJSON<Employee>(HASH_KEY, id);
  if (!current) return null;

  const name = updates.name !== undefined ? updates.name.trim() : current.name;
  if (!name) throw new Error("Ansatt mangler navn");

  const next: Employee = {
    ...current,
    name,
    title: updates.title !== undefined ? (updates.title?.trim() || undefined) : current.title,
    department: updates.department !== undefined ? (updates.department?.trim() || undefined) : current.department,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteEmployee(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
