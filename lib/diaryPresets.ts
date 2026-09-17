import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

// Brukerdefinert, telling-sortert preset-katalog for Dagbok — samme mønster
// som lib/shoppingQuickPicks.ts (QuickPick), men med `category` som
// diskriminant i stedet for `section`, og delt på tvers av begge
// spørsmålene (personer/steder) i én hash i stedet for to separate.
//
// Kategoriene morgen/ettermiddag/kveld falt bort da dagboken ble forenklet
// til hvem/hvor/notat (sep. 2026). Gamle rader med de kategoriene ligger
// fortsatt i Redis, men matcher ingen filtrering og vises derfor ikke.
export type DiaryPresetCategory = "personer" | "steder";

export interface DiaryPreset {
  id: string;
  category: DiaryPresetCategory;
  label: string;
  count: number; // antall ganger valgt — styrer "topp 3"-sortering i UI
  createdAt: string;
}

const HASH_KEY = "privat:diary-presets";
const SEED_CATEGORIES: DiaryPresetCategory[] = ["personer"];
const SEED_LABELS = ["Alfred", "Hilde", "Jobb"];

function sortPresets(presets: DiaryPreset[]): DiaryPreset[] {
  return [...presets].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "nb"));
}

export async function getDiaryPresets(): Promise<DiaryPreset[]> {
  const map = await hgetallJSON<DiaryPreset>(HASH_KEY);
  let presets = Object.values(map);

  // Selv-helbredende seeding (samme mønster som reminders.ts sin "mangler
  // order"-migrering) — de tre startpresetene dukker opp av seg selv første
  // gang noen åpner Dagbok, uten en egen manuell seed-kjøring.
  if (presets.length === 0) {
    presets = await Promise.all(
      SEED_CATEGORIES.flatMap((category) =>
        SEED_LABELS.map(async (label) => {
          const preset: DiaryPreset = { id: randomUUID(), category, label, count: 0, createdAt: new Date().toISOString() };
          await hsetJSON(HASH_KEY, preset.id, preset);
          return preset;
        }),
      ),
    );
  }

  return sortPresets(presets);
}

// Case-insensitive match INNEN kategorien — finnes fra før økes telleren,
// ellers opprettes en ny preset med telling 1. Dette er også den eneste
// veien en helt ny preset blir til (ingen eget "opprett"-endepunkt).
export async function recordDiaryPresetUsage(category: DiaryPresetCategory, label: string): Promise<DiaryPreset> {
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Preset mangler tekst");

  const map = await hgetallJSON<DiaryPreset>(HASH_KEY);
  const existing = Object.values(map).find(
    (p) => p.category === category && p.label.toLowerCase() === trimmed.toLowerCase(),
  );
  if (existing) {
    const next: DiaryPreset = { ...existing, count: existing.count + 1 };
    await hsetJSON(HASH_KEY, next.id, next);
    return next;
  }

  const created: DiaryPreset = { id: randomUUID(), category, label: trimmed, count: 1, createdAt: new Date().toISOString() };
  await hsetJSON(HASH_KEY, created.id, created);
  return created;
}

export async function renameDiaryPreset(id: string, label: string): Promise<DiaryPreset | null> {
  const current = await hgetJSON<DiaryPreset>(HASH_KEY, id);
  if (!current) return null;
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Preset mangler tekst");
  const next: DiaryPreset = { ...current, label: trimmed };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteDiaryPreset(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}
