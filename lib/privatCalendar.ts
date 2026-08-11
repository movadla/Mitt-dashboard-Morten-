import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

export interface PrivatCalendarEvent {
  id: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  startTime?: string; // "HH:MM"
  endTime?: string;
  note?: string;
}

export interface NewPrivatEventInput {
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  note?: string;
}

export interface PrivatEventUpdateInput {
  title?: string;
  date?: string;
  startTime?: string | null;
  endTime?: string | null;
  note?: string | null;
}

const HASH_KEY = "privat:calendar";

function sortEvents(events: PrivatCalendarEvent[]): PrivatCalendarEvent[] {
  return [...events].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return (a.startTime ?? "").localeCompare(b.startTime ?? "");
  });
}

export async function getPrivatEvents(): Promise<PrivatCalendarEvent[]> {
  const map = await hgetallJSON<PrivatCalendarEvent>(HASH_KEY);
  return sortEvents(Object.values(map));
}

export async function addPrivatEvent(input: NewPrivatEventInput): Promise<PrivatCalendarEvent> {
  if (!input.title?.trim()) throw new Error("Hendelse mangler tittel");
  if (!input.date) throw new Error("Hendelse mangler dato");
  const event: PrivatCalendarEvent = {
    id: randomUUID(),
    title: input.title.trim(),
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    note: input.note,
  };
  await hsetJSON(HASH_KEY, event.id, event);
  return event;
}

export async function updatePrivatEvent(
  id: string,
  updates: PrivatEventUpdateInput,
): Promise<PrivatCalendarEvent | null> {
  const current = await hgetJSON<PrivatCalendarEvent>(HASH_KEY, id);
  if (!current) return null;

  const title = updates.title !== undefined ? updates.title.trim() : current.title;
  if (!title) throw new Error("Hendelse mangler tittel");
  const date = updates.date !== undefined ? updates.date : current.date;
  if (!date) throw new Error("Hendelse mangler dato");

  const next: PrivatCalendarEvent = {
    ...current,
    title,
    date,
    startTime: updates.startTime !== undefined ? (updates.startTime ?? undefined) : current.startTime,
    endTime: updates.endTime !== undefined ? (updates.endTime ?? undefined) : current.endTime,
    note: updates.note !== undefined ? (updates.note ?? undefined) : current.note,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deletePrivatEvent(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
