import { randomUUID } from "crypto";
import { hdel, hgetallJSON, hsetJSON } from "./kv";
import { invalidateSportsCache } from "./sportsCache";

// Kamper brukeren selv vil følge (f.eks. en spesifikk kamp som ikke dekkes av
// de faste kildene i lib/sports.ts) — slås sammen med de eksterne kildene i
// getSportEvents() og dukker opp i Sport-boksen som en vanlig rad.
//
// `highlight` styrer om hendelsen skal dukke opp i "I dag" (TodaySummary) —
// uten dette ville et fullt program limt inn (f.eks. et helt OL-oppsett)
// oversvømme "I dag" med alt som skjer den dagen. Den fulle listen vises
// uansett i selve Sport-boksen; highlight avgjør bare hva som løftes opp.
export interface CustomSportEvent {
  id: string;
  name: string;
  date: string; // "YYYY-MM-DD"
  time?: string; // "HH:MM"
  competition?: string;
  venue?: string;
  highlight: boolean;
}

export interface NewCustomSportEventInput {
  name: string;
  date: string;
  time?: string;
  competition?: string;
  venue?: string;
  highlight?: boolean;
}

const HASH_KEY = "privat:custom-sports";

function buildEvent(input: NewCustomSportEventInput): CustomSportEvent {
  if (!input.name?.trim()) throw new Error("Kamp mangler navn");
  if (!input.date) throw new Error("Kamp mangler dato");
  return {
    id: randomUUID(),
    name: input.name.trim(),
    date: input.date,
    time: input.time || undefined,
    competition: input.competition?.trim() || undefined,
    venue: input.venue?.trim() || undefined,
    highlight: input.highlight ?? false,
  };
}

export async function getCustomSportEvents(): Promise<CustomSportEvent[]> {
  const map = await hgetallJSON<CustomSportEvent>(HASH_KEY);
  return Object.values(map);
}

export async function addCustomSportEvent(input: NewCustomSportEventInput): Promise<CustomSportEvent> {
  const event = buildEvent(input);
  await hsetJSON(HASH_KEY, event.id, event);
  await invalidateSportsCache();
  return event;
}

// Legger til mange hendelser i ett byks — brukes for bulk-import (f.eks. et helt
// turneringsprogram limt inn i chatboten) slik at Redis-cachen for sport kun
// ugyldiggjøres én gang i stedet for én gang per hendelse.
export async function addCustomSportEventsBulk(inputs: NewCustomSportEventInput[]): Promise<CustomSportEvent[]> {
  const events = inputs.map(buildEvent);
  await Promise.all(events.map((e) => hsetJSON(HASH_KEY, e.id, e)));
  await invalidateSportsCache();
  return events;
}

export async function deleteCustomSportEvent(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
  await invalidateSportsCache();
}
