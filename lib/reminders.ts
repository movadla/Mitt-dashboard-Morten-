import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

export type Recurrence = "none" | "daily" | "weekly" | "monthly";

export interface Subtask {
  id: string;
  text: string;
  done: boolean;
}

// Hvilken kommentar-trådtype påminnelsen ble opprettet fra — samme union
// som CommentTargetType i lib/comments.ts, men holdt som en egen (smalere)
// type her for å unngå at reminders.ts må importere hele comments-modulen
// for kun to strengverdier.
export type ReminderLinkTargetType = "calendar-event" | "life-event";

export interface ReminderLink {
  targetType: ReminderLinkTargetType;
  targetId: string;
  // Øyeblikksbilde av hendelsens tittel ved opprettelsestidspunktet — IKKE
  // et live oppslag. Synkroniseres ikke om hendelsen senere omdøpes, men
  // holder RemindersSection fri for å måtte hente kalender-/hendelsesdata
  // den ellers ikke bruker, bare for å vise en lenke-etikett.
  label: string;
}

export interface Reminder {
  id: string;
  text: string;
  dueDate?: string; // "YYYY-MM-DD"
  dueTime?: string; // "HH:MM"
  recurrence: Recurrence;
  done: boolean;
  completedAt?: string; // ISO datetime — satt når done settes til true, brukes for "angre"-vinduet
  order: number; // manuell prioritet i "i dag"-lista, lavest først
  subtasks?: Subtask[];
  linkedTo?: ReminderLink;
}

export interface NewReminderInput {
  text: string;
  dueDate?: string;
  dueTime?: string;
  recurrence?: Recurrence;
  linkedTo?: ReminderLink;
}

export interface ReminderUpdateInput {
  text?: string;
  dueDate?: string | null; // null fjerner fristen, undefined lar den stå urørt
  dueTime?: string | null;
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
  const reminders = sortReminders(Object.values(map));

  // Selv-helbredende migrering: eldre påminnelser mangler `order`. Tildel dem
  // verdier som bevarer dagens (dato-baserte) rekkefølge, uten synlig hopp.
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

export async function addReminder(input: NewReminderInput): Promise<Reminder> {
  if (!input.text?.trim()) throw new Error("Påminnelse mangler tekst");
  // order = laveste eksisterende - 1, ikke Date.now() — en ny påminnelse fikk
  // tidligere alltid et epoke-millisekund-stort tall, som uansett sorterte
  // den bakerst i "i dag"-lista uansett hastegrad, bak alt manuelt omsortert
  // (order 0..N-1 fra reorderReminders). Nye påminnelser dukker nå opp øverst.
  const map = await hgetallJSON<Reminder>(HASH_KEY);
  const existingOrders = Object.values(map).map((r) => r.order ?? 0);
  const order = existingOrders.length > 0 ? Math.min(...existingOrders) - 1 : 0;
  const reminder: Reminder = {
    id: randomUUID(),
    text: input.text.trim(),
    dueDate: input.dueDate,
    dueTime: input.dueTime,
    recurrence: input.recurrence ?? "none",
    done: false,
    order,
    linkedTo: input.linkedTo,
  };
  await hsetJSON(HASH_KEY, reminder.id, reminder);
  return reminder;
}

export async function toggleReminder(id: string): Promise<Reminder | null> {
  const current = await hgetJSON<Reminder>(HASH_KEY, id);
  if (!current) return null;

  let next: Reminder;
  if (current.recurrence !== "none" && !current.done && current.dueDate) {
    // Gjentakende påminnelse som hukes av: rykker fristen frem i stedet for å
    // markere som fullført permanent — ingen completedAt, den er fortsatt aktiv.
    next = { ...current, dueDate: advanceDate(current.dueDate, current.recurrence), done: false };
  } else {
    const willBeDone = !current.done;
    next = { ...current, done: willBeDone, completedAt: willBeDone ? new Date().toISOString() : undefined };
  }

  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function updateReminder(id: string, updates: ReminderUpdateInput): Promise<Reminder | null> {
  const current = await hgetJSON<Reminder>(HASH_KEY, id);
  if (!current) return null;

  const text = updates.text !== undefined ? updates.text.trim() : current.text;
  if (!text) throw new Error("Påminnelse mangler tekst");

  const next: Reminder = {
    ...current,
    text,
    dueDate: updates.dueDate !== undefined ? (updates.dueDate ?? undefined) : current.dueDate,
    dueTime: updates.dueTime !== undefined ? (updates.dueTime ?? undefined) : current.dueTime,
    recurrence: updates.recurrence !== undefined ? updates.recurrence : current.recurrence,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteReminder(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}

export async function addSubtask(reminderId: string, text: string): Promise<Reminder | null> {
  if (!text.trim()) throw new Error("Underpunkt mangler tekst");
  const current = await hgetJSON<Reminder>(HASH_KEY, reminderId);
  if (!current) return null;
  const subtask: Subtask = { id: randomUUID(), text: text.trim(), done: false };
  const next: Reminder = { ...current, subtasks: [...(current.subtasks ?? []), subtask] };
  await hsetJSON(HASH_KEY, reminderId, next);
  return next;
}

export async function toggleSubtask(reminderId: string, subtaskId: string): Promise<Reminder | null> {
  const current = await hgetJSON<Reminder>(HASH_KEY, reminderId);
  if (!current) return null;
  const next: Reminder = {
    ...current,
    subtasks: (current.subtasks ?? []).map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s)),
  };
  await hsetJSON(HASH_KEY, reminderId, next);
  return next;
}

export async function deleteSubtask(reminderId: string, subtaskId: string): Promise<Reminder | null> {
  const current = await hgetJSON<Reminder>(HASH_KEY, reminderId);
  if (!current) return null;
  const next: Reminder = { ...current, subtasks: (current.subtasks ?? []).filter((s) => s.id !== subtaskId) };
  await hsetJSON(HASH_KEY, reminderId, next);
  return next;
}

// Setter order = posisjon i den oppgitte lista. Brukes for å persistere manuell
// dra-og-slipp-rekkefølge for et delsett (typisk "i dag"-lista), ikke hele settet.
export async function reorderReminders(ids: string[]): Promise<Reminder[]> {
  await Promise.all(
    ids.map(async (id, index) => {
      const current = await hgetJSON<Reminder>(HASH_KEY, id);
      if (!current) return;
      await hsetJSON(HASH_KEY, id, { ...current, order: index });
    }),
  );
  return getReminders();
}
