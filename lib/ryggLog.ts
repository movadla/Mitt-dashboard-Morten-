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
  // Hvilke øvelser som faktisk ble krysset av underveis — kan avvike fra
  // full liste ved en avkortet økt. Valgfri: gamle logger (før dette feltet
  // fantes) har ingen verdi, ikke en tom liste.
  completedExerciseIds?: string[];
  // v2 (2026-09-28, Morten: "jeg må kunne fylle ut hvor tung jeg syns hver
  // øvelse er"): tyngde PR ØVELSE (1-10), i tillegg til `rpe` som fortsatt er
  // den samlede tyngden for HELE økten. Nøkkel = exerciseId. Valgfri av samme
  // grunn som completedExerciseIds - gamle logger har ingen verdi.
  exerciseRpe?: Record<string, number>;
  // v3 (2026-10-01, Morten: "hvor godt følte jeg jeg fikk til øvelsen" - egen
  // dimensjon fra tyngde, se eksempelet som utløste dette: curl-up/birddog fikk
  // 9/10 i tyngde, men det viste seg å være nakke-/armtretthet, ikke et tegn på at
  // korsryggen hadde problemer med øvelsen). Skala 1-5 (mestringsfølelse), IKKE
  // samme skala som exerciseRpe (1-10, anstrengelse) - to ulike spørsmål, aldri
  // bland dem sammen i visning eller i AI-kommentar-laget (Del 2).
  exerciseQuality?: Record<string, number>;
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
  completedExerciseIds?: string[];
  exerciseRpe?: Record<string, number>;
  exerciseQuality?: Record<string, number>;
}

export type RyggWeekDecision = "progress" | "repeat" | "deload" | "hold";

export interface RyggWeekState {
  week: number; // PK
  startedAt: string; // ISO
  closedAt?: string; // ISO
  decision?: RyggWeekDecision;
  decisionReason?: string;
  // v1 (2026-10-01, Del 2 av "personlig trener"-ønsket): KOMMENTAR, aldri en beslutning -
  // evaluateWeek() i lib/ryggAlgorithm.ts bestemmer fortsatt progress/repeat/deload/hold helt
  // alene og uendret. Dette er AI-generert tekst LAGT PÅ TOPP av `decisionReason`, samme
  // livssyklus (satt når uka lukkes, ikke arvet inn i en ny uke ved progress - se
  // applyDecisionConsequence i lib/ryggWeekCycle.ts). Valgfri: AI-kallet kan feile uten at
  // noe annet i uke-lukkingen stopper opp.
  coachNote?: string;
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
    completedExerciseIds: input.completedExerciseIds,
    exerciseRpe: input.exerciseRpe,
    exerciseQuality: input.exerciseQuality,
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
  // v1 (2026-10-01): forrige ukes AI-trenerkommentar, sendt inn som kontekst til neste
  // generering slik at den ikke gjentar seg selv uke for uke (se lib/ryggCoach.ts).
  lastCoachNote?: string;
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
