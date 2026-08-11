import { randomUUID } from "crypto";
import { hdel, hgetallJSON, hsetJSON } from "./kv";

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

export async function deletePrivatEvent(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
