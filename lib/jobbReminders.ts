import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

export type Recurrence = "none" | "daily" | "weekly" | "monthly";

export interface JobbReminder {
  id: string;
  text: string;
  dueDate?: string; // "YYYY-MM-DD"
  recurrence: Recurrence;
  done: boolean;
  order: number; // manuell prioritet i "i dag"-lista, lavest først
}

export interface NewJobbReminderInput {
  text: string;
  dueDate?: string;
  recurrence?: Recurrence;
}

export interface JobbReminderUpdateInput {
  text?: string;
  dueDate?: string | null; // null fjerner fristen, undefined lar den stå urørt
  recurrence?: Recurrence;
}

const HASH_KEY = "jobb:reminders";

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

function sortReminders(reminders: JobbReminder[]): JobbReminder[] {
  return [...reminders].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });
}

export async function getJobbReminders(): Promise<JobbReminder[]> {
  const map = await hgetallJSON<JobbReminder>(HASH_KEY);
  const reminders = sortReminders(Object.values(map));

  const missingOrder = reminders.filter((r) => r.order === undefined);
  if (missingOrder.length > 0) {
    await Promise.all(
      reminders.map((r, i) => {
        if (r.order !== undefined) return Promise.resolve();
        r.order = i;
        return hsetJSON(HASH_KEY, r.id, r);
      }),
    );
  }

  return reminders;
}

export async function addJobbReminder(input: NewJobbReminderInput): Promise<JobbReminder> {
  if (!input.text?.trim()) throw new Error("Påminnelse mangler tekst");
  const reminder: JobbReminder = {
    id: randomUUID(),
    text: input.text.trim(),
    dueDate: input.dueDate,
    recurrence: input.recurrence ?? "none",
    done: false,
    order: Date.now(),
  };
  await hsetJSON(HASH_KEY, reminder.id, reminder);
  return reminder;
}

export async function toggleJobbReminder(id: string): Promise<JobbReminder | null> {
  const current = await hgetJSON<JobbReminder>(HASH_KEY, id);
  if (!current) return null;

  const next: JobbReminder =
    current.recurrence !== "none" && !current.done && current.dueDate
      ? { ...current, dueDate: advanceDate(current.dueDate, current.recurrence), done: false }
      : { ...current, done: !current.done };

  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function updateJobbReminder(id: string, updates: JobbReminderUpdateInput): Promise<JobbReminder | null> {
  const current = await hgetJSON<JobbReminder>(HASH_KEY, id);
  if (!current) return null;

  const text = updates.text !== undefined ? updates.text.trim() : current.text;
  if (!text) throw new Error("Påminnelse mangler tekst");

  const next: JobbReminder = {
    ...current,
    text,
    dueDate: updates.dueDate !== undefined ? (updates.dueDate ?? undefined) : current.dueDate,
    recurrence: updates.recurrence !== undefined ? updates.recurrence : current.recurrence,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteJobbReminder(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}

// Setter order = posisjon i den oppgitte lista. Brukes for å persistere manuell
// dra-og-slipp-rekkefølge for et delsett (typisk "i dag"-lista), ikke hele settet.
export async function reorderJobbReminders(ids: string[]): Promise<JobbReminder[]> {
  await Promise.all(
    ids.map(async (id, index) => {
      const current = await hgetJSON<JobbReminder>(HASH_KEY, id);
      if (!current) return;
      await hsetJSON(HASH_KEY, id, { ...current, order: index });
    }),
  );
  return getJobbReminders();
}
