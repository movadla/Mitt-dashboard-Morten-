import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

export type StoreSection =
  | "frukt-gront"
  | "frysevarer"
  | "palegg"
  | "meieriprodukter"
  | "drikke"
  | "snacks"
  | "torrvarer"
  | "baby"
  | "elektro"
  | "snop"
  | "annet";

export interface ShoppingItem {
  id: string;
  name: string;
  section: StoreSection;
  quantity?: string;
  done: boolean;
}

export interface NewShoppingItemInput {
  name: string;
  section: StoreSection;
  quantity?: string;
}

export interface ShoppingItemUpdateInput {
  name?: string;
  section?: StoreSection;
  quantity?: string | null; // null fjerner mengden, undefined lar den stå urørt
  done?: boolean;
}

const HASH_KEY = "privat:shopping";

export async function getShoppingItems(): Promise<ShoppingItem[]> {
  const map = await hgetallJSON<ShoppingItem>(HASH_KEY);
  return Object.values(map);
}

export async function addShoppingItem(input: NewShoppingItemInput): Promise<ShoppingItem> {
  if (!input.name?.trim()) throw new Error("Vare mangler navn");
  if (!input.section) throw new Error("Vare mangler butikkseksjon");
  const item: ShoppingItem = {
    id: randomUUID(),
    name: input.name.trim(),
    section: input.section,
    quantity: input.quantity?.trim() || undefined,
    done: false,
  };
  await hsetJSON(HASH_KEY, item.id, item);
  return item;
}

export async function toggleShoppingItem(id: string): Promise<ShoppingItem | null> {
  const current = await hgetJSON<ShoppingItem>(HASH_KEY, id);
  if (!current) return null;
  const next: ShoppingItem = { ...current, done: !current.done };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function updateShoppingItem(
  id: string,
  updates: ShoppingItemUpdateInput,
): Promise<ShoppingItem | null> {
  const current = await hgetJSON<ShoppingItem>(HASH_KEY, id);
  if (!current) return null;

  const name = updates.name !== undefined ? updates.name.trim() : current.name;
  if (!name) throw new Error("Vare mangler navn");

  const next: ShoppingItem = {
    ...current,
    name,
    section: updates.section !== undefined ? updates.section : current.section,
    quantity: updates.quantity !== undefined ? (updates.quantity ?? undefined) : current.quantity,
    done: updates.done !== undefined ? updates.done : current.done,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteShoppingItem(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}

export async function clearDoneShoppingItems(): Promise<void> {
  const map = await hgetallJSON<ShoppingItem>(HASH_KEY);
  await Promise.all(
    Object.values(map)
      .filter((i) => i.done)
      .map((i) => hdel(HASH_KEY, i.id)),
  );
}
