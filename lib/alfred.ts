import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";
import { localDateString } from "./payday";

// Bevisst utelatt: fødselsnummer. Ikke nødvendig for ukentlig utviklingsoppfølging,
// og bør ikke ligge i flere systemer enn strengt tatt nødvendig.
export interface AlfredProfile {
  name: string;
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
  // Base64 data-URI, skalert/komprimert klientside (maks ~480x480, JPEG)
  // før opplasting — ingen fillagring-infrastruktur i appen i dag, se
  // AlfredPhoto i AlfredSection.tsx.
  photo?: string;
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
  achievedDate?: string; // "YYYY-MM-DD" — satt når done settes til true, fjernet ved re-åpning
}

export interface PlayIdea {
  id: string;
  label: string;
}

// Fritekstnotater Morten selv skriver — ikke å forveksle med de faste
// *Notat-feltene på AlfredProfile (én tekst per navngitt kategori). Disse er
// en fri, tidsstemplet liste man kan legge til, redigere og slette fra.
export interface AlfredFreeNote {
  id: string;
  text: string;
  createdAt: string; // ISO datetime
  updatedAt?: string; // ISO datetime — satt kun ved redigering
}

const PROFILE_KEY = "privat:alfred:profile";
const PROFILE_FIELD = "main";
const GROWTH_KEY = "privat:alfred:growth";
const MILESTONE_KEY = "privat:alfred:milestones";
const PLAY_KEY = "privat:alfred:play";
const FREE_NOTE_KEY = "privat:alfred:freenotes";

// Forhåndsutfylt med Mortens egen liste — kun brukt til å "frø" hashen første
// gang noen henter den (samme mønster som defaultverdiene i updateAlfredProfile).
// Etter første henting er Redis alene sannheten; å fjerne alle punktene senere
// gir en tom liste, ikke en ny runde med disse forslagene.
const DEFAULT_PLAY_IDEAS = ["Bære på nakken", "Spille musikk", "Balkong og se på biler", "Se i speil", "Gå med vogn"];

// Generøs, standard liste over kommende MOTORISKE milepæler — frøes inn i
// "fokus"-kategorien (vist i UI som "Fremtidige milepæler") første gang den
// er tom, samme mønster som DEFAULT_PLAY_IDEAS over. Bevisst "heller for
// mange enn for få" (jf. Morten) — dekker grovt sett 1-4 år, ikke kalibrert
// til nøyaktig alder siden det ikke er kjent her.
const DEFAULT_FUTURE_MILESTONES = [
  "Går oppreist alene",
  "Går baklengs",
  "Løper",
  "Klatrer opp i møbler",
  "Går opp trapp med støtte",
  "Går ned trapp med støtte",
  "Går opp trapp uten støtte, ett trinn i gangen",
  "Går ned trapp med alternerende fot",
  "Sparker en ball",
  "Kaster en ball",
  "Fanger en ball",
  "Hopper med begge ben samtidig",
  "Står på ett ben et par sekunder",
  "Balanserer på ett ben lenger enn 5 sekunder",
  "Hinker på ett ben",
  "Trår trehjulssykkel",
  "Sykler med pedaler og støttehjul",
  "Sykler uten støttehjul",
  "Går på line/balansebom",
  "Klatrer i klatrestativ",
  "Bygger tårn av klosser",
  "Tegner rette streker",
  "Tegner en sirkel",
  "Klipper med saks",
  "Knapper/kneppe klær selv",
  "Tar av seg sko/sokker selv",
  "Trer perler på snor",
  "Vasker hender selv",
  "Pusser tenner med hjelp",
];

export async function getAlfredProfile(): Promise<AlfredProfile | null> {
  return hgetJSON<AlfredProfile>(PROFILE_KEY, PROFILE_FIELD);
}

export async function updateAlfredProfile(updates: Partial<AlfredProfile>): Promise<AlfredProfile> {
  const current = (await getAlfredProfile()) ?? {
    name: "",
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
  const existing = Object.values(map);

  // "fokus"-kategorien kan allerede ha egne, personlig tilpassede punkter
  // (f.eks. lagt inn via chatboten) — de skal IKKE overskrives/dupliseres.
  // Sjekker derfor mot selve label-settet i stedet for "er kategorien tom",
  // slik at frøingen kun skjer én gang selv om det allerede finnes andre
  // fokus-punkter, og legger seg TIL i tillegg til dem, ikke i stedet for.
  const seededLabels = new Set(DEFAULT_FUTURE_MILESTONES);
  if (!existing.some((m) => m.category === "fokus" && seededLabels.has(m.label))) {
    const seeded: Milestone[] = DEFAULT_FUTURE_MILESTONES.map((label) => ({
      id: randomUUID(),
      category: "fokus",
      label,
      done: false,
    }));
    await Promise.all(seeded.map((m) => hsetJSON(MILESTONE_KEY, m.id, m)));
    return sortMilestones([...existing, ...seeded]);
  }

  return sortMilestones(existing);
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
  const willBeDone = !current.done;
  const next: Milestone = { ...current, done: willBeDone, achievedDate: willBeDone ? localDateString() : undefined };
  await hsetJSON(MILESTONE_KEY, id, next);
  return next;
}

export async function deleteMilestone(id: string): Promise<void> {
  await hdel(MILESTONE_KEY, id);
}

export async function getPlayIdeas(): Promise<PlayIdea[]> {
  const map = await hgetallJSON<PlayIdea>(PLAY_KEY);
  if (Object.keys(map).length > 0) return Object.values(map);

  const seeded: PlayIdea[] = DEFAULT_PLAY_IDEAS.map((label) => ({ id: randomUUID(), label }));
  await Promise.all(seeded.map((idea) => hsetJSON(PLAY_KEY, idea.id, idea)));
  return seeded;
}

export async function addPlayIdea(label: string): Promise<PlayIdea> {
  if (!label.trim()) throw new Error("Mangler tekst");
  const idea: PlayIdea = { id: randomUUID(), label: label.trim() };
  await hsetJSON(PLAY_KEY, idea.id, idea);
  return idea;
}

export async function deletePlayIdea(id: string): Promise<void> {
  await hdel(PLAY_KEY, id);
}

function sortFreeNotes(notes: AlfredFreeNote[]): AlfredFreeNote[] {
  return [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAlfredFreeNotes(): Promise<AlfredFreeNote[]> {
  const map = await hgetallJSON<AlfredFreeNote>(FREE_NOTE_KEY);
  return sortFreeNotes(Object.values(map));
}

export async function addAlfredFreeNote(text: string): Promise<AlfredFreeNote> {
  if (!text.trim()) throw new Error("Notat mangler tekst");
  const note: AlfredFreeNote = { id: randomUUID(), text: text.trim(), createdAt: new Date().toISOString() };
  await hsetJSON(FREE_NOTE_KEY, note.id, note);
  return note;
}

export async function editAlfredFreeNote(id: string, text: string): Promise<AlfredFreeNote | null> {
  if (!text.trim()) throw new Error("Notat mangler tekst");
  const current = await hgetJSON<AlfredFreeNote>(FREE_NOTE_KEY, id);
  if (!current) return null;
  const next: AlfredFreeNote = { ...current, text: text.trim(), updatedAt: new Date().toISOString() };
  await hsetJSON(FREE_NOTE_KEY, id, next);
  return next;
}

export async function deleteAlfredFreeNote(id: string): Promise<void> {
  await hdel(FREE_NOTE_KEY, id);
}
