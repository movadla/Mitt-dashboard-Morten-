import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";
import { recordDiaryPresetUsage, type DiaryPresetCategory } from "./diaryPresets";

// Redis-hashen beholdes UENDRET som "privat:evening-log" (kun internt navn —
// ingen brukersynlig konsekvens) for å unngå enhver risiko for datatap ved en
// rename. Kun FORMEN på verdien endres, fra den gamle flate
// Kveldslogg-formen til den nye 3-delte Dagbok-formen.
const HASH_KEY = "privat:evening-log";

export interface DiaryEntry {
  date: string; // "YYYY-MM-DD"
  morning: string[];
  afternoon: string[];
  evening: string[];
  people: string[];
  places: string[];
  notes?: string;
  updatedAt: string;
}

export interface DiaryEntryInput {
  morning: string[];
  afternoon: string[];
  evening: string[];
  people: string[];
  places: string[];
  notes?: string;
}

// Gammel Kveldslogg-form — kategori-NØKLER (ikke fritekst-labels) mot en
// hardkodet liste som tidligere lå i app/privat/EveningCheckIn.tsx.
interface LegacyEveningLogEntry {
  date: string;
  categories: string[];
  notes: string;
  updatedAt: string;
}

const LEGACY_CATEGORY_LABELS: Record<string, string> = {
  alfred: "Permisjon med Alfred",
  dart: "Dart på Ly",
  familie: "Rolig kveld med familien",
  jobb: "Jobb",
  sosialt: "Sosialt/venner",
  trening: "Trening",
  reise: "Reise/bortreist",
};

// Selv-helbredende lese-tids-migrering (samme mønster som reminders.ts sin
// "mangler order"-migrering) — IKKE destruktiv, skriver ikke tilbake til
// Redis. Gamle rader mangler `morning`, og legges (som labels, ikke nøkler)
// i `evening`, siden kveldsloggen alltid ble fylt ut om kvelden uansett når
// på dagen hendelsen fant sted.
function normalize(raw: DiaryEntry | LegacyEveningLogEntry): DiaryEntry {
  if (Array.isArray((raw as DiaryEntry).morning)) return raw as DiaryEntry;
  const legacy = raw as LegacyEveningLogEntry;
  return {
    date: legacy.date,
    morning: [],
    afternoon: [],
    evening: (legacy.categories ?? []).map((k) => LEGACY_CATEGORY_LABELS[k] ?? k),
    people: [],
    places: [],
    notes: legacy.notes || undefined,
    updatedAt: legacy.updatedAt,
  };
}

export async function getDiaryEntries(): Promise<DiaryEntry[]> {
  const map = await hgetallJSON<DiaryEntry | LegacyEveningLogEntry>(HASH_KEY);
  return Object.values(map)
    .map(normalize)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function upsertDiaryEntry(date: string, input: DiaryEntryInput): Promise<DiaryEntry> {
  const currentRaw = await hgetJSON<DiaryEntry | LegacyEveningLogEntry>(HASH_KEY, date);
  const current = currentRaw ? normalize(currentRaw) : null;

  // Tell kun labels som er NYE siden forrige lagring av samme dag — hindrer
  // at telling blåses opp bare fordi man redigerer/lagrer samme dag flere
  // ganger. Dette er også den eneste veien en helt ny preset blir opprettet.
  const categoryPairs: [DiaryPresetCategory, string[], string[]][] = [
    ["morgen", input.morning, current?.morning ?? []],
    ["ettermiddag", input.afternoon, current?.afternoon ?? []],
    ["kveld", input.evening, current?.evening ?? []],
    ["personer", input.people, current?.people ?? []],
    ["steder", input.places, current?.places ?? []],
  ];
  for (const [category, next, prev] of categoryPairs) {
    const prevLower = new Set(prev.map((l) => l.toLowerCase()));
    const newlyAdded = next.filter((l) => !prevLower.has(l.toLowerCase()));
    for (const label of newlyAdded) {
      await recordDiaryPresetUsage(category, label);
    }
  }

  const entry: DiaryEntry = {
    date,
    morning: input.morning,
    afternoon: input.afternoon,
    evening: input.evening,
    people: input.people,
    places: input.places,
    notes: input.notes?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };
  await hsetJSON(HASH_KEY, date, entry);
  return entry;
}

export async function deleteDiaryEntry(date: string): Promise<void> {
  await hdel(HASH_KEY, date);
}
