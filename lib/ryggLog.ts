import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

export interface RyggDailyLog {
  date: string; // "YYYY-MM-DD", PK
  pain: number; // 0-10
  radiating: boolean;
  walked: boolean;
  note?: string;
  updatedAt: string;
}

export interface RyggDailyLogInput {
  pain: number;
  radiating: boolean;
  walked: boolean;
  note?: string;
}

export interface RyggSessionLog {
  id: string;
  date: string; // "YYYY-MM-DD"
  week: number; // hvilken programuke økta tilhørte
  sessionNo: number; // 1-3
  variant?: "A" | "B";
  completed: boolean;
  rpe: number; // 1-10
  aggravated: boolean;
  note?: string;
}

export interface RyggSessionLogInput {
  date: string;
  week: number;
  sessionNo: number;
  variant?: "A" | "B";
  completed: boolean;
  rpe: number;
  aggravated: boolean;
  note?: string;
}

export type RyggWeekDecision = "progress" | "repeat" | "deload" | "hold";

export interface RyggWeekState {
  week: number; // PK
  startedAt: string; // ISO
  closedAt?: string; // ISO
  decision?: RyggWeekDecision;
  decisionReason?: string;
  // Smertesnittet DENNE syklusen endte på — lagres slik at NESTE ukes
  // evaluering kan lese "forrige ukes smertesnitt" uten å måtte grave i
  // rådataene for en uke som kan ha startet på nytt (repeat/deload).
  painAvg?: number;
  repeatCount: number;
  manualOverride?: boolean;
}

const DAILY_HASH_KEY = "privat:rygg-daily-log";
const SESSION_HASH_KEY = "privat:rygg-session-log";
const WEEK_HASH_KEY = "privat:rygg-week-state";
const META_HASH_KEY = "privat:rygg-meta";

export async function getRyggDailyLogs(): Promise<RyggDailyLog[]> {
  const map = await hgetallJSON<RyggDailyLog>(DAILY_HASH_KEY);
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getRyggDailyLog(date: string): Promise<RyggDailyLog | null> {
  return hgetJSON<RyggDailyLog>(DAILY_HASH_KEY, date);
}

export async function upsertRyggDailyLog(date: string, input: RyggDailyLogInput): Promise<RyggDailyLog> {
  const entry: RyggDailyLog = {
    date,
    pain: input.pain,
    radiating: input.radiating,
    walked: input.walked,
    note: input.note?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };
  await hsetJSON(DAILY_HASH_KEY, date, entry);
  return entry;
}

export async function deleteRyggDailyLog(date: string): Promise<void> {
  await hdel(DAILY_HASH_KEY, date);
}

export async function getRyggSessionLogs(): Promise<RyggSessionLog[]> {
  const map = await hgetallJSON<RyggSessionLog>(SESSION_HASH_KEY);
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

export async function addRyggSessionLog(input: RyggSessionLogInput): Promise<RyggSessionLog> {
  const entry: RyggSessionLog = {
    id: randomUUID(),
    date: input.date,
    week: input.week,
    sessionNo: input.sessionNo,
    variant: input.variant,
    completed: input.completed,
    rpe: input.rpe,
    aggravated: input.aggravated,
    note: input.note?.trim() || undefined,
  };
  await hsetJSON(SESSION_HASH_KEY, entry.id, entry);
  return entry;
}

export async function updateRyggSessionLog(
  id: string,
  updates: Partial<RyggSessionLogInput>,
): Promise<RyggSessionLog | null> {
  const current = await hgetJSON<RyggSessionLog>(SESSION_HASH_KEY, id);
  if (!current) return null;
  const next: RyggSessionLog = {
    ...current,
    ...updates,
    note: updates.note !== undefined ? updates.note?.trim() || undefined : current.note,
  };
  await hsetJSON(SESSION_HASH_KEY, id, next);
  return next;
}

export async function deleteRyggSessionLog(id: string): Promise<void> {
  await hdel(SESSION_HASH_KEY, id);
}

export async function getRyggWeekStates(): Promise<RyggWeekState[]> {
  const map = await hgetallJSON<RyggWeekState>(WEEK_HASH_KEY);
  return Object.values(map).sort((a, b) => a.week - b.week);
}

export async function getRyggWeekState(week: number): Promise<RyggWeekState | null> {
  return hgetJSON<RyggWeekState>(WEEK_HASH_KEY, String(week));
}

export async function upsertRyggWeekState(state: RyggWeekState): Promise<RyggWeekState> {
  await hsetJSON(WEEK_HASH_KEY, String(state.week), state);
  return state;
}

// Program-nivå tilstand som ikke passer naturlig på én enkelt ukerad: hvilken
// uke som er "aktiv" akkurat nå, og globale, tidsordnede telleverk (total
// antall deloads, forrige AVSLUTTEDE sykluss beslutning) som sperrene i
// lib/ryggAlgorithm.ts trenger på tvers av uker — spec-ens rygg_week_state
// (PK=uke) kan ikke alene bære "aldri to deloads på rad" eller "maks to
// deloads totalt", siden disse er globale/tidsordnede, ikke uke-lokale.
export interface RyggProgramMeta {
  disclaimerSeenAt?: string;
  currentWeek: number; // 1-12, 13 = vedlikeholdsmodus (spec §8)
  totalDeloads: number;
  lastDecision?: RyggWeekDecision; // siste AVSLUTTEDE syklus sin beslutning
  highestCompletedWeek: number; // høyeste uke som noensinne har fått "progress" — brukt som gulv ved deload
}

const DEFAULT_META: RyggProgramMeta = {
  currentWeek: 1,
  totalDeloads: 0,
  highestCompletedWeek: 0,
};

export async function getRyggProgramMeta(): Promise<RyggProgramMeta> {
  const meta = await hgetJSON<RyggProgramMeta>(META_HASH_KEY, "meta");
  return meta ? { ...DEFAULT_META, ...meta } : { ...DEFAULT_META };
}

export async function updateRyggProgramMeta(updates: Partial<RyggProgramMeta>): Promise<RyggProgramMeta> {
  const current = await getRyggProgramMeta();
  const next = { ...current, ...updates };
  await hsetJSON<RyggProgramMeta>(META_HASH_KEY, "meta", next);
  return next;
}

export async function getRyggDisclaimerSeenAt(): Promise<string | null> {
  const meta = await getRyggProgramMeta();
  return meta.disclaimerSeenAt ?? null;
}

export async function markRyggDisclaimerSeen(): Promise<void> {
  await updateRyggProgramMeta({ disclaimerSeenAt: new Date().toISOString() });
}
