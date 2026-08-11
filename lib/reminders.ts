import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

export type Recurrence = "none" | "daily" | "weekly" | "monthly";

export interface Reminder {
  id: string;
  text: string;
  dueDate?: string; // "YYYY-MM-DD"
  recurrence: Recurrence;
  done: boolean;
}

export interface NewReminderInput {
  text: string;
  dueDate?: string;
  recurrence?: Recurrence;
}

const HASH_KEY = "privat:reminders";

function addDays(iso: string, n: number): string {
  const dt = new Date(iso + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// Klemmer dagen til siste dag i målmåneden i stedet for å rulle over
// (31. jan + 1 måned -> 28./29. feb, ikke 3. mars).
export function advanceDate(iso: string, unit: Recurrence): string {
  if (unit === "daily") return addDays(iso, 1);
  if (unit === "weekly") return addDays(iso, 7);
  if (unit === "none") return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const targetMonthIdx0 = m % 12;
  const targetYear = m === 12 ? y + 1 : y;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIdx0 + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${targetYear}-${String(targetMonthIdx0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function sortReminders(reminders: Reminder[]): Reminder[] {
  return [...reminders].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });
}

export async function getReminders(): Promise<Reminder[]> {
  const map = await hgetallJSON<Reminder>(HASH_KEY);
  return sortReminders(Object.values(map));
}

export async function addReminder(input: NewReminderInput): Promise<Reminder> {
  if (!input.text?.trim()) throw new Error("Påminnelse mangler tekst");
  const reminder: Reminder = {
    id: randomUUID(),
    text: input.text.trim(),
    dueDate: input.dueDate,
    recurrence: input.recurrence ?? "none",
    done: false,
  };
  await hsetJSON(HASH_KEY, reminder.id, reminder);
  return reminder;
}

export async function toggleReminder(id: string): Promise<Reminder | null> {
  const current = await hgetJSON<Reminder>(HASH_KEY, id);
  if (!current) return null;

  const next: Reminder =
    current.recurrence !== "none" && !current.done && current.dueDate
      ? { ...current, dueDate: advanceDate(current.dueDate, current.recurrence), done: false }
      : { ...current, done: !current.done };

  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteReminder(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
