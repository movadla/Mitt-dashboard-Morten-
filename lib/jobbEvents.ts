import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

// Forenklet versjon av lib/events.ts (Privat-fanens "Hendelser") — ingen
// kategori og ingen årlig gjentakelse, siden jobb-hendelser (f.eks.
// butikkåpning) stort sett er engangstilfeller, ikke tilbakevendende.
export interface JobbEvent {
  id: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  note?: string;
}

export interface NewJobbEventInput {
  title: string;
  date: string;
  note?: string;
}

export interface JobbEventUpdateInput {
  title?: string;
  date?: string;
  note?: string | null;
}

const HASH_KEY = "jobb:hendelser";

export async function getJobbEvents(): Promise<JobbEvent[]> {
  const map = await hgetallJSON<JobbEvent>(HASH_KEY);
  return Object.values(map);
}

export async function addJobbEvent(input: NewJobbEventInput): Promise<JobbEvent> {
  if (!input.title?.trim()) throw new Error("Hendelse mangler tittel");
  if (!input.date) throw new Error("Hendelse mangler dato");
  const event: JobbEvent = {
    id: randomUUID(),
    title: input.title.trim(),
    date: input.date,
    note: input.note?.trim() || undefined,
  };
  await hsetJSON(HASH_KEY, event.id, event);
  return event;
}

export async function updateJobbEvent(id: string, updates: JobbEventUpdateInput): Promise<JobbEvent | null> {
  const current = await hgetJSON<JobbEvent>(HASH_KEY, id);
  if (!current) return null;

  const title = updates.title !== undefined ? updates.title.trim() : current.title;
  if (!title) throw new Error("Hendelse mangler tittel");
  const date = updates.date !== undefined ? updates.date : current.date;
  if (!date) throw new Error("Hendelse mangler dato");

  const next: JobbEvent = {
    ...current,
    title,
    date,
    note: updates.note !== undefined ? (updates.note ?? undefined) : current.note,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteJobbEvent(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
