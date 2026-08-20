import { randomUUID } from "crypto";
import { hdel, hgetallJSON, hsetJSON } from "./kv";

// Forslag Claude legger inn når research-runder (Mustad-nyheter, e-post/
// Teams-gjennomgang) avdekker noe som bør bli en påminnelse, hendelse eller
// et notat på et kalendermøte — men som Morten selv skal godkjenne eller
// avslå, ikke noe som opprettes automatisk. Se app/api/jobb-suggestions/
// route.ts for hvordan disse skrives inn (samme dual-auth-mønster som
// lib/companyNews.ts).
//
// "calendar-note" er ment for et notat på et EKSISTERENDE møte i
// CALENDAR_EVENTS (meetingId påkrevd) — kalenderen selv er en read-only
// Outlook-speiling, så et "nytt møte" hører hjemme som "event"-forslag i
// stedet (Hendelser er den frie, Redis-lagrede jobb-hendelses-listen).
//
// "employee" er for nye/endrede ansatte funnet i Salesforce User-listen
// (SELECT Name, Title, Department FROM User WHERE IsActive = true) — `title`
// er personens navn, `note` er "jobbtittel · avdeling" (fritekst). Godtas inn
// i lib/employees.ts (Redis, redigerbar i Oppslag), ikke i den statiske
// lib/companyInfo.ts.
export type SuggestionTarget = "reminder" | "event" | "calendar-note" | "employee";

export interface Suggestion {
  id: string;
  target: SuggestionTarget;
  title: string; // påminnelsestekst / hendelsestittel / notat-tekst / ansattnavn
  date?: string; // foreslått forfallsdato/hendelsesdato, YYYY-MM-DD
  note?: string; // ekstra kontekst ("event": fritekst, "employee": "tittel · avdeling")
  meetingId?: string; // påkrevd for "calendar-note" — hvilket CALENDAR_EVENTS.id
  sourceRef: string; // hvor Claude fant dette, f.eks. "Teams: Mustad Felles, 20.08.2026"
  createdAt: string;
}

export interface NewSuggestionInput {
  target: SuggestionTarget;
  title: string;
  date?: string;
  note?: string;
  meetingId?: string;
  sourceRef: string;
}

const HASH_KEY = "jobb:forslag";

export async function getSuggestions(): Promise<Suggestion[]> {
  const map = await hgetallJSON<Suggestion>(HASH_KEY);
  return Object.values(map).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addSuggestions(inputs: NewSuggestionInput[]): Promise<Suggestion[]> {
  const createdAt = new Date().toISOString();
  const created: Suggestion[] = [];
  for (const input of inputs) {
    if (!input.title?.trim()) continue;
    if (input.target === "calendar-note" && !input.meetingId) continue;
    const suggestion: Suggestion = { id: randomUUID(), createdAt, ...input };
    await hsetJSON(HASH_KEY, suggestion.id, suggestion);
    created.push(suggestion);
  }
  return created;
}

export async function deleteSuggestion(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
