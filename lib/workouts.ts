import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";
import { getExercises, type ExerciseCategory } from "./exercises";

export type SetIntensity = "lav" | "middels" | "hoy";

// Ett enkelt sett innenfor en øvelse. Styrke bruker kg/reps (vekt logges her,
// ikke aggregert per øvelse, siden vekt ofte varierer mellom sett — oppvarming,
// pyramide). Cardio bruker minutes/kmt/intensity i stedet — samme "+ nytt
// sett"-liste dekker begge, siden man kan trenge flere cardio-drag også
// (intervaller), ikke bare én sammenhengende økt.
export interface SetLog {
  id: string;
  reps?: number;
  kg?: number;
  minutes?: number;
  kmt?: number;
  distanceKm?: number;
  intensity?: SetIntensity;
  done?: boolean;
}

// Én øvelse logget innenfor en treningsøkt. exerciseName og category er
// øyeblikksbilde-kopier fra katalogen (lib/exercises.ts) på loggetidspunktet —
// overlever selv om øvelsen senere omdøpes, kategoriseres om eller slettes.
export interface WorkoutEntry {
  id: string;
  exerciseId: string;
  exerciseName: string;
  category: ExerciseCategory;
  sets: SetLog[];
  minutes?: number; // fritt cardio-notat på selve øvelsen (i tillegg til sett)
  notes?: string;
  done?: boolean; // hele øvelsen markert fullført
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
  done?: boolean;
}

export interface NewSetInput {
  reps?: number;
  kg?: number;
  minutes?: number;
  kmt?: number;
  distanceKm?: number;
  intensity?: SetIntensity;
}

export interface SetUpdateInput {
  reps?: number | null;
  kg?: number | null;
  minutes?: number | null;
  kmt?: number | null;
  distanceKm?: number | null;
  intensity?: SetIntensity | null;
  done?: boolean;
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

  // category slås opp server-side (ikke sendt fra klienten) slik at rutiner
  // og andre kall som kun har exerciseId/exerciseName også får riktig snapshot.
  const exercises = await getExercises();
  const category = exercises.find((e) => e.id === input.exerciseId)?.category ?? "styrke";

  const entry: WorkoutEntry = {
    id: randomUUID(),
    exerciseId: input.exerciseId,
    exerciseName: input.exerciseName.trim(),
    category,
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
      done: updates.done !== undefined ? updates.done : e.done,
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

  const set: SetLog = {
    id: randomUUID(),
    reps: input.reps,
    kg: input.kg,
    minutes: input.minutes,
    kmt: input.kmt,
    distanceKm: input.distanceKm,
    intensity: input.intensity,
  };
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
        minutes: updates.minutes !== undefined ? (updates.minutes ?? undefined) : s.minutes,
        kmt: updates.kmt !== undefined ? (updates.kmt ?? undefined) : s.kmt,
        distanceKm: updates.distanceKm !== undefined ? (updates.distanceKm ?? undefined) : s.distanceKm,
        intensity: updates.intensity !== undefined ? (updates.intensity ?? undefined) : s.intensity,
        done: updates.done !== undefined ? updates.done : s.done,
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

// entries er allerede et ordnet array i én JSON-blob (i motsetning til
// reorderReminders i lib/reminders.ts, som må bruke et eget order-felt siden
// påminnelser er individuelt nøkkel-lagret) — reordering er derfor bare å
// bygge om selve arrayet i den rekkefølgen klienten sender inn.
export async function reorderEntries(sessionId: string, orderedEntryIds: string[]): Promise<WorkoutSession | null> {
  const current = await hgetJSON<WorkoutSession>(HASH_KEY, sessionId);
  if (!current) return null;

  const byId = new Map(current.entries.map((e) => [e.id, e]));
  const reordered = orderedEntryIds.map((id) => byId.get(id)).filter((e): e is WorkoutEntry => !!e);
  const missing = current.entries.filter((e) => !orderedEntryIds.includes(e.id));
  const next: WorkoutSession = { ...current, entries: [...reordered, ...missing] };
  await hsetJSON(HASH_KEY, sessionId, next);
  return next;
}
