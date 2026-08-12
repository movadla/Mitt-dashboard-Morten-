import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

export interface LeasingManager {
  id: string;
  name: string;
  ansvar: string; // f.eks. "CC Vest" eller "Parkering + Bolig"
  email?: string;
}

export interface NewLeasingManagerInput {
  name: string;
  ansvar: string;
  email?: string;
}

export interface LeasingManagerUpdateInput {
  name?: string;
  ansvar?: string;
  email?: string | null;
}

const HASH_KEY = "jobb:utleieansvarlige";

export async function getLeasingManagers(): Promise<LeasingManager[]> {
  const map = await hgetallJSON<LeasingManager>(HASH_KEY);
  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
}

export async function addLeasingManager(input: NewLeasingManagerInput): Promise<LeasingManager> {
  if (!input.name?.trim()) throw new Error("Utleieansvarlig mangler navn");
  if (!input.ansvar?.trim()) throw new Error("Utleieansvarlig mangler ansvarsområde");
  const manager: LeasingManager = {
    id: randomUUID(),
    name: input.name.trim(),
    ansvar: input.ansvar.trim(),
    email: input.email?.trim() || undefined,
  };
  await hsetJSON(HASH_KEY, manager.id, manager);
  return manager;
}

export async function updateLeasingManager(id: string, updates: LeasingManagerUpdateInput): Promise<LeasingManager | null> {
  const current = await hgetJSON<LeasingManager>(HASH_KEY, id);
  if (!current) return null;

  const name = updates.name !== undefined ? updates.name.trim() : current.name;
  if (!name) throw new Error("Utleieansvarlig mangler navn");
  const ansvar = updates.ansvar !== undefined ? updates.ansvar.trim() : current.ansvar;
  if (!ansvar) throw new Error("Utleieansvarlig mangler ansvarsområde");

  const next: LeasingManager = {
    ...current,
    name,
    ansvar,
    email: updates.email !== undefined ? (updates.email?.trim() || undefined) : current.email,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteLeasingManager(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
