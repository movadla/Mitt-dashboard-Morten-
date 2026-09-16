"use client";

import type { RyggDailyLog, RyggProgramMeta, RyggSessionLog, RyggWeekState } from "@/lib/ryggLog";
import { addDaysIso } from "@/lib/payday";
import { DECISION_COLOR_CLASS, formatPain } from "./ryggHelpers";

interface Props {
  weeks: RyggWeekState[];
  dailyLogs: RyggDailyLog[];
  sessionLogs: RyggSessionLog[];
  meta: RyggProgramMeta;
}

const CHART_W = 680;
const CHART_H = 160;
const PAD_L = 24;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 20;

function rollingAverage(dailyLogs: RyggDailyLog[], dates: string[]): (number | null)[] {
  const byDate = new Map(dailyLogs.map((d) => [d.date, d.pain]));
  return dates.map((date, i) => {
    const windowDates = dates.slice(Math.max(0, i - 6), i + 1);
    const values = windowDates.map((d) => byDate.get(d)).filter((v): v is number => v !== undefined);
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  });
}

export default function TrendTab({ weeks, dailyLogs, sessionLogs, meta }: Props) {
  if (dailyLogs.length === 0) {
    return <p className="text-sm text-ink-4">Ingen data ennå — trenden vises så snart du har logget noen dager.</p>;
  }

  const sortedDates = [...dailyLogs].sort((a, b) => a.date.localeCompare(b.date)).map((d) => d.date);
  const firstDate = sortedDates[0];
  const lastDate = sortedDates[sortedDates.length - 1];
  const totalDays = Math.round((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / 86400000) + 1;
  const allDates: string[] = Array.from({ length: totalDays }, (_, i) => addDaysIso(firstDate, i));
  const rolling = rollingAverage(dailyLogs, allDates);

  const xForDate = (date: string) => {
    const idx = allDates.indexOf(date);
    return PAD_L + (idx / Math.max(1, allDates.length - 1)) * (CHART_W - PAD_L - PAD_R);
  };
  const yForValue = (v: number) => PAD_T + (1 - v / 10) * (CHART_H - PAD_T - PAD_B);

  const linePoints = rolling
    .map((v, i) => (v === null ? null : `${xForDate(allDates[i])},${yForValue(v)}`))
    .filter((p): p is string => p !== null)
    .join(" ");

  const rpePoints = sessionLogs.filter((s) => s.completed && s.date >= firstDate && s.date <= lastDate);
  const decisionMarks = weeks.filter((w) => w.decision && w.decision !== "progress" && w.startedAt >= firstDate);

  const weeksWithDays = weeks.map((w) => {
    const cycleStart = w.startedAt.slice(0, 10);
    const cycleEnd = w.closedAt ? w.closedAt.slice(0, 10) : lastDate;
    const daysInCycle = dailyLogs.filter((d) => d.date >= cycleStart && d.date <= cycleEnd);
    const walkedDays = daysInCycle.filter((d) => d.walked).length;
    return { week: w.week, walkedRatio: daysInCycle.length > 0 ? walkedDays / daysInCycle.length : 0, dayCount: daysInCycle.length };
  }).filter((w) => w.dayCount > 0);

  const completedSessions = sessionLogs.filter((s) => s.completed).length;
  const plannedSessions = weeks.reduce((sum, w) => sum + (w.decision ? 3 : 0), 0) || completedSessions;

  const first3 = dailyLogs.filter((d) => d.date <= addDaysIso(firstDate, 20)).map((d) => d.pain);
  const last3 = dailyLogs.filter((d) => d.date >= addDaysIso(lastDate, -20)).map((d) => d.pain);
  const first3Avg = first3.length > 0 ? first3.reduce((a, b) => a + b, 0) / first3.length : null;
  const last3Avg = last3.length > 0 ? last3.reduce((a, b) => a + b, 0) / last3.length : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-line bg-surface-2 p-3">
        <div className="mb-2 flex items-center gap-4 text-2xs">
          <span className="flex items-center gap-1.5 text-ink-3">
            <span className="inline-block h-0.5 w-3 rounded-full bg-emerald-400" /> Smertesnitt (7 dager)
          </span>
          <span className="flex items-center gap-1.5 text-ink-3">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-status-action" /> RPE per økt
          </span>
        </div>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full text-ink-3" role="img" aria-label="Smerte- og RPE-trend over tid">
          {[0, 5, 10].map((v) => (
            <g key={v}>
              <line x1={PAD_L} x2={CHART_W - PAD_R} y1={yForValue(v)} y2={yForValue(v)} stroke="currentColor" strokeOpacity={0.12} />
              <text x={2} y={yForValue(v) + 3} className="fill-current text-[9px]" opacity={0.6}>
                {v}
              </text>
            </g>
          ))}
          {decisionMarks.map((w) => (
            <line
              key={w.week}
              x1={xForDate(w.startedAt.slice(0, 10))}
              x2={xForDate(w.startedAt.slice(0, 10))}
              y1={PAD_T}
              y2={CHART_H - PAD_B}
              className={DECISION_COLOR_CLASS[w.decision!]}
              stroke="currentColor"
              strokeOpacity={0.35}
              strokeDasharray="2,2"
            />
          ))}
          <polyline
            points={linePoints}
            fill="none"
            className="stroke-emerald-400"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {rpePoints.map((s) => (
            <circle key={s.id} cx={xForDate(s.date)} cy={yForValue(s.rpe)} r={3} className="fill-status-action" />
          ))}
        </svg>
      </div>

      {weeksWithDays.length > 0 && (
        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-4">Andel dager med gange, per uke</p>
          <div className="flex items-end gap-1.5" style={{ height: 48 }}>
            {weeksWithDays.map((w) => (
              <div key={w.week} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div className="w-full rounded-t bg-emerald-400/70" style={{ height: `${Math.max(4, w.walkedRatio * 100)}%` }} />
                </div>
                <span className="text-[9px] text-ink-4">{w.week}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-line bg-surface-2 p-3 text-sm text-ink-2">
        <p>
          {completedSessions} av {plannedSessions} planlagte økter gjennomført.
        </p>
        {first3Avg !== null && last3Avg !== null && (
          <p className="mt-1">
            Smertesnitt siste 3 uker: {formatPain(last3Avg)} — mot {formatPain(first3Avg)} i starten (
            {last3Avg <= first3Avg ? "bedring" : "økning"}).
          </p>
        )}
        <p className="mt-1 text-2xs text-ink-4">Uke {meta.currentWeek} av 12.</p>
      </div>
    </div>
  );
}
