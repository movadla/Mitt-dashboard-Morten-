import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";
import type { StoreSection } from "./shoppingList";

// Katalog over varer som har vært lagt til handlelisten før — uavhengig av
// selve handlelisten (som tømmes jevnlig via "Tøm kjøpte"). Bygges opp
// automatisk hver gang en vare legges til (skrevet inn eller valgt fra
// hurtigvalg), slik at man slipper å skrive inn de samme varene om og om igjen.
export interface QuickPick {
  id: string;
  name: string;
  section: StoreSection;
  count: number; // antall ganger valgt/lagt til — styrer sortering (mest brukte øverst)
  createdAt: string;
}

export interface QuickPickUpdateInput {
  name?: string;
  section?: StoreSection;
}

const HASH_KEY = "privat:shopping-quickpicks";

function sortQuickPicks(picks: QuickPick[]): QuickPick[] {
  return [...picks].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "nb"));
}

export async function getQuickPicks(): Promise<QuickPick[]> {
  const map = await hgetallJSON<QuickPick>(HASH_KEY);
  return sortQuickPicks(Object.values(map));
}

// Matcher på navn (case-insensitive) — finnes fra før økes telleren, ellers
// opprettes et nytt hurtigvalg med telling 1.
export async function recordQuickPickUsage(name: string, section: StoreSection): Promise<QuickPick> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Vare mangler navn");

  const map = await hgetallJSON<QuickPick>(HASH_KEY);
  const existing = Object.values(map).find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    const next: QuickPick = { ...existing, count: existing.count + 1 };
    await hsetJSON(HASH_KEY, next.id, next);
    return next;
  }

  const created: QuickPick = {
    id: randomUUID(),
    name: trimmed,
    section,
    count: 1,
    createdAt: new Date().toISOString(),
  };
  await hsetJSON(HASH_KEY, created.id, created);
  return created;
}

export async function updateQuickPick(id: string, updates: QuickPickUpdateInput): Promise<QuickPick | null> {
  const current = await hgetJSON<QuickPick>(HASH_KEY, id);
  if (!current) return null;

  const name = updates.name !== undefined ? updates.name.trim() : current.name;
  if (!name) throw new Error("Vare mangler navn");

  const next: QuickPick = {
    ...current,
    name,
    section: updates.section !== undefined ? updates.section : current.section,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteQuickPick(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
