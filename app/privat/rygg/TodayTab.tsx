"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronLeft } from "lucide-react";
import type { RyggDailyLog, RyggProgramMeta, RyggSessionLog, RyggWeekState } from "@/lib/ryggLog";
import { deloadDoseWeek, deloadSets } from "@/lib/ryggAlgorithm";
import { nextVariant, phaseForWeek, programForWeek, type RyggProgramItem } from "@/lib/ryggProgram";
import { getRyggExercise, type RyggExercise } from "@/lib/ryggExercises";
import { localDateString } from "@/lib/payday";
import { vibrate } from "@/lib/haptics";
import { DECISION_COLOR_CLASS, DECISION_LABEL, phaseLabelForWeek, ringOffset, RING_LENGTH } from "./ryggHelpers";
import ExerciseDiagram from "./ExerciseDiagram";

interface Props {
  meta: RyggProgramMeta;
  weekState: RyggWeekState;
  dailyLogs: RyggDailyLog[];
  sessionLogs: RyggSessionLog[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}

// "I dag" er en tretrinns flyt med ÉN primærhandling synlig om gangen:
// oversikt over dagens økt -> guidet gjennomføring, én øvelse per skjerm ->
// ett samlet skjema etterpå (tyngde + smerte). Smerteloggen ligger bevisst
// ETTER økten på treningsdager, ikke som en egen boks ved siden av.
type Stage = "overview" | "session" | "post";

const PRIMARY_BTN =
  "w-full rounded-xl bg-accent-privat px-4 py-3 text-sm font-semibold text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40";
const GHOST_BTN = "rounded-lg px-3 py-2 text-xs font-medium text-ink-3 transition hover:text-ink-1 disabled:opacity-30";

interface PainValues {
  pain: number | null;
  radiating: boolean;
  walked: boolean;
  note: string;
}

function NumberScale({
  min,
  max,
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  min: number;
  max: number;
  value: number | null;
  onChange: (n: number) => void;
  lowLabel: string;
  highLabel: string;
}) {
  const numbers = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${numbers.length}, minmax(0, 1fr))` }}>
        {numbers.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={value === n}
            className={`h-10 rounded-lg text-sm font-semibold tabular-nums transition ${
              value === n ? "bg-emerald-400 text-surface-0" : "bg-surface-1 text-ink-3 hover:text-ink-1"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-wide text-ink-4">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

function PainFields({ values, onChange }: { values: PainValues; onChange: (next: PainValues) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <NumberScale
        min={0}
        max={10}
        value={values.pain}
        onChange={(pain) => onChange({ ...values, pain })}
        lowLabel="Ingen smerte"
        highLabel="Verst tenkelig"
      />
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={values.radiating}
            onChange={(e) => onChange({ ...values, radiating: e.target.checked })}
            className="h-4 w-4"
          />
          Utstråling eller nummenhet
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={values.walked} onChange={(e) => onChange({ ...values, walked: e.target.checked })} className="h-4 w-4" />
          Gikk 20 minutter eller mer
        </label>
      </div>
      <input
        type="text"
        value={values.note}
        onChange={(e) => onChange({ ...values, note: e.target.value })}
        placeholder="Notat (valgfritt)"
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder:text-ink-4"
      />
    </div>
  );
}

function ExerciseDetail({ exercise, item, sets, isDeload }: { exercise: RyggExercise; item: RyggProgramItem; sets: number; isDeload: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="mx-auto h-32 w-full max-w-xs text-emerald-400">
        <ExerciseDiagram exerciseId={item.exerciseId} />
      </div>
      <div>
        <p className="text-lg font-semibold text-ink-1">{exercise.name}</p>
        <p className="text-sm text-ink-2">
          {item.dose}
          {isDeload && sets !== item.sets ? ` · redusert til ${sets} serier` : ""}
        </p>
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-4">Slik gjør du det</p>
          <p className="mt-0.5 leading-snug text-ink-2">{exercise.how}</p>
        </div>
        <div className="rounded-lg border-l-2 border-emerald-400/70 bg-emerald-400/5 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">Viktigst</p>
          <p className="mt-0.5 leading-snug text-ink-1">{exercise.cue}</p>
        </div>
      </div>
    </div>
  );
}

export default function TodayTab({ meta, weekState, dailyLogs, sessionLogs, onChanged, onError }: Props) {
  const today = localDateString();
  const cycleStartDate = weekState.startedAt.slice(0, 10);
  const cycleSessions = sessionLogs.filter((s) => s.week === weekState.week && s.date >= cycleStartDate && s.completed);
  const sessionsDone = cycleSessions.length;
  const sessionsRemaining = Math.max(0, 3 - sessionsDone);
  const todaySession = cycleSessions.find((s) => s.date === today);
  const todayDaily = dailyLogs.find((d) => d.date === today);

  const [stage, setStage] = useState<Stage>("overview");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPainCardOnSessionDay, setShowPainCardOnSessionDay] = useState(false);
  const [editingPain, setEditingPain] = useState(false);
  const [saving, setSaving] = useState(false);

  const [rpe, setRpe] = useState<number | null>(null);
  const [aggravated, setAggravated] = useState(false);
  const [painValues, setPainValues] = useState<PainValues>({
    pain: todayDaily?.pain ?? null,
    radiating: todayDaily?.radiating ?? false,
    walked: todayDaily?.walked ?? false,
    note: todayDaily?.note ?? "",
  });

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
  const sessionNo = sessionsDone + 1;

  function setsFor(item: RyggProgramItem) {
    return isDeload ? deloadSets(item.sets) : item.sets;
  }

  function startSession() {
    setCompletedIds(new Set());
    setCurrentIndex(0);
    setStage("session");
  }

  function advance(markDone: boolean) {
    const item = items[currentIndex];
    if (markDone && item) {
      setCompletedIds((prev) => new Set(prev).add(item.exerciseId));
      vibrate();
    }
    if (currentIndex >= items.length - 1) setStage("post");
    else setCurrentIndex((i) => i + 1);
  }

  async function savePainOnly() {
    if (painValues.pain === null) return;
    setSaving(true);
    try {
      const res = await fetch("/api/rygg/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, ...painValues }),
      });
      if (!res.ok) throw new Error("daily log failed");
      vibrate();
      setEditingPain(false);
      setShowPainCardOnSessionDay(false);
      await onChanged();
    } catch {
      onError("Kunne ikke lagre smerteloggen. Prøv igjen.");
    } finally {
      setSaving(false);
    }
  }

  async function savePostSession() {
    if (rpe === null || painValues.pain === null) return;
    setSaving(true);
    try {
      const sessionRes = await fetch("/api/rygg/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: today,
          week: weekState.week,
          sessionNo,
          variant,
          completed: true,
          rpe,
          aggravated,
          completedExerciseIds: Array.from(completedIds),
        }),
      });
      if (!sessionRes.ok) throw new Error("session log failed");
      const dailyRes = await fetch("/api/rygg/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, ...painValues }),
      });
      if (!dailyRes.ok) throw new Error("daily log failed");
      vibrate([10, 40, 10]);
      setStage("overview");
      setRpe(null);
      setAggravated(false);
      await onChanged();
    } catch {
      onError("Kunne ikke lagre økten. Prøv igjen.");
    } finally {
      setSaving(false);
    }
  }

  // ── Trinn 2: guidet gjennomføring, én øvelse per skjerm ──
  if (stage === "session") {
    const item = items[currentIndex];
    const exercise = item ? getRyggExercise(item.exerciseId) : undefined;
    const isLast = currentIndex >= items.length - 1;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">
            Økt {sessionNo} av 3 · Øvelse {currentIndex + 1} av {items.length}
          </p>
          <button type="button" onClick={() => setStage("overview")} className="text-2xs text-ink-4 hover:text-ink-2">
            Avbryt økt
          </button>
        </div>
        <div className="flex gap-1">
          {items.map((it, i) => (
            <span
              key={it.exerciseId}
              className={`h-1 flex-1 rounded-full ${
                completedIds.has(it.exerciseId) ? "bg-emerald-400" : i === currentIndex ? "bg-emerald-400/40" : "bg-surface-3"
              }`}
            />
          ))}
        </div>
        {item && exercise && (
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <ExerciseDetail exercise={exercise} item={item} sets={setsFor(item)} isDeload={isDeload} />
          </div>
        )}
        <button type="button" onClick={() => advance(true)} className={PRIMARY_BTN}>
          {isLast ? "Ferdig med siste øvelse" : "Ferdig — neste øvelse"}
        </button>
        <div className="flex items-center justify-between">
          <button type="button" disabled={currentIndex === 0} onClick={() => setCurrentIndex((i) => i - 1)} className={`${GHOST_BTN} flex items-center gap-1`}>
            <ChevronLeft className="h-3.5 w-3.5" /> Forrige
          </button>
          <button type="button" onClick={() => advance(false)} className={GHOST_BTN}>
            Hopp over denne
          </button>
        </div>
      </div>
    );
  }

  // ── Trinn 3: ett samlet skjema etter økten ──
  if (stage === "post") {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-400 text-surface-0">
              <Check className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-1">Økten er ferdig</p>
              <p className="text-2xs text-ink-3">
                {completedIds.size} av {items.length} øvelser gjennomført
              </p>
            </div>
          </div>
        </div>

        <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4">
          <div>
            <p className="text-sm font-semibold text-ink-1">1. Hvor tung var økten?</p>
            <p className="text-2xs text-ink-4">Samlet opplevd tyngde, 1–10.</p>
          </div>
          <NumberScale min={1} max={10} value={rpe} onChange={setRpe} lowLabel="Veldig lett" highLabel="Maksimalt" />
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={aggravated} onChange={(e) => setAggravated(e.target.checked)} className="h-4 w-4" />
            Ryggen ble verre av økten
          </label>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4">
          <div>
            <p className="text-sm font-semibold text-ink-1">2. Hvordan er ryggen nå?</p>
            <p className="text-2xs text-ink-4">Smerte i korsryggen i dag, 0–10.</p>
          </div>
          <PainFields values={painValues} onChange={setPainValues} />
        </section>

        <button type="button" disabled={rpe === null || painValues.pain === null || saving} onClick={savePostSession} className={PRIMARY_BTN}>
          Lagre økt og smertelogg
        </button>
        <button type="button" onClick={() => setStage("session")} className={`${GHOST_BTN} self-start`}>
          Tilbake til øvelsene
        </button>
      </div>
    );
  }

  // ── Trinn 1: oversikt ──
  const painCardVisible = !!todaySession || sessionsRemaining === 0 || showPainCardOnSessionDay;
  const painCompact = !!todayDaily && !editingPain;

  return (
    <div className="flex flex-col gap-3">
      <section className="hero-card card-rise relative flex items-center gap-4 overflow-hidden rounded-[22px] p-4">
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.13em] opacity-80">
            Uke {weekState.week} · {phaseLabelForWeek(weekState.week)}
          </p>
          <p className="text-[38px] font-light leading-[0.82] tracking-[-0.05em] tabular-nums">
            {sessionsDone}
            <span className="ml-2 text-[12px] font-medium tracking-normal opacity-85">av 3 økter denne uken</span>
          </p>
          {weekState.decision && weekState.decisionReason && (
            <p className={`mt-1.5 text-2xs ${DECISION_COLOR_CLASS[weekState.decision]}`}>
              {DECISION_LABEL[weekState.decision]}: {weekState.decisionReason}
            </p>
          )}
        </div>
        <svg viewBox="0 0 44 44" className="h-14 w-14 shrink-0" role="img" aria-label={`${sessionsDone} av 3 økter`}>
          <circle cx="22" cy="22" r="18" strokeWidth="4" stroke="rgba(255,255,255,.22)" fill="none" />
          <circle
            cx="22"
            cy="22"
            r="18"
            strokeWidth="4"
            stroke="#fff"
            fill="none"
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={ringOffset(sessionsDone, 3)}
            strokeLinecap="round"
            transform="rotate(-90 22 22)"
          />
          <text x="22" y="26.5" textAnchor="middle" className="fill-white text-[10px] font-semibold">
            {sessionsDone}/3
          </text>
        </svg>
      </section>

      {todaySession ? (
        <section className="rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-400 text-surface-0">
              <Check className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-1">Dagens økt er gjennomført</p>
              <p className="text-2xs text-ink-3">
                Økt {todaySession.sessionNo} av 3 · tyngde {todaySession.rpe}/10
                {todaySession.completedExerciseIds ? ` · ${todaySession.completedExerciseIds.length} øvelser` : ""}
                {todaySession.aggravated ? " · etterreaksjon" : ""}
              </p>
            </div>
          </div>
        </section>
      ) : sessionsRemaining > 0 ? (
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink-1">Dagens økt</p>
              <p className="text-2xs text-ink-4">
                Økt {sessionNo} av 3{variant ? ` · variant ${variant}` : ""} · {items.length} øvelser
              </p>
            </div>
            {isDeload && <span className="text-2xs text-status-warning">Lettere uke</span>}
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {items.map((item, i) => {
              const exercise = getRyggExercise(item.exerciseId);
              const expanded = expandedId === item.exerciseId;
              return (
                <li key={item.exerciseId}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : item.exerciseId)}
                    aria-expanded={expanded}
                    className="flex w-full items-center gap-3 py-2 text-left"
                  >
                    <span className="w-4 shrink-0 text-2xs tabular-nums text-ink-4">{i + 1}</span>
                    <span className="h-10 w-12 shrink-0 text-ink-3">
                      <ExerciseDiagram exerciseId={item.exerciseId} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-1">{exercise?.name ?? item.exerciseId}</span>
                      <span className="block text-2xs text-ink-3">{item.dose}</span>
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-ink-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                  </button>
                  {expanded && exercise && (
                    <div className="pb-3 pl-7">
                      <ExerciseDetail exercise={exercise} item={item} sets={setsFor(item)} isDeload={isDeload} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={startSession} className={PRIMARY_BTN}>
            Start økt
          </button>
          <p className="text-center text-2xs text-ink-4">Etter økten registrerer du hvor tung den var og hvordan ryggen kjennes.</p>
          {!showPainCardOnSessionDay && !todayDaily && (
            <button type="button" onClick={() => setShowPainCardOnSessionDay(true)} className={`${GHOST_BTN} self-center`}>
              Ingen økt i dag? Logg bare ryggen
            </button>
          )}
        </section>
      ) : (
        <section className="rounded-xl border border-line bg-surface-2 p-4">
          <p className="text-sm font-semibold text-ink-1">Hviledag</p>
          <p className="mt-0.5 text-sm text-ink-3">Alle tre øktene er gjennomført denne uken. Gå en tur på 20–30 minutter, og logg ryggen under.</p>
        </section>
      )}

      {painCardVisible && (
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4">
          {painCompact ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink-1">Ryggen i dag: {todayDaily!.pain}/10</p>
                <p className="text-2xs text-ink-3">
                  {todayDaily!.radiating ? "Utstråling" : "Ingen utstråling"} · {todayDaily!.walked ? "gikk 20+ min" : "ikke gått ennå"}
                  {todayDaily!.note ? ` · ${todayDaily!.note}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => setEditingPain(true)} className={GHOST_BTN}>
                Endre
              </button>
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm font-semibold text-ink-1">Hvordan er ryggen i dag?</p>
                <p className="text-2xs text-ink-4">Smerte i korsryggen, 0–10. Tar under 20 sekunder.</p>
              </div>
              <PainFields values={painValues} onChange={setPainValues} />
              <button type="button" disabled={painValues.pain === null || saving} onClick={savePainOnly} className={PRIMARY_BTN}>
                {todayDaily ? "Oppdater smertelogg" : "Lagre smertelogg"}
              </button>
              {todayDaily && (
                <button type="button" onClick={() => setEditingPain(false)} className={`${GHOST_BTN} self-start`}>
                  Avbryt
                </button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
