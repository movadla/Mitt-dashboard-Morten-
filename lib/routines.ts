import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

// En lagret liste over øvelser man kan starte en ny treningsøkt fra, i stedet
// for å søke opp og legge til hver øvelse på nytt hver gang. exerciseName er
// et øyeblikksbilde, samme mønster som WorkoutEntry.
export interface RoutineExercise {
  exerciseId: string;
  exerciseName: string;
}

export interface Routine {
  id: string;
  name: string;
  exercises: RoutineExercise[];
  createdAt: string;
}

export interface NewRoutineInput {
  name: string;
  exercises: RoutineExercise[];
}

export interface RoutineUpdateInput {
  name?: string;
}

const HASH_KEY = "privat:routines";

function sortRoutines(routines: Routine[]): Routine[] {
  return [...routines].sort((a, b) => a.name.localeCompare(b.name, "nb"));
}

export async function getRoutines(): Promise<Routine[]> {
  const map = await hgetallJSON<Routine>(HASH_KEY);
  return sortRoutines(Object.values(map));
}

export async function addRoutine(input: NewRoutineInput): Promise<Routine> {
  if (!input.name?.trim()) throw new Error("Rutine mangler navn");
  if (!input.exercises?.length) throw new Error("Rutine mangler øvelser");

  const routine: Routine = {
    id: randomUUID(),
    name: input.name.trim(),
    exercises: input.exercises,
    createdAt: new Date().toISOString(),
  };
  await hsetJSON(HASH_KEY, routine.id, routine);
  return routine;
}

export async function updateRoutine(id: string, updates: RoutineUpdateInput): Promise<Routine | null> {
  const current = await hgetJSON<Routine>(HASH_KEY, id);
  if (!current) return null;

  const name = updates.name !== undefined ? updates.name.trim() : current.name;
  if (!name) throw new Error("Rutine mangler navn");

  const next: Routine = { ...current, name };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteRoutine(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
