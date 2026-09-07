"use client";

import { useState } from "react";
import type { Exercise, ExerciseCategory } from "@/lib/exercises";
import type { SetIntensity, WorkoutSession } from "@/lib/workouts";
import { localDateString } from "@/lib/payday";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { EntryRow, ExercisePicker } from "./EntryAndExercises";
import {
  calendarMonthDays,
  calendarMonthFromOffset,
  exerciseHistory,
  findLastEntry,
  formatElapsed,
  formatKg,
  formatMonthLabel,
  formatSessionDate,
  formatSessionTime,
  setSummary,
} from "./treningHelpers";

const WEEKDAY_LABELS = ["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"];

// Handlingene som trengs for å redigere sett/øvelser i EN bestemt økt —
// samme form som de aktive-økt-spesifikke handlerne i TreningSection
// (handleAddSet osv.), men parameterisert på en vilkårlig sessionId slik at
// de også kan brukes til å redigere en AVSLUTTET økt i historikken.
export interface SessionEditHandlers {
  onAddEntry: (exercise: Exercise) => void;
  onUpdateEntry: (entryId: string, updates: { minutes: number | null; notes: string | null }) => void;
  onRemoveEntry: (entryId: string) => void;
  onAddSet: (
    entryId: string,
    prefill: { kg?: number; reps?: number; minutes?: number; kmt?: number; distanceKm?: number; intensity?: SetIntensity },
  ) => void;
  onUpdateSet: (
    entryId: string,
    setId: string,
    updates: { kg?: number | null; reps?: number | null; minutes?: number | null; kmt?: number | null; distanceKm?: number | null; intensity?: SetIntensity | null },
  ) => void;
  onToggleSetDone: (entryId: string, setId: string, done: boolean) => void;
  onRemoveSet: (entryId: string, setId: string) => void;
  onToggleEntryDone: (entryId: string, done: boolean) => void;
}

// Full redigering av en tidligere (avsluttet) økt — gjenbruker EntryRow (samme
// rad som den aktive økten bruker) i stedet for kun HistoryRow sitt
// skrivebeskyttede sammendrag, jf. ønske om å kunne rette opp sett/øvelser i
// ettertid, ikke bare mens klokken går.
export function HistorySessionEditor({
  session,
  exercises,
  sessions,
  handlers,
  onCreateAndAdd,
  onSaveExercise,
  onDeleteExercise,
}: {
  session: WorkoutSession;
  exercises: Exercise[];
  sessions: WorkoutSession[];
  handlers: SessionEditHandlers;
  onCreateAndAdd: (name: string, description: string, category: ExerciseCategory, bodyweight: boolean) => Promise<boolean>;
  onSaveExercise: (id: string, updates: { name: string; description?: string; category: ExerciseCategory; bodyweight?: boolean }) => Promise<boolean>;
  onDeleteExercise: (exercise: Exercise) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
      {session.entries.length > 0 && (
        <ul className="flex flex-col gap-2">
          {session.entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              lastEntry={findLastEntry(entry.exerciseId, sessions, session.id)}
              history={exerciseHistory(entry.exerciseId, sessions, session.id)}
              bodyweight={exercises.find((ex) => ex.id === entry.exerciseId)?.bodyweight}
              startExpanded={false}
              onAddSet={(prefill) => handlers.onAddSet(entry.id, prefill)}
              onUpdateSet={(setId, updates) => handlers.onUpdateSet(entry.id, setId, updates)}
              onToggleSetDone={(setId, done) => handlers.onToggleSetDone(entry.id, setId, done)}
              onRemoveSet={(setId) => handlers.onRemoveSet(entry.id, setId)}
              onUpdateEntry={(updates) => handlers.onUpdateEntry(entry.id, updates)}
              onToggleEntryDone={() => handlers.onToggleEntryDone(entry.id, !entry.done)}
              onRemoveEntry={() => handlers.onRemoveEntry(entry.id)}
            />
          ))}
        </ul>
      )}
      {showPicker ? (
        <ExercisePicker
          exercises={exercises}
          onPick={(ex) => {
            handlers.onAddEntry(ex);
            setShowPicker(false);
          }}
          onCreateAndPick={async (name, description, category, bodyweight) => {
            const ok = await onCreateAndAdd(name, description, category, bodyweight);
            if (ok) setShowPicker(false);
            return ok;
          }}
          onSaveExercise={onSaveExercise}
          onDeleteExercise={onDeleteExercise}
          onClose={() => setShowPicker(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm text-ink-3 transition hover:border-line-strong hover:text-ink-1"
        >
          <span className="text-base leading-none">+</span> Legg til øvelse
        </button>
      )}
    </div>
  );
}

export function HistoryRow({
  session,
  expanded,
  editing,
  onToggle,
  onToggleEdit,
  onDelete,
  editor,
}: {
  session: WorkoutSession;
  expanded: boolean;
  editing: boolean;
  onToggle: () => void;
  onToggleEdit: () => void;
  onDelete: () => void;
  editor?: React.ReactNode;
}) {
  const duration = session.endedAt ? new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime() : 0;
  return (
    <li className="rounded-xl border border-line bg-surface-2 px-3 py-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="min-w-0 flex-1 text-left">
          <p className="text-sm font-medium text-ink-1">
            {formatSessionDate(session.startedAt)} · {formatSessionTime(session.startedAt)}
          </p>
          <p className="mt-0.5 text-2xs text-ink-4">
            {formatElapsed(duration)} · {session.entries.length} {session.entries.length === 1 ? "øvelse" : "øvelser"}
          </p>
        </button>
        {expanded && (
          <button
            type="button"
            onClick={onToggleEdit}
            className="shrink-0 text-2xs font-medium text-accent-privat hover:text-accent-privat/80"
          >
            {editing ? "Ferdig" : "Rediger"}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label="Slett økt"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-status-danger"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded &&
        (editing ? (
          editor
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5 border-t border-line pt-2">
            {session.entries.length === 0 ? (
              <p className="text-sm text-ink-3">Ingen øvelser logget.</p>
            ) : (
              session.entries.map((e) => (
                <li key={e.id} className="text-sm text-ink-2">
                  <span className="font-medium text-ink-1">{e.exerciseName}</span>
                  {e.sets.length > 0 && <span className="text-ink-3"> · {setSummary(e)}</span>}
                  {e.minutes ? <span className="text-ink-3"> · {e.minutes} min</span> : null}
                  {e.notes && <p className="text-2xs text-ink-4">{e.notes}</p>}
                </li>
              ))
            )}
          </ul>
        ))}
    </li>
  );
}

// Månedskalender for å bla tilbake i tid og se hvilke dager man har trent —
// prikk under dagtallet på dager med minst én avsluttet økt, trykk en dag
// for å vise økten(e) under rutenettet (gjenbruker HistoryRow, samme
// ekspander/slett-mønster som listevisningen).
export function TrainingCalendar({
  sessionsByDate,
  monthOffset,
  onMonthOffsetChange,
  selectedDate,
  onSelectDate,
}: {
  sessionsByDate: Map<string, WorkoutSession[]>;
  monthOffset: number;
  onMonthOffsetChange: (offset: number) => void;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}) {
  const today = localDateString();
  const { year, month } = calendarMonthFromOffset(monthOffset);
  const days = calendarMonthDays(year, month);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMonthOffsetChange(monthOffset - 1)}
          aria-label="Forrige måned"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-ink-1"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-ink-1">{formatMonthLabel(year, month)}</p>
        <button
          type="button"
          onClick={() => onMonthOffsetChange(monthOffset + 1)}
          aria-label="Neste måned"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-ink-1"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((w) => (
          <p key={w} className="text-center text-2xs font-semibold uppercase text-ink-4">
            {w}
          </p>
        ))}
        {days.map((date) => {
          const inMonth = Number(date.slice(5, 7)) - 1 === month;
          const daySessions = sessionsByDate.get(date) ?? [];
          const hasSessions = daySessions.length > 0;
          const isToday = date === today;
          const isSelected = date === selectedDate;
          return (
            <button
              key={date}
              type="button"
              onClick={() => (hasSessions ? onSelectDate(isSelected ? null : date) : undefined)}
              disabled={!hasSessions}
              aria-pressed={isSelected}
              className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-xs transition ${
                !inMonth
                  ? "text-ink-4/50"
                  : isSelected
                    ? "bg-accent-privat/15 font-semibold text-accent-privat ring-1 ring-accent-privat/40"
                    : isToday
                      ? "font-semibold text-ink-1 ring-1 ring-line-strong"
                      : hasSessions
                        ? "text-ink-1 hover:bg-surface-3"
                        : "text-ink-3"
              }`}
            >
              {Number(date.slice(8, 10))}
              <span
                className={`h-1 w-1 rounded-full ${hasSessions && inMonth ? "bg-status-positive" : "bg-transparent"}`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface SessionSummary {
  durationMs: number;
  exerciseCount: number;
  setCount: number;
  totalVolumeKg: number;
}

// Vises rett etter "Avslutt økt" — samme overlay-mønster som ConfirmDialog i
// app/CardShell.tsx, men ikke-destruktiv (kun én "Lukk"-knapp).
export function SessionSummaryDialog({ summary, onClose }: { summary: SessionSummary; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose} role="presentation">
      <div
        className="w-full max-w-sm rounded-2xl border border-line-strong bg-surface-1 p-4 shadow-xl shadow-black/30"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h3 className="text-sm font-semibold text-ink-1">Økt fullført</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-2xs text-ink-4">Varighet</p>
            <p className="text-lg font-semibold tabular-nums text-ink-1">{formatElapsed(summary.durationMs)}</p>
          </div>
          <div>
            <p className="text-2xs text-ink-4">Øvelser</p>
            <p className="text-lg font-semibold tabular-nums text-ink-1">{summary.exerciseCount}</p>
          </div>
          <div>
            <p className="text-2xs text-ink-4">Sett</p>
            <p className="text-lg font-semibold tabular-nums text-ink-1">{summary.setCount}</p>
          </div>
          <div>
            <p className="text-2xs text-ink-4">Totalt volum</p>
            <p className="text-lg font-semibold tabular-nums text-ink-1">{formatKg(summary.totalVolumeKg)} kg</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-status-positive px-3 py-2 text-sm font-semibold text-surface-0 transition hover:bg-status-positive/85"
        >
          Lukk
        </button>
      </div>
    </div>
  );
}
