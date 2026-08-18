import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";
import type { EventCategory, LifeEvent, LifeEventRecurrence } from "./payday";

export type { EventCategory, LifeEvent, LifeEventRecurrence } from "./payday";
export { isPaydayToday, nextOccurrence, nextPaydayFrom } from "./payday";

export interface NewLifeEventInput {
  title: string;
  date: string;
  category: EventCategory;
  recurrence?: LifeEventRecurrence;
}

export interface LifeEventUpdateInput {
  title?: string;
  date?: string;
  category?: EventCategory;
  recurrence?: LifeEventRecurrence;
}

const HASH_KEY = "privat:hendelser";

// Eldre hendelser er lagret med et booleansk `yearly`-felt i stedet for
// `recurrence` — selv-helbredende migrering (samme mønster som `order` i
// lib/reminders.ts) ved lesing, ikke en engangs-batch-jobb.
type StoredLifeEvent = LifeEvent & { yearly?: boolean };

export async function getLifeEvents(): Promise<LifeEvent[]> {
  const map = await hgetallJSON<StoredLifeEvent>(HASH_KEY);
  const events = Object.values(map);

  const needsMigration = events.filter((e) => e.recurrence === undefined);
  if (needsMigration.length > 0) {
    await Promise.all(
      needsMigration.map((e) => {
        e.recurrence = e.yearly ? "yearly" : "none";
        delete e.yearly;
        return hsetJSON(HASH_KEY, e.id, e);
      }),
    );
  }

  return events;
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
    recurrence: input.recurrence ?? "none",
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
    recurrence: updates.recurrence !== undefined ? updates.recurrence : current.recurrence,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteLifeEvent(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
