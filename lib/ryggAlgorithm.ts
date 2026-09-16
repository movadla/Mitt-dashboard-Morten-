import type { RyggDailyLog, RyggSessionLog, RyggWeekDecision } from "./ryggLog";
import { phaseForWeek } from "./ryggProgram";

// Antall ekstra dager utover 7 vi venter på økt nr. 3 før uka tvinges lukket
// uansett (se lukkings-regelen i evaluateShouldCloseWeek under for
// resonnementet bak "det som inntreffer sist").
const WEEK_GRACE_DAYS = 3;

export interface RyggWeekMetrics {
  painAvg: number | null;
  rpeAvg: number | null;
  sessionsCompleted: number;
  daysLogged: number;
  radiating: boolean;
  aggravatedCount: number;
}

export function computeWeekMetrics(dailyLogs: RyggDailyLog[], sessionLogs: RyggSessionLog[]): RyggWeekMetrics {
  const painValues = dailyLogs.map((d) => d.pain);
  const completedSessions = sessionLogs.filter((s) => s.completed);
  const rpeValues = completedSessions.map((s) => s.rpe).filter((n): n is number => typeof n === "number");
  return {
    painAvg: painValues.length > 0 ? painValues.reduce((a, b) => a + b, 0) / painValues.length : null,
    rpeAvg: rpeValues.length > 0 ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length : null,
    sessionsCompleted: completedSessions.length,
    daysLogged: dailyLogs.length,
    radiating: dailyLogs.some((d) => d.radiating),
    aggravatedCount: completedSessions.filter((s) => s.aggravated).length,
  };
}

// Uka lukkes når det er gått 7 dager siden start OG minst 3 økter er
// gjennomført — "det som inntreffer sist" i spec-en. Ren OR (første treff
// vinner) ville gjort dag-7-lukking med 0-1 gjennomførte økter vanlig, og da
// ville "sessions(w) < 2 → repeat"-regelen i praksis aldri fått vente på at
// brukeren tar igjen økt nr. 3. Men et strengt AND uten tak kan i teorien
// holde en uke evig åpen hvis økt 3 aldri kommer — derfor et lite
// nådevindu: etter 7 + WEEK_GRACE_DAYS dager lukkes uka uansett, og
// data-mangelen fanges i stedet opp av repeat-regelen for få dager/økter.
export function shouldCloseWeek(startedAt: string, sessionsCompleted: number, now: Date = new Date()): boolean {
  const daysSinceStart = (now.getTime() - new Date(startedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceStart >= 7 + WEEK_GRACE_DAYS) return true;
  if (daysSinceStart < 7) return false;
  return sessionsCompleted >= 3;
}

export interface RyggWeekDecisionResult {
  decision: RyggWeekDecision;
  reason: string;
  physioEscalation: boolean;
}

export interface EvaluateWeekParams {
  week: number;
  metrics: RyggWeekMetrics;
  priorWeekPainAvg: number | null; // null for uke 1 (ingen baseline)
  repeatCountThisWeek: number; // hvor mange ganger DENNE uka allerede er gjentatt
  totalDeloadsSoFar: number; // globalt, alle 12 uker
  lastDecision: RyggWeekDecision | null; // forrige AVSLUTTEDE syklus sin beslutning, globalt
}

const MAX_REPEATS_PER_WEEK = 3;
const MAX_TOTAL_DELOADS = 2;
const PHYSIO_MESSAGE =
  "Dette er ikke lenger et doseringsproblem. Ta kontakt med fysioterapeut før du fortsetter programmet.";

function formatNum(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

export function evaluateWeek(params: EvaluateWeekParams): RyggWeekDecisionResult {
  const { week, metrics, priorWeekPainAvg, repeatCountThisWeek, totalDeloadsSoFar, lastDecision } = params;

  // Regel 1 (alltid først, uansett uke): utstråling fryser programmet.
  if (metrics.radiating) {
    return {
      decision: "hold",
      reason: "Du har registrert utstråling. Programmet står stille til du har snakket med fysio.",
      physioEscalation: false,
    };
  }

  // Uke 1 har ingen baseline å måle mot — gir alltid progress (med mindre
  // utstråling nettopp fanget den over).
  if (week === 1 || priorWeekPainAvg === null) {
    return { decision: "progress", reason: "Første uke — ingen baseline å sammenligne med ennå.", physioEscalation: false };
  }

  const delta = (metrics.painAvg ?? priorWeekPainAvg) - priorWeekPainAvg;

  let decision: RyggWeekDecision;
  let reason: string;

  if (metrics.daysLogged < 5) {
    decision = "repeat";
    reason = `Kun ${metrics.daysLogged} dager med smertelogg denne uka — for lite data til å justere. Samme doser en uke til.`;
  } else if (metrics.sessionsCompleted < 2) {
    decision = "repeat";
    reason = `Kun ${metrics.sessionsCompleted} av 3 økter gjennomført — for få økter til å vurdere responsen. Samme doser en uke til.`;
  } else if (delta > 2 || metrics.aggravatedCount >= 2) {
    decision = "deload";
    reason = `Smertesnittet gikk fra ${formatNum(priorWeekPainAvg)} til ${formatNum(metrics.painAvg ?? priorWeekPainAvg)}${
      metrics.aggravatedCount >= 2 ? ` og du meldte etterreaksjon etter ${metrics.aggravatedCount} økter` : ""
    }. Kjører en lettere uke.`;
  } else if (delta > 0.5 || (metrics.rpeAvg ?? 0) >= 8) {
    decision = "repeat";
    reason = `Smertesnittet gikk fra ${formatNum(priorWeekPainAvg)} til ${formatNum(metrics.painAvg ?? priorWeekPainAvg)}${
      metrics.rpeAvg != null ? ` og du lå på ${formatNum(metrics.rpeAvg)} i opplevd tyngde` : ""
    }. Samme doser en uke til.`;
  } else {
    decision = "progress";
    reason = `Smertesnittet gikk fra ${formatNum(priorWeekPainAvg)} til ${formatNum(metrics.painAvg ?? priorWeekPainAvg)} — stabilt nok til å øke belastningen.`;
  }

  // Sperre: aldri to deloads på rad.
  if (decision === "deload" && lastDecision === "deload") {
    return {
      decision: "repeat",
      reason: `${reason} Forrige uke var allerede en deload — kjører samme (reduserte) doser en uke til i stedet for enda en deload.`,
      physioEscalation: false,
    };
  }

  // Sperre: maks to deloads totalt i programmet.
  if (decision === "deload" && totalDeloadsSoFar >= MAX_TOTAL_DELOADS) {
    return { decision: "repeat", reason: `${reason} ${PHYSIO_MESSAGE}`, physioEscalation: true };
  }

  // Sperre: maks tre gjentakelser av samme uke.
  if (decision === "repeat" && repeatCountThisWeek >= MAX_REPEATS_PER_WEEK) {
    return { decision: "repeat", reason: `${reason} ${PHYSIO_MESSAGE}`, physioEscalation: true };
  }

  return { decision, reason, physioEscalation: false };
}

// Gulv: en deload skal aldri sende dosene under startuka til den fasen
// brukeren høyest har fullført. Er uke 8 fullført (fase 2), er gulvet uke 5
// (start fase 2) — deload kan altså midlertidig gå tilbake til enklere
// doser innenfor fasen, men aldri helt tilbake til fase 1.
function firstWeekOfPhase(phase: 1 | 2 | 3): number {
  if (phase === 1) return 1;
  if (phase === 2) return 5;
  return 9;
}

export function deloadFloorWeek(highestCompletedWeek: number): number {
  return firstWeekOfPhase(phaseForWeek(Math.max(highestCompletedWeek, 1)));
}

// Hvilken ukes doser en deload-syklus faktisk skal vise: forrige uke,
// men aldri under gulvet.
export function deloadDoseWeek(week: number, highestCompletedWeek: number): number {
  return Math.max(week - 1, deloadFloorWeek(highestCompletedWeek));
}

// Sett-reduksjon for deload: én serie mindre per øvelse, minimum 2.
export function deloadSets(originalSets: number): number {
  return Math.max(2, originalSets - 1);
}
