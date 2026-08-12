import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";
import type { EventCategory, LifeEvent } from "./payday";

export type { EventCategory, LifeEvent } from "./payday";
export { isPaydayToday, nextOccurrence, nextPaydayFrom } from "./payday";

export interface NewLifeEventInput {
  title: string;
  date: string;
  category: EventCategory;
  yearly?: boolean;
  note?: string;
}

export interface LifeEventUpdateInput {
  title?: string;
  date?: string;
  category?: EventCategory;
  yearly?: boolean;
  note?: string | null;
}

const HASH_KEY = "privat:hendelser";

export async function getLifeEvents(): Promise<LifeEvent[]> {
  const map = await hgetallJSON<LifeEvent>(HASH_KEY);
  return Object.values(map);
}

export async function addLifeEvent(input: NewLifeEventInput): Promise<LifeEvent> {
  if (!input.title?.trim()) throw new Error("Hendelse mangler tittel");
  if (!input.date) throw new Error("Hendelse mangler dato");
  if (!input.category) throw new Error("Hendelse mangler kategori");
  const event: LifeEvent = {
    id: randomUUID(),
    title: input.title.trim(),
    date: input.date,
    category: input.category,
    yearly: input.yearly ?? false,
    note: input.note?.trim() || undefined,
  };
  await hsetJSON(HASH_KEY, event.id, event);
  return event;
}

export async function updateLifeEvent(id: string, updates: LifeEventUpdateInput): Promise<LifeEvent | null> {
  const current = await hgetJSON<LifeEvent>(HASH_KEY, id);
  if (!current) return null;

  const title = updates.title !== undefined ? updates.title.trim() : current.title;
  if (!title) throw new Error("Hendelse mangler tittel");
  const date = updates.date !== undefined ? updates.date : current.date;
  if (!date) throw new Error("Hendelse mangler dato");

  const next: LifeEvent = {
    ...current,
    title,
    date,
    category: updates.category !== undefined ? updates.category : current.category,
    yearly: updates.yearly !== undefined ? updates.yearly : current.yearly,
    note: updates.note !== undefined ? (updates.note ?? undefined) : current.note,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteLifeEvent(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
