import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

// Bevisst utelatt: fødselsnummer. Ikke nødvendig for ukentlig utviklingsoppfølging,
// og bør ikke ligge i flere systemer enn strengt tatt nødvendig.
export interface AlfredProfile {
  born: string; // "YYYY-MM-DD"
  birthPlace: string;
  parents: string;
  address: string;
  motorikkNotat: string;
  helseNotat: string;
  matOgSovnNotat: string;
  permisjonNotat: string;
  barnehageNotat: string;
  barnesikringNotat: string;
  vekstNotat: string;
}

export interface GrowthEntry {
  id: string;
  date: string; // "YYYY-MM-DD"
  weightKg: number;
  lengthCm?: number;
  approxDate?: boolean; // datoen er anslått (~), ikke eksakt
}

export interface NewGrowthEntryInput {
  date: string;
  weightKg: number;
  lengthCm?: number;
  approxDate?: boolean;
}

export type MilestoneCategory = "motorikk" | "barnehage" | "fokus";

export interface Milestone {
  id: string;
  category: MilestoneCategory;
  label: string;
  done: boolean;
}

const PROFILE_KEY = "privat:alfred:profile";
const PROFILE_FIELD = "main";
const GROWTH_KEY = "privat:alfred:growth";
const MILESTONE_KEY = "privat:alfred:milestones";

export async function getAlfredProfile(): Promise<AlfredProfile | null> {
  return hgetJSON<AlfredProfile>(PROFILE_KEY, PROFILE_FIELD);
}

export async function updateAlfredProfile(updates: Partial<AlfredProfile>): Promise<AlfredProfile> {
  const current = (await getAlfredProfile()) ?? {
    born: "",
    birthPlace: "",
    parents: "",
    address: "",
    motorikkNotat: "",
    helseNotat: "",
    matOgSovnNotat: "",
    permisjonNotat: "",
    barnehageNotat: "",
    barnesikringNotat: "",
    vekstNotat: "",
  };
  const next: AlfredProfile = { ...current, ...updates };
  await hsetJSON(PROFILE_KEY, PROFILE_FIELD, next);
  return next;
}

function sortGrowth(entries: GrowthEntry[]): GrowthEntry[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
}

export async function getGrowthEntries(): Promise<GrowthEntry[]> {
  const map = await hgetallJSON<GrowthEntry>(GROWTH_KEY);
  return sortGrowth(Object.values(map));
}

export async function addGrowthEntry(input: NewGrowthEntryInput): Promise<GrowthEntry> {
  if (!input.date) throw new Error("Måling mangler dato");
  if (typeof input.weightKg !== "number" || Number.isNaN(input.weightKg)) {
    throw new Error("Måling mangler vekt");
  }
  const entry: GrowthEntry = {
    id: randomUUID(),
    date: input.date,
    weightKg: input.weightKg,
    lengthCm: input.lengthCm,
    approxDate: input.approxDate,
  };
  await hsetJSON(GROWTH_KEY, entry.id, entry);
  return entry;
}

export async function deleteGrowthEntry(id: string): Promise<void> {
  await hdel(GROWTH_KEY, id);
}

function sortMilestones(items: Milestone[]): Milestone[] {
  const order: Record<MilestoneCategory, number> = { motorikk: 0, barnehage: 1, fokus: 2 };
  return [...items].sort((a, b) => order[a.category] - order[b.category]);
}

export async function getMilestones(): Promise<Milestone[]> {
  const map = await hgetallJSON<Milestone>(MILESTONE_KEY);
  return sortMilestones(Object.values(map));
}

export async function addMilestone(category: MilestoneCategory, label: string, done = false): Promise<Milestone> {
  if (!label.trim()) throw new Error("Mangler tekst");
  const milestone: Milestone = { id: randomUUID(), category, label: label.trim(), done };
  await hsetJSON(MILESTONE_KEY, milestone.id, milestone);
  return milestone;
}

export async function toggleMilestone(id: string): Promise<Milestone | null> {
  const current = await hgetJSON<Milestone>(MILESTONE_KEY, id);
  if (!current) return null;
  const next: Milestone = { ...current, done: !current.done };
  await hsetJSON(MILESTONE_KEY, id, next);
  return next;
}

export async function deleteMilestone(id: string): Promise<void> {
  await hdel(MILESTONE_KEY, id);
}
