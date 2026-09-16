import "server-only";
import {
  getRyggDailyLogs,
  getRyggProgramMeta,
  getRyggSessionLogs,
  getRyggWeekState,
  updateRyggProgramMeta,
  upsertRyggWeekState,
  type RyggProgramMeta,
  type RyggWeekDecision,
  type RyggWeekState,
} from "./ryggLog";
import { computeWeekMetrics, evaluateWeek, shouldCloseWeek } from "./ryggAlgorithm";

// Maks antall uker vi lar den lazy lukke-sjekken kaskadere i ett kall — kun
// en sikkerhetsmargin mot en uendelig løkke, ikke en reell programgrense
// (programmet har 12 uker + vedlikehold, langt under dette).
const MAX_CASCADE_ITERATIONS = 30;

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// Fellesfunksjon for hva som skjer ETTER en beslutning er tatt — brukt både
// av den automatiske lukke-løkken og av manuell overstyring, slik at
// konsekvensene (uke-fremgang, deload-telling, "siste beslutning"-sporing)
// aldri kan drifte fra hverandre mellom de to inngangene.
function applyDecisionConsequence(
  weekState: RyggWeekState,
  meta: RyggProgramMeta,
  decision: RyggWeekDecision,
  reason: string,
  painAvg: number | undefined,
  now: Date,
  manualOverride: boolean,
): { updatedWeek: RyggWeekState; newWeek: RyggWeekState | null; meta: RyggProgramMeta } {
  const isDeload = decision === "deload";
  const isProgress = decision === "progress";
  const isRepeat = decision === "repeat";
  const isHold = decision === "hold";

  const nextMeta: RyggProgramMeta = {
    ...meta,
    totalDeloads: meta.totalDeloads + (isDeload ? 1 : 0),
    // "hold" er en sikkerhetsfrys, ikke en doserings-beslutning — teller
    // ikke mot "aldri to deloads på rad"-sperren.
    lastDecision: isHold ? meta.lastDecision : decision,
  };

  const closedState: RyggWeekState = {
    ...weekState,
    decision,
    decisionReason: reason,
    painAvg,
    repeatCount: isRepeat ? weekState.repeatCount + 1 : weekState.repeatCount,
    manualOverride: manualOverride || undefined,
  };

  if (isProgress) {
    nextMeta.highestCompletedWeek = Math.max(nextMeta.highestCompletedWeek, weekState.week);
    const finished: RyggWeekState = { ...closedState, closedAt: now.toISOString() };
    const newWeekNo = weekState.week + 1;
    nextMeta.currentWeek = newWeekNo;
    const newWeek: RyggWeekState = { week: newWeekNo, startedAt: now.toISOString(), repeatCount: 0 };
    return { updatedWeek: finished, newWeek, meta: nextMeta };
  }

  if (isHold) {
    // Fryser — ingen ny syklus startes automatisk. Krever explicit resume.
    return { updatedWeek: closedState, newWeek: null, meta: nextMeta };
  }

  // repeat/deload: ny syklus av SAMME uke, med gårsdagens beslutning synlig
  // som forklaring på hvilke doser som gjelder nå.
  const restarted: RyggWeekState = { ...closedState, startedAt: now.toISOString(), closedAt: undefined };
  return { updatedWeek: restarted, newWeek: null, meta: nextMeta };
}

export interface RyggCycleResult {
  currentWeekState: RyggWeekState;
  meta: RyggProgramMeta;
}

// Kalles lazy (ved hver GET) i stedet for via cron — samme mønster som
// lib/diary.ts sin les-tids-migrering. Lukker så mange uker som faktisk er
// forfalt (normalt 0 eller 1, men kan kaskadere hvis appen ikke har vært
// åpnet på en stund).
export async function closeDueWeeksIfNeeded(now: Date = new Date()): Promise<RyggCycleResult> {
  let meta = await getRyggProgramMeta();
  let weekState = await getRyggWeekState(meta.currentWeek);
  if (!weekState) {
    weekState = { week: meta.currentWeek, startedAt: now.toISOString(), repeatCount: 0 };
    await upsertRyggWeekState(weekState);
  }

  for (let i = 0; i < MAX_CASCADE_ITERATIONS; i++) {
    if (weekState.decision === "hold") break;

    const [allDaily, allSessions] = await Promise.all([getRyggDailyLogs(), getRyggSessionLogs()]);
    const cycleStartDate = weekState.startedAt.slice(0, 10);
    const cycleDaily = allDaily.filter((d) => d.date >= cycleStartDate);
    const cycleSessions = allSessions.filter((s) => s.week === weekState!.week && s.date >= cycleStartDate);
    const completedCount = cycleSessions.filter((s) => s.completed).length;

    if (!shouldCloseWeek(weekState.startedAt, completedCount, now)) break;

    const metrics = computeWeekMetrics(cycleDaily, cycleSessions);
    const priorWeek = weekState.week > 1 ? await getRyggWeekState(weekState.week - 1) : null;
    const priorWeekPainAvg = weekState.week === 1 ? null : priorWeek?.painAvg ?? null;

    const result = evaluateWeek({
      week: weekState.week,
      metrics,
      priorWeekPainAvg,
      repeatCountThisWeek: weekState.repeatCount,
      totalDeloadsSoFar: meta.totalDeloads,
      lastDecision: meta.lastDecision ?? null,
    });

    const applied = applyDecisionConsequence(weekState, meta, result.decision, result.reason, metrics.painAvg ?? undefined, now, false);
    await upsertRyggWeekState(applied.updatedWeek);
    if (applied.newWeek) await upsertRyggWeekState(applied.newWeek);
    meta = await updateRyggProgramMeta(applied.meta);
    weekState = applied.newWeek ?? applied.updatedWeek;
  }

  return { currentWeekState: weekState, meta };
}

// Manuell overstyring — "algoritmen er et forslag, ikke en sjef" (spec §4).
// Kjører samme konsekvens-logikk som auto-lukkingen, slik at en overstyrt
// "progress" faktisk flytter uke-telleren osv.
export async function overrideWeekDecision(
  week: number,
  decision: RyggWeekDecision,
  reason: string,
  now: Date = new Date(),
): Promise<RyggCycleResult> {
  const meta = await getRyggProgramMeta();
  const weekState = await getRyggWeekState(week);
  if (!weekState) throw new Error(`Fant ikke uke ${week}`);

  const applied = applyDecisionConsequence(weekState, meta, decision, reason, weekState.painAvg, now, true);
  await upsertRyggWeekState(applied.updatedWeek);
  if (applied.newWeek) await upsertRyggWeekState(applied.newWeek);
  const nextMeta = await updateRyggProgramMeta(applied.meta);
  return { currentWeekState: applied.newWeek ?? applied.updatedWeek, meta: nextMeta };
}

// Manuell kvittering for å gjenoppta programmet etter "hold" (utstråling).
// Ingen automatisk gjenoppstart — brukeren må aktivt bekrefte (spec §4).
export async function resumeFromHold(week: number, now: Date = new Date()): Promise<RyggWeekState> {
  const weekState = await getRyggWeekState(week);
  if (!weekState) throw new Error(`Fant ikke uke ${week}`);
  if (weekState.decision !== "hold") throw new Error("Uka er ikke satt på hold");

  const resumed: RyggWeekState = {
    ...weekState,
    decision: undefined,
    decisionReason: undefined,
    startedAt: now.toISOString(),
    closedAt: undefined,
  };
  await upsertRyggWeekState(resumed);
  return resumed;
}

export interface RyggStatus {
  currentWeek: number;
  weekDecision: RyggWeekDecision | null;
  isHold: boolean;
  sessionsThisWeek: number;
  needsSessionToday: boolean;
  todayLogged: boolean;
  yesterdayLogged: boolean;
}

export async function getRyggStatus(now: Date = new Date()): Promise<RyggStatus> {
  const { currentWeekState } = await closeDueWeeksIfNeeded(now);
  const [dailyLogs, sessionLogs] = await Promise.all([getRyggDailyLogs(), getRyggSessionLogs()]);

  const today = todayIso(now);
  const yesterday = todayIso(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const cycleStartDate = currentWeekState.startedAt.slice(0, 10);
  const cycleSessions = sessionLogs.filter((s) => s.week === currentWeekState.week && s.date >= cycleStartDate && s.completed);
  const isHold = currentWeekState.decision === "hold";

  return {
    currentWeek: currentWeekState.week,
    weekDecision: currentWeekState.decision ?? null,
    isHold,
    sessionsThisWeek: cycleSessions.length,
    needsSessionToday: !isHold && cycleSessions.length < 3 && !cycleSessions.some((s) => s.date === today),
    todayLogged: dailyLogs.some((d) => d.date === today),
    yesterdayLogged: dailyLogs.some((d) => d.date === yesterday),
  };
}
