"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { RyggProgramMeta, RyggSessionLog, RyggWeekDecision, RyggWeekState } from "@/lib/ryggLog";
import { deloadDoseWeek, deloadSets } from "@/lib/ryggAlgorithm";
import { phaseForWeek, programForWeek } from "@/lib/ryggProgram";
import { getRyggExercise } from "@/lib/ryggExercises";
import { formatDMY } from "@/lib/payday";
import { DECISION_COLOR_CLASS, DECISION_LABEL, phaseLabelForWeek } from "./ryggHelpers";

interface Props {
  meta: RyggProgramMeta;
  weekState: RyggWeekState;
  sessionLogs: RyggSessionLog[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}

const DECISION_OPTIONS: RyggWeekDecision[] = ["progress", "repeat", "deload", "hold"];

export default function WeekTab({ meta, weekState, sessionLogs, onChanged, onError }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideDecision, setOverrideDecision] = useState<RyggWeekDecision>("repeat");
  const [overrideReason, setOverrideReason] = useState("");
  const [saving, setSaving] = useState(false);

  const cycleStartDate = weekState.startedAt.slice(0, 10);
  const cycleSessions = sessionLogs
    .filter((s) => s.week === weekState.week && s.date >= cycleStartDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const isDeload = weekState.decision === "deload";
  const doseWeek = isDeload ? deloadDoseWeek(weekState.week, meta.highestCompletedWeek) : weekState.week;
  const itemsA = programForWeek(doseWeek, phaseForWeek(weekState.week) === 3 ? "A" : undefined);
  const itemsB = phaseForWeek(weekState.week) === 3 ? programForWeek(doseWeek, "B") : null;

  async function handleOverride() {
    if (!overrideReason.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/rygg/weeks/${weekState.week}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "override", decision: overrideDecision, reason: overrideReason.trim() }),
      });
      if (!res.ok) throw new Error("override failed");
      setShowOverride(false);
      setOverrideReason("");
      await onChanged();
    } catch {
      onError("Kunne ikke lagre overstyringen. Prøv igjen.");
    } finally {
      setSaving(false);
    }
  }

  function renderItems(items: typeof itemsA, label?: string) {
    return (
      <div className="flex flex-col gap-1.5">
        {label && <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Variant {label}</p>}
        {items.map((item) => {
          const exercise = getRyggExercise(item.exerciseId);
          const sets = isDeload ? deloadSets(item.sets) : item.sets;
          const rowId = `${label ?? "x"}-${item.exerciseId}`;
          const expanded = expandedId === rowId;
          return (
            <div key={rowId} className="rounded-lg border border-line bg-surface-2 px-2.5 py-2">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : rowId)}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-1">{exercise?.name ?? item.exerciseId}</p>
                  <p className="text-2xs text-ink-3">
                    {item.dose}
                    {isDeload && sets !== item.sets ? ` (${sets} serier — redusert)` : ""}
                  </p>
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 text-ink-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
              {expanded && exercise && (
                <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2 text-2xs text-ink-3">
                  <p>
                    <span className="font-semibold text-ink-2">Slik gjør du det: </span>
                    {exercise.how}
                  </p>
                  <p>
                    <span className="font-semibold text-ink-2">Viktigst: </span>
                    {exercise.cue}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-line bg-surface-2 p-3">
        <p className="text-sm font-semibold text-ink-1">
          Uke {weekState.week} · {phaseLabelForWeek(weekState.week)}
          {weekState.repeatCount > 0 ? ` · gjentatt ${weekState.repeatCount}×` : ""}
        </p>
        {weekState.decision && weekState.decisionReason && (
          <p className={`mt-1 text-2xs ${DECISION_COLOR_CLASS[weekState.decision]}`}>
            {DECISION_LABEL[weekState.decision]}: {weekState.decisionReason}
            {weekState.manualOverride ? " (overstyrt manuelt)" : ""}
          </p>
        )}
        {!showOverride ? (
          <button
            type="button"
            onClick={() => setShowOverride(true)}
            className="mt-2 text-2xs font-medium text-ink-4 underline hover:text-ink-2"
          >
            Overstyr beslutningen
          </button>
        ) : (
          <div className="mt-2 flex flex-col gap-2 rounded-lg border border-line bg-surface-1 p-2.5">
            <div className="flex flex-wrap gap-1">
              {DECISION_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setOverrideDecision(d)}
                  aria-pressed={overrideDecision === d}
                  className={`rounded-md px-2 py-1 text-2xs font-semibold uppercase transition ${
                    overrideDecision === d ? "bg-emerald-400/15 text-emerald-400" : "bg-surface-2 text-ink-3 hover:text-ink-1"
                  }`}
                >
                  {DECISION_LABEL[d]}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Begrunnelse"
              className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-sm text-ink-1 placeholder:text-ink-4"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!overrideReason.trim() || saving}
                onClick={handleOverride}
                className="rounded-lg bg-emerald-400/15 px-3 py-1.5 text-2xs font-semibold uppercase text-emerald-400 transition hover:bg-emerald-400/25 disabled:opacity-50"
              >
                Lagre
              </button>
              <button
                type="button"
                onClick={() => setShowOverride(false)}
                className="rounded-lg px-3 py-1.5 text-2xs font-medium text-ink-4 hover:text-ink-2"
              >
                Avbryt
              </button>
            </div>
          </div>
        )}
      </div>

      {itemsB ? (
        <div className="flex flex-col gap-2.5">
          {renderItems(itemsA, "A")}
          {renderItems(itemsB, "B")}
        </div>
      ) : (
        renderItems(itemsA)
      )}

      <div className="flex flex-col gap-1.5">
        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Loggede økter denne syklusen</p>
        {cycleSessions.length === 0 ? (
          <p className="text-sm text-ink-4">Ingen økter logget ennå.</p>
        ) : (
          cycleSessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-sm">
              <span className="text-ink-1">
                {formatDMY(s.date)}
                {s.variant ? ` · variant ${s.variant}` : ""}
              </span>
              <span className="text-ink-3">
                RPE {s.rpe}
                {s.aggravated ? " · etterreaksjon" : ""}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
