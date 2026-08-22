import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

// Fritekstnotater for Boko Haramsdale-laget — ting som dukker opp i løpet av
// sesongen og som skal diskuteres på årsmøtet. Samme mønster som
// AlfredFreeNote i lib/alfred.ts (dato/tid-stemplet, rediger/slett).
export interface FplNote {
  id: string;
  text: string;
  createdAt: string; // ISO datetime
  updatedAt?: string; // ISO datetime — satt kun ved redigering
}

const FPL_NOTE_KEY = "privat:fpl:boko-notes";

function sortNotes(notes: FplNote[]): FplNote[] {
  return [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getFplNotes(): Promise<FplNote[]> {
  const map = await hgetallJSON<FplNote>(FPL_NOTE_KEY);
  return sortNotes(Object.values(map));
}

export async function addFplNote(text: string): Promise<FplNote> {
  if (!text.trim()) throw new Error("Notat mangler tekst");
  const note: FplNote = { id: randomUUID(), text: text.trim(), createdAt: new Date().toISOString() };
  await hsetJSON(FPL_NOTE_KEY, note.id, note);
  return note;
}

export async function editFplNote(id: string, text: string): Promise<FplNote | null> {
  if (!text.trim()) throw new Error("Notat mangler tekst");
  const current = await hgetJSON<FplNote>(FPL_NOTE_KEY, id);
  if (!current) return null;
  const next: FplNote = { ...current, text: text.trim(), updatedAt: new Date().toISOString() };
  await hsetJSON(FPL_NOTE_KEY, id, next);
  return next;
}

export async function deleteFplNote(id: string): Promise<void> {
  await hdel(FPL_NOTE_KEY, id);
}
