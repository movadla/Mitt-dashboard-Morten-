import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

// Enkelt "prosjekt"-konsept à la Asana — ett sted for sjekkliste/gjesteliste/
// innkjøp knyttet til en avgrenset hendelse (første instans: Alfreds dåp).
// Samme embedded-liste-mønster som Reminder.subtasks i lib/reminders.ts —
// datamengden per prosjekt er liten nok til at hele objektet leses/skrives
// samlet i stedet for egne hasher per sub-liste.
export type ProjectStatus = "planlegging" | "pagar" | "fullfort";

export interface ProjectChecklistItem {
  id: string;
  text: string;
  done: boolean;
  // Fritekstnotat om DETTE punktet (ikke hele prosjektet) — f.eks. detaljer,
  // avklaringer eller status underveis. Skrives både fra UI-et og av
  // assistenten (se add_project_item/note_on_project_item i lib/chatAgent.ts).
  notes?: string;
}

export interface ProjectGuest {
  id: string;
  name: string;
  done: boolean; // "kommer"
}

export interface ProjectPurchaseItem {
  id: string;
  name: string;
  quantity?: string;
  done: boolean;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  targetDate?: string; // "YYYY-MM-DD"
  status: ProjectStatus;
  order: number;
  createdAt: string;
  checklist: ProjectChecklistItem[];
  guests: ProjectGuest[];
  purchases: ProjectPurchaseItem[];
}

export interface ProjectUpdateInput {
  name?: string;
  description?: string | null;
  targetDate?: string | null;
  status?: ProjectStatus;
}

const HASH_KEY = "privat:projects";

function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => a.order - b.order);
}

export async function getProjects(): Promise<Project[]> {
  const map = await hgetallJSON<Project>(HASH_KEY);
  return sortProjects(Object.values(map));
}

export async function addProject(name: string, targetDate?: string): Promise<Project> {
  if (!name.trim()) throw new Error("Prosjekt mangler navn");
  const map = await hgetallJSON<Project>(HASH_KEY);
  const existingOrders = Object.values(map).map((p) => p.order ?? 0);
  const order = existingOrders.length > 0 ? Math.min(...existingOrders) - 1 : 0;
  const project: Project = {
    id: randomUUID(),
    name: name.trim(),
    targetDate,
    status: "planlegging",
    order,
    createdAt: new Date().toISOString(),
    checklist: [],
    guests: [],
    purchases: [],
  };
  await hsetJSON(HASH_KEY, project.id, project);
  return project;
}

export async function updateProject(id: string, updates: ProjectUpdateInput): Promise<Project | null> {
  const current = await hgetJSON<Project>(HASH_KEY, id);
  if (!current) return null;

  const name = updates.name !== undefined ? updates.name.trim() : current.name;
  if (!name) throw new Error("Prosjekt mangler navn");

  const next: Project = {
    ...current,
    name,
    description: updates.description !== undefined ? (updates.description ?? undefined) : current.description,
    targetDate: updates.targetDate !== undefined ? (updates.targetDate ?? undefined) : current.targetDate,
    status: updates.status !== undefined ? updates.status : current.status,
  };
  await hsetJSON(HASH_KEY, id, next);
  return next;
}

export async function deleteProject(id: string): Promise<void> {
  await hdel(HASH_KEY, id);
}

export async function reorderProjects(ids: string[]): Promise<Project[]> {
  await Promise.all(
    ids.map(async (id, index) => {
      const current = await hgetJSON<Project>(HASH_KEY, id);
      if (!current) return;
      await hsetJSON(HASH_KEY, id, { ...current, order: index });
    }),
  );
  return getProjects();
}

export async function addChecklistItem(projectId: string, text: string, notes?: string): Promise<Project | null> {
  if (!text.trim()) throw new Error("Punkt mangler tekst");
  const current = await hgetJSON<Project>(HASH_KEY, projectId);
  if (!current) return null;
  const item: ProjectChecklistItem = { id: randomUUID(), text: text.trim(), done: false, notes: notes?.trim() || undefined };
  const next: Project = { ...current, checklist: [...(current.checklist ?? []), item] };
  await hsetJSON(HASH_KEY, projectId, next);
  return next;
}

// Setter eller LEGGER TIL et notat på ett punkt. append=true skiller de to
// bruksmåtene: UI-redigering erstatter teksten (append=false), mens
// assistenten normalt legger til en ny linje uten å slette det som står der
// (append=true) — samme "ikke overskriv det brukeren allerede har"-prinsipp
// som add_diary_item i lib/chatAgent.ts.
export async function setChecklistItemNote(
  projectId: string,
  itemId: string,
  notes: string,
  append = false,
): Promise<Project | null> {
  const current = await hgetJSON<Project>(HASH_KEY, projectId);
  if (!current) return null;
  const next: Project = {
    ...current,
    checklist: (current.checklist ?? []).map((i) => {
      if (i.id !== itemId) return i;
      const trimmed = notes.trim();
      if (!trimmed) return { ...i, notes: undefined };
      return { ...i, notes: append && i.notes ? `${i.notes}\n${trimmed}` : trimmed };
    }),
  };
  await hsetJSON(HASH_KEY, projectId, next);
  return next;
}

export async function toggleChecklistItem(projectId: string, itemId: string): Promise<Project | null> {
  const current = await hgetJSON<Project>(HASH_KEY, projectId);
  if (!current) return null;
  const next: Project = {
    ...current,
    checklist: (current.checklist ?? []).map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
  };
  await hsetJSON(HASH_KEY, projectId, next);
  return next;
}

export async function deleteChecklistItem(projectId: string, itemId: string): Promise<Project | null> {
  const current = await hgetJSON<Project>(HASH_KEY, projectId);
  if (!current) return null;
  const next: Project = { ...current, checklist: (current.checklist ?? []).filter((i) => i.id !== itemId) };
  await hsetJSON(HASH_KEY, projectId, next);
  return next;
}

export async function addGuest(projectId: string, name: string): Promise<Project | null> {
  if (!name.trim()) throw new Error("Gjest mangler navn");
  const current = await hgetJSON<Project>(HASH_KEY, projectId);
  if (!current) return null;
  const guest: ProjectGuest = { id: randomUUID(), name: name.trim(), done: false };
  const next: Project = { ...current, guests: [...(current.guests ?? []), guest] };
  await hsetJSON(HASH_KEY, projectId, next);
  return next;
}

export async function toggleGuest(projectId: string, guestId: string): Promise<Project | null> {
  const current = await hgetJSON<Project>(HASH_KEY, projectId);
  if (!current) return null;
  const next: Project = {
    ...current,
    guests: (current.guests ?? []).map((g) => (g.id === guestId ? { ...g, done: !g.done } : g)),
  };
  await hsetJSON(HASH_KEY, projectId, next);
  return next;
}

export async function deleteGuest(projectId: string, guestId: string): Promise<Project | null> {
  const current = await hgetJSON<Project>(HASH_KEY, projectId);
  if (!current) return null;
  const next: Project = { ...current, guests: (current.guests ?? []).filter((g) => g.id !== guestId) };
  await hsetJSON(HASH_KEY, projectId, next);
  return next;
}

export async function addPurchase(projectId: string, name: string, quantity?: string): Promise<Project | null> {
  if (!name.trim()) throw new Error("Vare mangler navn");
  const current = await hgetJSON<Project>(HASH_KEY, projectId);
  if (!current) return null;
  const item: ProjectPurchaseItem = { id: randomUUID(), name: name.trim(), quantity: quantity?.trim() || undefined, done: false };
  const next: Project = { ...current, purchases: [...(current.purchases ?? []), item] };
  await hsetJSON(HASH_KEY, projectId, next);
  return next;
}

export async function togglePurchase(projectId: string, itemId: string): Promise<Project | null> {
  const current = await hgetJSON<Project>(HASH_KEY, projectId);
  if (!current) return null;
  const next: Project = {
    ...current,
    purchases: (current.purchases ?? []).map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
  };
  await hsetJSON(HASH_KEY, projectId, next);
  return next;
}

export async function deletePurchase(projectId: string, itemId: string): Promise<Project | null> {
  const current = await hgetJSON<Project>(HASH_KEY, projectId);
  if (!current) return null;
  const next: Project = { ...current, purchases: (current.purchases ?? []).filter((i) => i.id !== itemId) };
  await hsetJSON(HASH_KEY, projectId, next);
  return next;
}
