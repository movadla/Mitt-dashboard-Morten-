import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

// Ett enkelt sett innenfor en øvelse — vekt logges her (ikke aggregert per
// øvelse) siden vekt ofte varierer mellom sett (oppvarming, pyramide).
export interface SetLog {
  id: string;
  reps?: number;
  kg?: number;
}

// Én øvelse logget innenfor en treningsøkt. exerciseName er en øyeblikksbilde-
// kopi av navnet på loggetidspunktet — overlever selv om øvelsen i katalogen
// (lib/exercises.ts) senere omdøpes eller slettes.
export interface WorkoutEntry {
  id: string;
  exerciseId: string;
  exerciseName: string;
  sets: SetLog[];
  minutes?: number; // dekker cardio-aktig logging uten "sett" (f.eks. løping)
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
}

export interface WorkoutEntryUpdateInput {
  minutes?: number | null;
  notes?: string | null;
}

export interface NewSetInput {
  reps?: number;
  kg?: number;
}

export interface SetUpdateInput {
  reps?: number | null;
  kg?: number | null;
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
    sets: [],
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

export async function addSetToEntry(sessionId: string, entryId: string, input: NewSetInput): Promise<WorkoutSession | null> {
  const current = await hgetJSON<WorkoutSession>(HASH_KEY, sessionId);
  if (!current) return null;

  const set: SetLog = { id: randomUUID(), reps: input.reps, kg: input.kg };
  const entries = current.entries.map((e) => (e.id === entryId ? { ...e, sets: [...e.sets, set] } : e));
  const next: WorkoutSession = { ...current, entries };
  await hsetJSON(HASH_KEY, sessionId, next);
  return next;
}

export async function updateSet(
  sessionId: string,
  entryId: string,
  setId: string,
  updates: SetUpdateInput,
): Promise<WorkoutSession | null> {
  const current = await hgetJSON<WorkoutSession>(HASH_KEY, sessionId);
  if (!current) return null;

  const entries = current.entries.map((e) => {
    if (e.id !== entryId) return e;
    const sets = e.sets.map((s) => {
      if (s.id !== setId) return s;
      return {
        ...s,
        reps: updates.reps !== undefined ? (updates.reps ?? undefined) : s.reps,
        kg: updates.kg !== undefined ? (updates.kg ?? undefined) : s.kg,
      };
    });
    return { ...e, sets };
  });
  const next: WorkoutSession = { ...current, entries };
  await hsetJSON(HASH_KEY, sessionId, next);
  return next;
}

export async function deleteSet(sessionId: string, entryId: string, setId: string): Promise<WorkoutSession | null> {
  const current = await hgetJSON<WorkoutSession>(HASH_KEY, sessionId);
  if (!current) return null;
  const entries = current.entries.map((e) => (e.id === entryId ? { ...e, sets: e.sets.filter((s) => s.id !== setId) } : e));
  const next: WorkoutSession = { ...current, entries };
  await hsetJSON(HASH_KEY, sessionId, next);
  return next;
}
