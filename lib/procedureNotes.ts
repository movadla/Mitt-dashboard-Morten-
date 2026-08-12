import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

export interface ProcedureNote {
  id: string;
  title: string;
  text: string;
  createdAt: string; // ISO datetime
}

export interface NewProcedureNoteInput {
  title: string;
  text: string;
}

export interface ProcedureNoteUpdateInput {
  title?: string;
  text?: string;
}

const HASH_KEY = "jobb:prosedyrenotater";

function sortNotes(notes: ProcedureNote[]): ProcedureNote[] {
  return [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getProcedureNotes(): Promise<ProcedureNote[]> {
  const map = await hgetallJSON<ProcedureNote>(HASH_KEY);
  return sortNotes(Object.values(map));
}

export async function addProcedureNote(input: NewProcedureNoteInput): Promise<ProcedureNote> {
  if (!input.title?.trim()) throw new Error("Notat mangler tittel");
  if (!input.text?.trim()) throw new Error("Notat mangler tekst");
  const note: ProcedureNote = {
    id: randomUUID(),
    title: input.title.trim(),
    text: input.text.trim(),
    createdAt: new Date().toISOString(),
  };
  await hsetJSON(HASH_KEY, note.id, note);
  return note;
}

export async function updateProcedureNote(id: string, updates: ProcedureNoteUpdateInput): Promise<ProcedureNote | null> {
  const current = await hgetJSON<ProcedureNote>(HASH_KEY, id);
  if (!current) return null;

  const title = updates.title !== undefined ? updates.title.trim() : current.title;
  if (!title) throw new Error("Notat mangler tittel");
  const text = updates.text !== undefined ? updates.text.trim() : current.text;
  if (!text) throw new Error("Notat mangler tekst");

  const next: ProcedureNote = { ...current, title, text };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteProcedureNote(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
