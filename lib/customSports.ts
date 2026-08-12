import { randomUUID } from "crypto";
import { hdel, hgetallJSON, hsetJSON } from "./kv";
import { invalidateSportsCache } from "./sportsCache";

// Kamper brukeren selv vil følge (f.eks. en spesifikk kamp som ikke dekkes av
// de faste kildene i lib/sports.ts) — slås sammen med de eksterne kildene i
// getSportEvents() og dukker opp i Sport-boksen som en vanlig rad.
export interface CustomSportEvent {
  id: string;
  name: string;
  date: string; // "YYYY-MM-DD"
  time?: string; // "HH:MM"
  competition?: string;
  venue?: string;
}

export interface NewCustomSportEventInput {
  name: string;
  date: string;
  time?: string;
  competition?: string;
  venue?: string;
}

const HASH_KEY = "privat:custom-sports";

export async function getCustomSportEvents(): Promise<CustomSportEvent[]> {
  const map = await hgetallJSON<CustomSportEvent>(HASH_KEY);
  return Object.values(map);
}

export async function addCustomSportEvent(input: NewCustomSportEventInput): Promise<CustomSportEvent> {
  if (!input.name?.trim()) throw new Error("Kamp mangler navn");
  if (!input.date) throw new Error("Kamp mangler dato");
  const event: CustomSportEvent = {
    id: randomUUID(),
    name: input.name.trim(),
    date: input.date,
    time: input.time || undefined,
    competition: input.competition?.trim() || undefined,
    venue: input.venue?.trim() || undefined,
  };
  await hsetJSON(HASH_KEY, event.id, event);
  await invalidateSportsCache();
  return event;
}

export async function deleteCustomSportEvent(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
  await invalidateSportsCache();
}
