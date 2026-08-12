import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

// Én øvelse logget innenfor en treningsøkt. exerciseName er en øyeblikksbilde-
// kopi av navnet på loggetidspunktet — overlever selv om øvelsen i katalogen
// (lib/exercises.ts) senere omdøpes eller slettes.
export interface WorkoutEntry {
  id: string;
  exerciseId: string;
  exerciseName: string;
  sets?: number;
  reps?: number;
  minutes?: number;
  notes?: string;
}

export interface WorkoutSession {
  id: string;
  startedAt: string; // ISO
  endedAt?: string; // ISO — udefinert = økten pågår fortsatt
  notes?: string;
  entries: WorkoutEntry[];
}

export interface NewWorkoutEntryInput {
  exerciseId: string;
  exerciseName: string;
  sets?: number;
  reps?: number;
  minutes?: number;
  notes?: string;
}

export interface WorkoutEntryUpdateInput {
  sets?: number | null;
  reps?: number | null;
  minutes?: number | null;
  notes?: string | null;
}

const HASH_KEY = "privat:workouts";

function sortSessions(sessions: WorkoutSession[]): WorkoutSession[] {
  return [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function getWorkoutSessions(): Promise<WorkoutSession[]> {
  const map = await hgetallJSON<WorkoutSession>(HASH_KEY);
  return sortSessions(Object.values(map));
}

export async function getActiveWorkoutSession(): Promise<WorkoutSession | null> {
  const sessions = await getWorkoutSessions();
  return sessions.find((s) => !s.endedAt) ?? null;
}

// Kun én pågående økt om gangen — hvis en allerede er i gang, returneres den
// i stedet for å opprette en duplikat.
export async function startWorkoutSession(): Promise<WorkoutSession> {
  const active = await getActiveWorkoutSession();
  if (active) return active;

  const session: WorkoutSession = {
    id: randomUUID(),
    startedAt: new Date().toISOString(),
    entries: [],
  };
  await hsetJSON(HASH_KEY, session.id, session);
  return session;
}

export async function endWorkoutSession(id: string, notes?: string): Promise<WorkoutSession | null> {
  const current = await hgetJSON<WorkoutSession>(HASH_KEY, id);
  if (!current) return null;
  const next: WorkoutSession = {
    ...current,
    endedAt: new Date().toISOString(),
    notes: notes !== undefined ? notes.trim() || undefined : current.notes,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteWorkoutSession(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}

export async function addWorkoutEntry(sessionId: string, input: NewWorkoutEntryInput): Promise<WorkoutSession | null> {
  const current = await hgetJSON<WorkoutSession>(HASH_KEY, sessionId);
  if (!current) return null;
  if (!input.exerciseId || !input.exerciseName?.trim()) throw new Error("Mangler øvelse");

  const entry: WorkoutEntry = {
    id: randomUUID(),
    exerciseId: input.exerciseId,
    exerciseName: input.exerciseName.trim(),
    sets: input.sets,
    reps: input.reps,
    minutes: input.minutes,
    notes: input.notes?.trim() || undefined,
  };
  const next: WorkoutSession = { ...current, entries: [...current.entries, entry] };
  await hsetJSON(HASH_KEY, sessionId, next);
  return next;
}

export async function updateWorkoutEntry(
  sessionId: string,
  entryId: string,
  updates: WorkoutEntryUpdateInput,
): Promise<WorkoutSession | null> {
  const current = await hgetJSON<WorkoutSession>(HASH_KEY, sessionId);
  if (!current) return null;

  const entries = current.entries.map((e) => {
    if (e.id !== entryId) return e;
    return {
      ...e,
      sets: updates.sets !== undefined ? (updates.sets ?? undefined) : e.sets,
      reps: updates.reps !== undefined ? (updates.reps ?? undefined) : e.reps,
      minutes: updates.minutes !== undefined ? (updates.minutes ?? undefined) : e.minutes,
      notes: updates.notes !== undefined ? (updates.notes?.trim() || undefined) : e.notes,
    };
  });
  const next: WorkoutSession = { ...current, entries };
  await hsetJSON(HASH_KEY, sessionId, next);
  return next;
}

export async function deleteWorkoutEntry(sessionId: string, entryId: string): Promise<WorkoutSession | null> {
  const current = await hgetJSON<WorkoutSession>(HASH_KEY, sessionId);
  if (!current) return null;
  const next: WorkoutSession = { ...current, entries: current.entries.filter((e) => e.id !== entryId) };
  await hsetJSON(HASH_KEY, sessionId, next);
  return next;
}
