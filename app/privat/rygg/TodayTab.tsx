"use client";

import { useState } from "react";
import type { RyggDailyLog, RyggProgramMeta, RyggSessionLog, RyggWeekState } from "@/lib/ryggLog";
import { deloadDoseWeek, deloadSets } from "@/lib/ryggAlgorithm";
import { nextVariant, phaseForWeek, programForWeek } from "@/lib/ryggProgram";
import { getRyggExercise } from "@/lib/ryggExercises";
import { localDateString } from "@/lib/payday";
import { vibrate } from "@/lib/haptics";
import { DECISION_COLOR_CLASS, DECISION_LABEL, phaseLabelForWeek, ringOffset, RING_LENGTH } from "./ryggHelpers";

interface Props {
  meta: RyggProgramMeta;
  weekState: RyggWeekState;
  dailyLogs: RyggDailyLog[];
  sessionLogs: RyggSessionLog[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}

export default function TodayTab({ meta, weekState, dailyLogs, sessionLogs, onChanged, onError }: Props) {
  const today = localDateString();
  const cycleStartDate = weekState.startedAt.slice(0, 10);
  const cycleSessions = sessionLogs.filter((s) => s.week === weekState.week && s.date >= cycleStartDate && s.completed);
  const sessionsRemaining = Math.max(0, 3 - cycleSessions.length);
  const todaySession = cycleSessions.find((s) => s.date === today);
  const todayDaily = dailyLogs.find((d) => d.date === today);

  const [showSessionFlow, setShowSessionFlow] = useState(false);
  const [showAfterSession, setShowAfterSession] = useState(false);
  const [rpe, setRpe] = useState<number | null>(null);
  const [aggravated, setAggravated] = useState(false);
  const [savingSession, setSavingSession] = useState(false);

  const [pain, setPain] = useState<number | null>(todayDaily?.pain ?? null);
  const [radiating, setRadiating] = useState(todayDaily?.radiating ?? false);
  const [walked, setWalked] = useState(todayDaily?.walked ?? false);
  const [note, setNote] = useState(todayDaily?.note ?? "");
  const [savingDaily, setSavingDaily] = useState(false);

  if (weekState.decision === "hold") {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-status-danger/30 bg-status-danger/[0.06] p-3.5">
          <p className="text-sm font-semibold text-status-danger">Programmet er på hold</p>
          <p className="mt-1 text-sm text-ink-2">{weekState.decisionReason}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              const res = await fetch(`/api/rygg/weeks/${weekState.week}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "resume" }),
              });
              if (!res.ok) throw new Error("resume failed");
              await onChanged();
            } catch {
              onError("Kunne ikke gjenoppta programmet. Prøv igjen.");
            }
          }}
          className="self-start rounded-lg bg-status-danger/15 px-3 py-1.5 text-2xs font-semibold uppercase text-status-danger transition hover:bg-status-danger/25"
        >
          Jeg har snakket med fysio — fortsett programmet
        </button>
      </div>
    );
  }

  const variant = phaseForWeek(weekState.week) === 3 ? nextVariant(cycleSessions.at(-1)?.variant) : undefined;
  const isDeload = weekState.decision === "deload";
  const doseWeek = isDeload ? deloadDoseWeek(weekState.week, meta.highestCompletedWeek) : weekState.week;
  const items = programForWeek(doseWeek, variant);

  async function handleCompleteSession() {
    if (rpe === null) return;
    setSavingSession(true);
    try {
      const res = await fetch("/api/rygg/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: today,
          week: weekState.week,
          sessionNo: cycleSessions.length + 1,
          variant,
          completed: true,
          rpe,
          aggravated,
        }),
      });
      if (!res.ok) throw new Error("session log failed");
      vibrate();
      setShowAfterSession(false);
      setShowSessionFlow(false);
      setRpe(null);
      setAggravated(false);
      await onChanged();
    } catch {
      onError("Kunne ikke lagre økten. Prøv igjen.");
    } finally {
      setSavingSession(false);
    }
  }

  async function handleSaveDaily() {
    if (pain === null) return;
    setSavingDaily(true);
    try {
      const res = await fetch("/api/rygg/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, pain, radiating, walked, note }),
      });
      if (!res.ok) throw new Error("daily log failed");
      vibrate();
      await onChanged();
    } catch {
      onError("Kunne ikke lagre dagsloggen. Prøv igjen.");
    } finally {
      setSavingDaily(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="hero-card card-rise relative flex items-center gap-4 overflow-hidden rounded-[22px] p-4">
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.13em] opacity-80">
            Uke {weekState.week} · {phaseLabelForWeek(weekState.week)}
          </p>
          <p className="text-[38px] font-light leading-[0.82] tracking-[-0.05em] tabular-nums">
            {sessionsRemaining}
            <span className="ml-2 text-[12px] font-medium tracking-normal opacity-85">
              {sessionsRemaining === 1 ? "økt igjen" : "økter igjen"}
            </span>
          </p>
          {weekState.decision && weekState.decisionReason && (
            <p className={`mt-1.5 text-2xs ${DECISION_COLOR_CLASS[weekState.decision]}`}>
              {DECISION_LABEL[weekState.decision]}: {weekState.decisionReason}
            </p>
          )}
        </div>
        <svg viewBox="0 0 44 44" className="h-14 w-14 shrink-0" role="img" aria-label={`${cycleSessions.length} av 3 økter`}>
          <circle cx="22" cy="22" r="18" strokeWidth="4" stroke="rgba(255,255,255,.22)" fill="none" />
          <circle
            cx="22"
            cy="22"
            r="18"
            strokeWidth="4"
            stroke="#fff"
            fill="none"
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={ringOffset(cycleSessions.length, 3)}
            strokeLinecap="round"
            transform="rotate(-90 22 22)"
          />
          <text x="22" y="26.5" textAnchor="middle" className="fill-white text-[10px] font-semibold">
            {cycleSessions.length}/3
          </text>
        </svg>
      </section>

      {isDeload && (
        <p className="text-2xs text-status-warning">Lettere uke: doser fra uke {doseWeek}, én serie mindre per øvelse.</p>
      )}

      {!todaySession && sessionsRemaining > 0 && !showSessionFlow && (
        <button
          type="button"
          onClick={() => setShowSessionFlow(true)}
          className="self-start rounded-lg bg-status-action px-3.5 py-2 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-status-action/85"
        >
          Start økt
        </button>
      )}

      {showSessionFlow && !showAfterSession && (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink-1">
              Dagens økt{variant ? ` · variant ${variant}` : ""}
            </p>
            <button type="button" onClick={() => setShowSessionFlow(false)} className="text-2xs text-ink-4 hover:text-ink-2">
              Lukk
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => {
              const exercise = getRyggExercise(item.exerciseId);
              const sets = isDeload ? deloadSets(item.sets) : item.sets;
              return (
                <li key={item.exerciseId} className="rounded-lg border border-line bg-surface-1 px-2.5 py-2">
                  <p className="text-sm font-medium text-ink-1">{exercise?.name ?? item.exerciseId}</p>
                  <p className="text-2xs text-ink-3">
                    {item.dose}
                    {isDeload && sets !== item.sets ? ` (${sets} serier — redusert)` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => setShowAfterSession(true)}
            className="self-start rounded-lg bg-status-positive px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-status-positive/85"
          >
            Fullført
          </button>
        </div>
      )}

      {showAfterSession && (
        <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface-2 p-3">
          <p className="text-sm font-semibold text-ink-1">Hvor tungt opplevdes økta?</p>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRpe(n)}
                aria-pressed={rpe === n}
                className={`h-8 w-8 rounded-lg text-xs font-semibold transition ${
                  rpe === n ? "bg-emerald-400 text-surface-0" : "bg-surface-1 text-ink-3 hover:text-ink-1"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={aggravated} onChange={(e) => setAggravated(e.target.checked)} className="h-4 w-4" />
            Verre i ryggen etter denne økta
          </label>
          <button
            type="button"
            disabled={rpe === null || savingSession}
            onClick={handleCompleteSession}
            className="self-start rounded-lg bg-status-positive px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-status-positive/85 disabled:opacity-50"
          >
            Lagre økt
          </button>
        </div>
      )}

      {todaySession && <p className="text-2xs text-status-positive">Dagens økt er logget (RPE {todaySession.rpe}).</p>}

      <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface-2 p-3">
        <p className="text-sm font-semibold text-ink-1">Dagens smertelogg</p>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 11 }, (_, i) => i).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPain(n)}
              aria-pressed={pain === n}
              className={`h-8 w-8 rounded-lg text-xs font-semibold transition ${
                pain === n ? "bg-emerald-400 text-surface-0" : "bg-surface-1 text-ink-3 hover:text-ink-1"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={radiating} onChange={(e) => setRadiating(e.target.checked)} className="h-4 w-4" />
            Utstråling/nummenhet
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={walked} onChange={(e) => setWalked(e.target.checked)} className="h-4 w-4" />
            Gikk 20+ min
          </label>
        </div>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Notat (valgfritt)"
          className="rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-sm text-ink-1 placeholder:text-ink-4"
        />
        <button
          type="button"
          disabled={pain === null || savingDaily}
          onClick={handleSaveDaily}
          className="self-start rounded-lg bg-emerald-400/15 px-3 py-1.5 text-2xs font-semibold uppercase text-emerald-400 transition hover:bg-emerald-400/25 disabled:opacity-50"
        >
          {todayDaily ? "Oppdater logg" : "Lagre logg"}
        </button>
      </div>
    </div>
  );
}
