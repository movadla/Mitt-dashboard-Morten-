import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

export interface Note {
  id: string;
  text: string;
  createdAt: string; // ISO datetime
}

export interface NewNoteInput {
  text: string;
}

export interface NoteUpdateInput {
  text?: string;
}

const HASH_KEY = "privat:notes";

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getNotes(): Promise<Note[]> {
  const map = await hgetallJSON<Note>(HASH_KEY);
  return sortNotes(Object.values(map));
}

export async function addNote(input: NewNoteInput): Promise<Note> {
  if (!input.text?.trim()) throw new Error("Notat mangler tekst");
  const note: Note = {
    id: randomUUID(),
    text: input.text.trim(),
    createdAt: new Date().toISOString(),
  };
  await hsetJSON(HASH_KEY, note.id, note);
  return note;
}

export async function updateNote(id: string, updates: NoteUpdateInput): Promise<Note | null> {
  const current = await hgetJSON<Note>(HASH_KEY, id);
  if (!current) return null;

  const text = updates.text !== undefined ? updates.text.trim() : current.text;
  if (!text) throw new Error("Notat mangler tekst");

  const next: Note = { ...current, text };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteNote(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
