import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

export type ExerciseCategory = "styrke" | "cardio";

// Gjenbrukbar katalog over øvelser — fylles opp av brukeren selv (navn +
// valgfri beskrivelse), plukkes fra denne når man logger en treningsøkt
// (lib/workouts.ts), i stedet for å skrive inn samme øvelse på nytt hver gang.
// category styrer hvilke felt SetRow viser når man logger sett for øvelsen
// (styrke: kg/reps, cardio: minutter/km-t/intensitet).
export interface Exercise {
  id: string;
  name: string;
  description?: string;
  category: ExerciseCategory;
  createdAt: string;
}

export interface NewExerciseInput {
  name: string;
  description?: string;
  category?: ExerciseCategory;
}

export interface ExerciseUpdateInput {
  name?: string;
  description?: string | null;
  category?: ExerciseCategory;
}

const HASH_KEY = "privat:exercises";

function sortExercises(exercises: Exercise[]): Exercise[] {
  return [...exercises].sort((a, b) => a.name.localeCompare(b.name, "nb"));
}

// Eldre øvelser mangler `category` — selv-helbredende migrering ved lesing
// (samme mønster som recurrence i lib/events.ts), default til "styrke" siden
// det var den eneste typen øvelser som fantes før dette feltet ble innført.
export async function getExercises(): Promise<Exercise[]> {
  const map = await hgetallJSON<Exercise>(HASH_KEY);
  const exercises = Object.values(map);

  const needsMigration = exercises.filter((e) => e.category === undefined);
  if (needsMigration.length > 0) {
    await Promise.all(
      needsMigration.map((e) => {
        e.category = "styrke";
        return hsetJSON(HASH_KEY, e.id, e);
      }),
    );
  }

  return sortExercises(exercises);
}

export async function addExercise(input: NewExerciseInput): Promise<Exercise> {
  if (!input.name?.trim()) throw new Error("Øvelse mangler navn");
  const exercise: Exercise = {
    id: randomUUID(),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    category: input.category ?? "styrke",
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
    category: updates.category !== undefined ? updates.category : current.category,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteExercise(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
