import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

// Gjenbrukbar katalog over øvelser — fylles opp av brukeren selv (navn +
// valgfri beskrivelse), plukkes fra denne når man logger en treningsøkt
// (lib/workouts.ts), i stedet for å skrive inn samme øvelse på nytt hver gang.
export interface Exercise {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface NewExerciseInput {
  name: string;
  description?: string;
}

export interface ExerciseUpdateInput {
  name?: string;
  description?: string | null;
}

const HASH_KEY = "privat:exercises";

function sortExercises(exercises: Exercise[]): Exercise[] {
  return [...exercises].sort((a, b) => a.name.localeCompare(b.name, "nb"));
}

export async function getExercises(): Promise<Exercise[]> {
  const map = await hgetallJSON<Exercise>(HASH_KEY);
  return sortExercises(Object.values(map));
}

export async function addExercise(input: NewExerciseInput): Promise<Exercise> {
  if (!input.name?.trim()) throw new Error("Øvelse mangler navn");
  const exercise: Exercise = {
    id: randomUUID(),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  await hsetJSON(HASH_KEY, exercise.id, exercise);
  return exercise;
}

export async function updateExercise(id: string, updates: ExerciseUpdateInput): Promise<Exercise | null> {
  const current = await hgetJSON<Exercise>(HASH_KEY, id);
  if (!current) return null;

  const name = updates.name !== undefined ? updates.name.trim() : current.name;
  if (!name) throw new Error("Øvelse mangler navn");

  const next: Exercise = {
    ...current,
    name,
    description: updates.description !== undefined ? (updates.description?.trim() || undefined) : current.description,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteExercise(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
