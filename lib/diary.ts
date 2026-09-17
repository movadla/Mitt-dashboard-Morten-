import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";
import { recordDiaryPresetUsage, type DiaryPresetCategory } from "./diaryPresets";

// Redis-hashen beholdes UENDRET som "privat:evening-log" (kun internt navn —
// ingen brukersynlig konsekvens) for å unngå enhver risiko for datatap ved en
// rename. Kun FORMEN på verdien endres — nå for tredje gang, se normalize().
const HASH_KEY = "privat:evening-log";

export interface DiaryEntry {
  date: string; // "YYYY-MM-DD"
  people: string[]; // "Hvem møtte du?"
  places: string[]; // "Hvor var du?"
  notes?: string;
  // Skritt legges inn manuelt fra Garmin Connect — Garmin sitt API krever en
  // godkjent utvikleravtale, så automatisk henting er ikke mulig her.
  steps?: number;
  // URL til et opplastet bilde (Vercel Blob, se app/api/diary/photo) — selve
  // bildet ligger ALDRI i Redis, som er en liten instans ment for tekst.
  photoUrl?: string;
  updatedAt: string;
}

export interface DiaryEntryInput {
  people: string[];
  places: string[];
  notes?: string;
  steps?: number | null;
  photoUrl?: string | null;
}

// Aller eldste form — Kveldslogg med kategori-NØKLER (ikke fritekst-labels).
interface LegacyEveningLogEntry {
  date: string;
  categories: string[];
  notes: string;
  updatedAt: string;
}

// Mellomformen (aug.–sep. 2026): egne lister per tid på døgnet.
interface LegacyThreePartEntry {
  date: string;
  morning: string[];
  afternoon: string[];
  evening: string[];
  people: string[];
  places: string[];
  notes?: string;
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

// Slår sammen tekst som ikke lenger har et eget felt inn i notatet, i stedet
// for å kaste den. Rekkefølgen er kronologisk (morgen først), og eksisterende
// notat beholdes under.
function foldIntoNotes(parts: [string, string[]][], existingNotes?: string): string | undefined {
  const folded = parts
    .filter(([, values]) => values.length > 0)
    .map(([label, values]) => `${label}: ${values.join(", ")}`)
    .join(" · ");
  const existing = existingNotes?.trim();
  if (!folded) return existing || undefined;
  return existing ? `${folded}\n${existing}` : folded;
}

// Selv-helbredende lese-tids-migrering (samme mønster som reminders.ts sin
// "mangler order"-migrering) — IKKE destruktiv, skriver ikke tilbake til
// Redis. Historikken fra begge de gamle formene beholdes, men flyttet inn i
// notat-feltet, siden dagboken nå bare har hvem/hvor/notat (+ skritt/bilde).
function normalize(raw: DiaryEntry | LegacyThreePartEntry | LegacyEveningLogEntry): DiaryEntry {
  if (Array.isArray((raw as LegacyEveningLogEntry).categories)) {
    const legacy = raw as LegacyEveningLogEntry;
    const labels = (legacy.categories ?? []).map((k) => LEGACY_CATEGORY_LABELS[k] ?? k);
    return {
      date: legacy.date,
      people: [],
      places: [],
      notes: foldIntoNotes([["Kveld", labels]], legacy.notes),
      updatedAt: legacy.updatedAt,
    };
  }

  if (Array.isArray((raw as LegacyThreePartEntry).morning)) {
    const legacy = raw as LegacyThreePartEntry;
    return {
      date: legacy.date,
      people: legacy.people ?? [],
      places: legacy.places ?? [],
      notes: foldIntoNotes(
        [
          ["Morgen", legacy.morning ?? []],
          ["Ettermiddag", legacy.afternoon ?? []],
          ["Kveld", legacy.evening ?? []],
        ],
        legacy.notes,
      ),
      updatedAt: legacy.updatedAt,
    };
  }

  return raw as DiaryEntry;
}

export async function getDiaryEntries(): Promise<DiaryEntry[]> {
  const map = await hgetallJSON<DiaryEntry | LegacyThreePartEntry | LegacyEveningLogEntry>(HASH_KEY);
  return Object.values(map)
    .map(normalize)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function upsertDiaryEntry(date: string, input: DiaryEntryInput): Promise<DiaryEntry> {
  const currentRaw = await hgetJSON<DiaryEntry | LegacyThreePartEntry | LegacyEveningLogEntry>(HASH_KEY, date);
  const current = currentRaw ? normalize(currentRaw) : null;

  // Tell kun labels som er NYE siden forrige lagring av samme dag — hindrer
  // at telling blåses opp bare fordi man redigerer/lagrer samme dag flere
  // ganger. Dette er også den eneste veien en helt ny preset blir opprettet.
  const categoryPairs: [DiaryPresetCategory, string[], string[]][] = [
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
    people: input.people,
    places: input.places,
    notes: input.notes?.trim() || undefined,
    // null fjerner feltet, undefined lar det stå urørt (samme konvensjon som
    // resten av oppdaterings-inputene i appen).
    steps: input.steps !== undefined ? (input.steps ?? undefined) : current?.steps,
    photoUrl: input.photoUrl !== undefined ? (input.photoUrl ?? undefined) : current?.photoUrl,
    updatedAt: new Date().toISOString(),
  };
  await hsetJSON(HASH_KEY, date, entry);
  return entry;
}

export async function deleteDiaryEntry(date: string): Promise<void> {
  await hdel(HASH_KEY, date);
}
