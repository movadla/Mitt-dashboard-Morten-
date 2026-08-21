import { hgetJSON, hsetJSON } from "./kv";

export interface JobbTaskState {
  done: string[];
  priorityOverrides: Record<string, string>;
  snoozed: Record<string, string>;
}

const EMPTY_STATE: JobbTaskState = { done: [], priorityOverrides: {}, snoozed: {} };

// Ett felles JSON-blob i stedet for per-oppgave-felt — tilstanden er allerede
// tre små records, og alt skrives/leses alltid samlet (speiler hvordan de tre
// localStorage-nøklene ble lest/skrevet sammen i klienten før denne endringen).
const HASH_KEY = "jobb:task-state";
const FIELD = "state";

export async function getJobbTaskState(): Promise<JobbTaskState> {
  return (await hgetJSON<JobbTaskState>(HASH_KEY, FIELD)) ?? EMPTY_STATE;
}

export async function saveJobbTaskState(state: JobbTaskState): Promise<void> {
  await hsetJSON(HASH_KEY, FIELD, state);
}
