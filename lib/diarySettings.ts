import { hgetJSON, hsetJSON } from "./kv";

// Ren visnings-referanse — påvirker IKKE hvilke presets/spørsmål som vises
// eller når, kun en liten undertekst i veiviseren (avklart med Morten).
export interface DiaryPeriodRange {
  from: string; // "HH:MM"
  to: string; // "HH:MM"
}

export interface DiarySettings {
  morgen: DiaryPeriodRange;
  ettermiddag: DiaryPeriodRange;
  kveld: DiaryPeriodRange;
}

const HASH_KEY = "privat:diary-settings";
const FIELD = "config";

const DEFAULT_SETTINGS: DiarySettings = {
  morgen: { from: "00:00", to: "10:59" },
  ettermiddag: { from: "11:00", to: "16:59" },
  kveld: { from: "17:00", to: "23:59" },
};

export async function getDiarySettings(): Promise<DiarySettings> {
  const stored = await hgetJSON<DiarySettings>(HASH_KEY, FIELD);
  return stored ?? DEFAULT_SETTINGS;
}

export async function updateDiarySettings(settings: DiarySettings): Promise<DiarySettings> {
  await hsetJSON(HASH_KEY, FIELD, settings);
  return settings;
}
