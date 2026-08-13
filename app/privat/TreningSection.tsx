"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_SHELL, CardHeader, ConfirmDialog, SkeletonRows, useConfirmDelete, usePersistedCollapse } from "../CardShell";
import type { Exercise } from "@/lib/exercises";
import type { SetLog, WorkoutEntry, WorkoutSession } from "@/lib/workouts";
import type { Routine } from "@/lib/routines";
import { Dumbbell, GripVertical, Pencil } from "lucide-react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const VISIBLE_HISTORY = 5;

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Tikkende klokke for den pågående økten — teller opp fra startedAt til økten avsluttes.
function useElapsed(startedAt: string | undefined): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }
    const start = new Date(startedAt).getTime();
    setElapsed(Date.now() - start);
    const id = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatKg(kg: number): string {
  return Number.isInteger(kg) ? `${kg}` : kg.toFixed(1).replace(/\.0$/, "");
}

// Runder til nærmeste 0,5 kg (vanligste plate-inkrement) for å unngå
// flyttall-artefakter når +/- stepperne justerer vekten.
function roundKg(kg: number): number {
  return Math.round(kg * 2) / 2;
}

function setSummary(entry: WorkoutEntry): string {
  return entry.sets
    .map((s) => {
      if (s.kg != null && s.reps != null) return `${formatKg(s.kg)}kg×${s.reps}`;
      if (s.kg != null) return `${formatKg(s.kg)}kg`;
      if (s.reps != null) return `${s.reps} reps`;
      return null;
    })
    .filter(Boolean)
    .join(", ");
}

// Finner siste avsluttede økt som inneholder samme øvelse — "sessions" er
// allerede sortert nyest-først (server-side i lib/workouts.ts), så første
// treff er det vi vil vise som "Sist: ...".
function findLastEntry(exerciseId: string, sessions: WorkoutSession[], excludeSessionId?: string): WorkoutEntry | null {
  for (const s of sessions) {
    if (s.id === excludeSessionId || !s.endedAt) continue;
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    if (entry) return entry;
  }
  return null;
}

interface ExerciseHistoryPoint {
  date: string;
  maxKg: number;
}

// Høyeste vekt logget per avsluttet økt for en øvelse, kronologisk (eldst
// først) — "sessions" er nyest-først server-side, så vi snur rekkefølgen.
function exerciseHistory(exerciseId: string, sessions: WorkoutSession[], excludeSessionId?: string): ExerciseHistoryPoint[] {
  const points: ExerciseHistoryPoint[] = [];
  for (const s of sessions) {
    if (s.id === excludeSessionId || !s.endedAt) continue;
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry || entry.sets.length === 0) continue;
    const kgValues = entry.sets.map((set) => set.kg).filter((kg): kg is number => kg != null);
    if (kgValues.length === 0) continue;
    points.push({ date: s.startedAt, maxKg: Math.max(...kgValues) });
  }
  return points.reverse();
}

// Enkel innebygd SVG-linjegraf — ingen chart-bibliotek i prosjektet, og en
// håndfull punkter (typisk et titalls økter) trenger ikke noe tyngre enn dette.
function ProgressChart({ points }: { points: ExerciseHistoryPoint[] }) {
  if (points.length < 2) {
    return <p className="text-2xs text-ink-4">Ikke nok data ennå for graf.</p>;
  }

  const width = 260;
  const height = 60;
  const pad = 6;
  const kgValues = points.map((p) => p.maxKg);
  const min = Math.min(...kgValues);
  const max = Math.max(...kgValues);
  const range = max - min || 1;
  const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = height - pad - ((p.maxKg - min) / range) * (height - pad * 2);
    return { x, y };
  });

  return (
    <div className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full text-status-positive">
        <polyline
          points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="2.5" fill="currentColor" />
        ))}
      </svg>
      <p className="text-2xs text-ink-4">
        {formatKg(min)}–{formatKg(max)} kg siste {points.length} {points.length === 1 ? "økt" : "økter"}
      </p>
    </div>
  );
}

// Kg/reps lagres lokalt til feltet mister fokus (samme mønster som andre
// inline-redigerbare felt i appen) — unngår at hver tastetrykk sender en
// egen nettverksforespørsel.
// Liten +/- knapp brukt av kg/reps-stepperne under.
function StepperButton({ symbol, label, onClick }: { symbol: "+" | "−"; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-sm text-ink-2 transition hover:border-line-strong hover:text-ink-1 active:scale-95"
    >
      {symbol}
    </button>
  );
}

function SetRow({
  set,
  index,
  onUpdate,
  onRemove,
}: {
  set: SetLog;
  index: number;
  onUpdate: (updates: { kg: number | null; reps: number | null }) => void;
  onRemove: () => void;
}) {
  const [kg, setKg] = useState(set.kg?.toString() ?? "");
  const [reps, setReps] = useState(set.reps?.toString() ?? "");

  function commit(nextKg: string, nextReps: string) {
    onUpdate({
      kg: nextKg.trim() ? Number(nextKg) : null,
      reps: nextReps.trim() ? Number(nextReps) : null,
    });
  }

  // Knappe-trykk er en diskret handling og committer umiddelbart — i
  // motsetning til fritekst-inntasting i feltene, som fortsatt committer på
  // blur (unngår ett nettverkskall per tastetrykk der).
  function adjustKg(delta: number) {
    const current = kg.trim() ? Number(kg) : 0;
    const next = roundKg(Math.max(0, current + delta));
    const nextStr = formatKg(next);
    setKg(nextStr);
    commit(nextStr, reps);
  }

  function adjustReps(delta: number) {
    const current = reps.trim() ? Number(reps) : 0;
    const next = Math.max(0, current + delta);
    const nextStr = String(next);
    setReps(nextStr);
    commit(kg, nextStr);
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-1 p-2">
      <div className="flex items-center justify-between">
        <span className="text-2xs text-ink-4">Sett {index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Slett sett"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-base leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
        >
          ×
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1">
          <StepperButton symbol="−" label="Reduser vekt" onClick={() => adjustKg(-2.5)} />
          <input
            type="number"
            step="0.5"
            inputMode="decimal"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            onBlur={() => commit(kg, reps)}
            placeholder="Kg"
            className="w-full min-w-0 rounded-lg border border-line bg-surface-2 px-1 py-1.5 text-center text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
          />
          <StepperButton symbol="+" label="Øk vekt" onClick={() => adjustKg(2.5)} />
        </div>
        <div className="flex items-center gap-1">
          <StepperButton symbol="−" label="Reduser reps" onClick={() => adjustReps(-1)} />
          <input
            type="number"
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            onBlur={() => commit(kg, reps)}
            placeholder="Reps"
            className="w-full min-w-0 rounded-lg border border-line bg-surface-2 px-1 py-1.5 text-center text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
          />
          <StepperButton symbol="+" label="Øk reps" onClick={() => adjustReps(1)} />
        </div>
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  lastEntry,
  history,
  onAddSet,
  onUpdateSet,
  onRemoveSet,
  onUpdateEntry,
  onRemoveEntry,
}: {
  entry: WorkoutEntry;
  lastEntry: WorkoutEntry | null;
  history: ExerciseHistoryPoint[];
  onAddSet: (prefill: { kg?: number; reps?: number }) => void;
  onUpdateSet: (setId: string, updates: { kg: number | null; reps: number | null }) => void;
  onRemoveSet: (setId: string) => void;
  onUpdateEntry: (updates: { minutes: number | null; notes: string | null }) => void;
  onRemoveEntry: () => void;
}) {
  const [minutes, setMinutes] = useState(entry.minutes?.toString() ?? "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [showGraph, setShowGraph] = useState(false);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  function commitEntry() {
    onUpdateEntry({
      minutes: minutes.trim() ? Number(minutes) : null,
      notes: notes.trim() || null,
    });
  }

  // Foreslår vekt/reps for et nytt sett fra forrige sett i samme øvelse denne
  // økten, ellers fra "sist"-referansen — matcher hvordan Strong/Hevy foreslår
  // neste vekt i stedet for å starte tomt hver gang.
  function handleAddSetClick() {
    const prevSet = entry.sets[entry.sets.length - 1] ?? lastEntry?.sets[0];
    onAddSet({ kg: prevSet?.kg, reps: prevSet?.reps });
  }

  return (
    <li ref={setNodeRef} style={style} className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label="Endre rekkefølge"
            className="grid shrink-0 cursor-grab place-items-center text-ink-4 transition hover:text-ink-2 active:cursor-grabbing"
            style={{ touchAction: "none" }}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink-1">{entry.exerciseName}</p>
        </div>
        <button
          type="button"
          onClick={onRemoveEntry}
          aria-label="Fjern øvelse fra økten"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
        >
          ×
        </button>
      </div>
      {lastEntry && lastEntry.sets.length > 0 && (
        <p className="text-2xs text-ink-4">Sist: {setSummary(lastEntry)}</p>
      )}
      {history.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setShowGraph((v) => !v)}
            className="self-start text-2xs font-medium text-accent-privat hover:text-accent-privat/80"
          >
            {showGraph ? "Skjul graf" : "Vis graf"}
          </button>
          {showGraph && <ProgressChart points={history} />}
        </div>
      )}
      {entry.sets.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {entry.sets.map((s, i) => (
            <SetRow
              key={s.id}
              set={s}
              index={i}
              onUpdate={(updates) => onUpdateSet(s.id, updates)}
              onRemove={() => onRemoveSet(s.id)}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={handleAddSetClick}
        className="self-start text-xs font-medium text-accent-privat hover:text-accent-privat/80"
      >
        + Nytt sett
      </button>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          onBlur={commitEntry}
          placeholder="Minutter (cardio)"
          className="w-full rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={commitEntry}
          placeholder="Notat (valgfritt)"
          className="w-full rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
        />
      </div>
    </li>
  );
}

function ExerciseEditForm({
  exercise,
  onCancel,
  onSave,
}: {
  exercise: Exercise;
  onCancel: () => void;
  onSave: (updates: { name: string; description?: string }) => void;
}) {
  const [name, setName] = useState(exercise.name);
  const [description, setDescription] = useState(exercise.description ?? "");

  function save() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), description: description.trim() || undefined });
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line-strong bg-surface-1 p-2.5">
      <input
        type="text"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-1 outline-none focus:border-line-strong"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Beskrivelse (valgfritt)"
        rows={2}
        className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!name.trim()}
          className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </li>
  );
}

function ExercisePicker({
  exercises,
  onPick,
  onCreateAndPick,
  onSaveExercise,
  onDeleteExercise,
  onClose,
}: {
  exercises: Exercise[];
  onPick: (exercise: Exercise) => void;
  onCreateAndPick: (name: string, description: string) => void;
  onSaveExercise: (id: string, updates: { name: string; description?: string }) => void;
  onDeleteExercise: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = exercises.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Søk øvelse..."
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <button type="button" onClick={onClose} className="shrink-0 text-xs font-medium text-ink-4 hover:text-ink-2">
          Lukk
        </button>
      </div>
      {filtered.length > 0 && (
        <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          {filtered.map((ex) =>
            editingId === ex.id ? (
              <ExerciseEditForm
                key={ex.id}
                exercise={ex}
                onCancel={() => setEditingId(null)}
                onSave={(updates) => {
                  onSaveExercise(ex.id, updates);
                  setEditingId(null);
                }}
              />
            ) : (
              <li key={ex.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-2.5 py-2">
                <button type="button" onClick={() => onPick(ex)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm text-ink-1">{ex.name}</p>
                  {ex.description && <p className="truncate text-2xs text-ink-4">{ex.description}</p>}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(ex.id)}
                  aria-label="Rediger øvelse"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-ink-1"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteExercise(ex)}
                  aria-label="Slett øvelse"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
                >
                  ×
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      {filtered.length === 0 && !showNewForm && <p className="text-sm text-ink-3">Ingen treff.</p>}
      {showNewForm ? (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-1 p-2.5">
          <input
            type="text"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Navn på øvelse"
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
          />
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Beskrivelse (valgfritt)"
            rows={2}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
          />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowNewForm(false)} className="text-xs font-medium text-ink-4 hover:text-ink-2">
              Avbryt
            </button>
            <button
              type="button"
              onClick={() => {
                onCreateAndPick(newName.trim(), newDescription.trim());
                setNewName("");
                setNewDescription("");
                setShowNewForm(false);
              }}
              disabled={!newName.trim()}
              className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
            >
              Legg til
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm text-ink-3 transition hover:border-line-strong hover:text-ink-1"
        >
          <span className="text-base leading-none">+</span> Ny øvelse
        </button>
      )}
    </div>
  );
}

function RoutineRow({
  routine,
  editing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onStart,
  onDelete,
}: {
  routine: Routine;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (name: string) => void;
  onStart: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(routine.name);

  if (editing) {
    return (
      <li className="flex flex-col gap-2 rounded-lg border border-line-strong bg-surface-1 p-2.5">
        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancelEdit();
          }}
          className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-1 outline-none focus:border-line-strong"
        />
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancelEdit} className="text-xs font-medium text-ink-4 hover:text-ink-2">
            Avbryt
          </button>
          <button
            type="button"
            onClick={() => name.trim() && onSave(name.trim())}
            disabled={!name.trim()}
            className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
          >
            Lagre
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink-1">{routine.name}</p>
        <p className="truncate text-2xs text-ink-4">{routine.exercises.map((e) => e.exerciseName).join(", ")}</p>
      </div>
      <button
        type="button"
        onClick={onStart}
        className="shrink-0 rounded-lg bg-status-positive px-2.5 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-status-positive/85"
      >
        Start
      </button>
      <button
        type="button"
        onClick={onStartEdit}
        aria-label="Omdøp rutine"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-ink-1"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Slett rutine"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
      >
        ×
      </button>
    </li>
  );
}

function HistoryRow({
  session,
  expanded,
  onToggle,
  onDelete,
}: {
  session: WorkoutSession;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const duration = session.endedAt ? new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime() : 0;
  return (
    <li className="rounded-xl border border-line bg-surface-2 px-3 py-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <p className="text-sm text-ink-1">{formatSessionDate(session.startedAt)}</p>
          <p className="mt-0.5 text-2xs text-ink-4">
            {formatElapsed(duration)} · {session.entries.length} {session.entries.length === 1 ? "øvelse" : "øvelser"}
          </p>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Slett økt"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
        >
          ×
        </button>
      </div>
      {expanded && (
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
      )}
    </li>
  );
}

interface SessionSummary {
  durationMs: number;
  exerciseCount: number;
  setCount: number;
  totalVolumeKg: number;
}

// Vises rett etter "Avslutt økt" — samme overlay-mønster som ConfirmDialog i
// app/CardShell.tsx, men ikke-destruktiv (kun én "Lukk"-knapp).
function SessionSummaryDialog({ summary, onClose }: { summary: SessionSummary; onClose: () => void }) {
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

// Legger til øvelsene fra en rutine i rekkefølge (sekvensielt, ikke parallelt
// — read-modify-write mot samme økt i Redis ville racet ved parallelle kall).
// Egen frittstående funksjon (ikke inne i komponenten) slik at den kan bruke
// en vanlig `let`-akkumulator uten å trigge React Compiler sin immutability-regel.
async function seedRoutineEntries(sessionId: string, exercises: Routine["exercises"]): Promise<WorkoutSession | null> {
  let session: WorkoutSession | null = null;
  for (const ex of exercises) {
    const res = await fetch(`/api/workouts/${sessionId}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId: ex.exerciseId, exerciseName: ex.exerciseName }),
    });
    if (res.ok) session = await res.json();
  }
  return session;
}

export default function TreningSection() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Trening", true);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [showSaveRoutineForm, setShowSaveRoutineForm] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState("");
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const confirmDeleteSession = useConfirmDelete<WorkoutSession>();
  const confirmDeleteExercise = useConfirmDelete<Exercise>();
  const confirmDeleteRoutine = useConfirmDelete<Routine>();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const load = useCallback(() => {
    fetch("/api/workouts")
      .then((r) => r.json())
      .then((d) => setSessions((d.sessions ?? []) as WorkoutSession[]))
      .finally(() => setLoading(false));
  }, []);

  const loadExercises = useCallback(() => {
    fetch("/api/exercises")
      .then((r) => r.json())
      .then((d) => setExercises((d.exercises ?? []) as Exercise[]))
      .catch(() => {});
  }, []);

  const loadRoutines = useCallback(() => {
    fetch("/api/routines")
      .then((r) => r.json())
      .then((d) => setRoutines((d.routines ?? []) as Routine[]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    loadExercises();
    loadRoutines();
    window.addEventListener("mitt-dashboard:privat-refresh", load);
    window.addEventListener("mitt-dashboard:privat-refresh", loadExercises);
    window.addEventListener("mitt-dashboard:privat-refresh", loadRoutines);
    return () => {
      window.removeEventListener("mitt-dashboard:privat-refresh", load);
      window.removeEventListener("mitt-dashboard:privat-refresh", loadExercises);
      window.removeEventListener("mitt-dashboard:privat-refresh", loadRoutines);
    };
  }, [load, loadExercises, loadRoutines]);

  const activeSession = sessions.find((s) => !s.endedAt) ?? null;
  const pastSessions = sessions.filter((s) => s.endedAt);
  const visibleHistory = showAllHistory ? pastSessions : pastSessions.slice(0, VISIBLE_HISTORY);
  const elapsed = useElapsed(activeSession?.startedAt);

  async function handleStartSession() {
    if (collapsed) toggleCollapsed();
    const res = await fetch("/api/workouts", { method: "POST" });
    if (res.ok) {
      const session: WorkoutSession = await res.json();
      setSessions((prev) => {
        const exists = prev.some((s) => s.id === session.id);
        return exists ? prev.map((s) => (s.id === session.id ? session : s)) : [session, ...prev];
      });
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  async function handleStartFromRoutine(routine: Routine) {
    if (collapsed) toggleCollapsed();
    const res = await fetch("/api/workouts", { method: "POST" });
    if (!res.ok) return;
    const started: WorkoutSession = await res.json();
    setSessions((prev) => {
      const exists = prev.some((s) => s.id === started.id);
      return exists ? prev.map((s) => (s.id === started.id ? started : s)) : [started, ...prev];
    });
    const seeded = await seedRoutineEntries(started.id, routine.exercises);
    if (seeded) {
      setSessions((prev) => prev.map((s) => (s.id === seeded.id ? seeded : s)));
    }
    window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
  }

  async function handleEndSession() {
    if (!activeSession) return;
    const res = await fetch(`/api/workouts/${activeSession.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const updated: WorkoutSession = await res.json();
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setShowPicker(false);
      setShowSaveRoutineForm(false);
      const sets = updated.entries.flatMap((e) => e.sets);
      const totalVolumeKg = sets.reduce((sum, s) => (s.kg != null && s.reps != null ? sum + s.kg * s.reps : sum), 0);
      setSessionSummary({
        durationMs: new Date(updated.endedAt!).getTime() - new Date(updated.startedAt).getTime(),
        exerciseCount: updated.entries.length,
        setCount: sets.length,
        totalVolumeKg,
      });
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  async function handleReorderEntries(event: DragEndEvent) {
    if (!activeSession) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = activeSession.entries.map((e) => e.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(ids, oldIndex, newIndex);
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? { ...s, entries: reordered.map((id) => s.entries.find((e) => e.id === id)!) }
          : s,
      ),
    );
    const res = await fetch(`/api/workouts/${activeSession.id}/entries/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: reordered }),
    });
    if (res.ok) {
      const updated: WorkoutSession = await res.json();
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    }
  }

  async function handleAddEntry(exercise: Exercise) {
    if (!activeSession) return;
    const res = await fetch(`/api/workouts/${activeSession.id}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId: exercise.id, exerciseName: exercise.name }),
    });
    if (res.ok) {
      const updated: WorkoutSession = await res.json();
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    }
  }

  async function handleCreateExerciseAndAdd(name: string, description: string) {
    if (!name.trim()) return;
    const res = await fetch("/api/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || undefined }),
    });
    if (res.ok) {
      const created: Exercise = await res.json();
      setExercises((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "nb")));
      await handleAddEntry(created);
    }
  }

  async function handleUpdateEntry(entryId: string, updates: { minutes: number | null; notes: string | null }) {
    if (!activeSession) return;
    const res = await fetch(`/api/workouts/${activeSession.id}/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated: WorkoutSession = await res.json();
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    }
  }

  async function handleRemoveEntry(entryId: string) {
    if (!activeSession) return;
    const res = await fetch(`/api/workouts/${activeSession.id}/entries/${entryId}`, { method: "DELETE" });
    if (res.ok) {
      const updated: WorkoutSession = await res.json();
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    }
  }

  async function handleAddSet(entryId: string, prefill: { kg?: number; reps?: number }) {
    if (!activeSession) return;
    const res = await fetch(`/api/workouts/${activeSession.id}/entries/${entryId}/sets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefill),
    });
    if (res.ok) {
      const updated: WorkoutSession = await res.json();
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    }
  }

  async function handleUpdateSet(entryId: string, setId: string, updates: { kg: number | null; reps: number | null }) {
    if (!activeSession) return;
    const res = await fetch(`/api/workouts/${activeSession.id}/entries/${entryId}/sets/${setId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated: WorkoutSession = await res.json();
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    }
  }

  async function handleRemoveSet(entryId: string, setId: string) {
    if (!activeSession) return;
    const res = await fetch(`/api/workouts/${activeSession.id}/entries/${entryId}/sets/${setId}`, { method: "DELETE" });
    if (res.ok) {
      const updated: WorkoutSession = await res.json();
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    }
  }

  async function handleDeleteSession(session: WorkoutSession) {
    setSessions((prev) => prev.filter((s) => s.id !== session.id));
    await fetch(`/api/workouts/${session.id}`, { method: "DELETE" });
  }

  async function handleSaveExercise(id: string, updates: { name: string; description?: string }) {
    const res = await fetch(`/api/exercises/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated: Exercise = await res.json();
      setExercises((prev) => prev.map((e) => (e.id === id ? updated : e)).sort((a, b) => a.name.localeCompare(b.name, "nb")));
    }
  }

  async function handleDeleteExercise(exercise: Exercise) {
    setExercises((prev) => prev.filter((e) => e.id !== exercise.id));
    await fetch(`/api/exercises/${exercise.id}`, { method: "DELETE" });
  }

  async function handleSaveRoutine(name: string) {
    if (!activeSession || !name.trim()) return;
    const seen = new Set<string>();
    const routineExercises = activeSession.entries
      .filter((e) => {
        if (seen.has(e.exerciseId)) return false;
        seen.add(e.exerciseId);
        return true;
      })
      .map((e) => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName }));
    if (routineExercises.length === 0) return;

    const res = await fetch("/api/routines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), exercises: routineExercises }),
    });
    if (res.ok) {
      const created: Routine = await res.json();
      setRoutines((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "nb")));
      setShowSaveRoutineForm(false);
      setNewRoutineName("");
    }
  }

  async function handleRenameRoutine(id: string, name: string) {
    const res = await fetch(`/api/routines/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const updated: Routine = await res.json();
      setRoutines((prev) => prev.map((r) => (r.id === id ? updated : r)).sort((a, b) => a.name.localeCompare(b.name, "nb")));
      setEditingRoutineId(null);
    }
  }

  async function handleDeleteRoutine(routine: Routine) {
    setRoutines((prev) => prev.filter((r) => r.id !== routine.id));
    await fetch(`/api/routines/${routine.id}`, { method: "DELETE" });
  }

  return (
    <div className={`${CARD_SHELL} !border-2 !border-status-positive p-4`}>
      <CardHeader
        title="Trening"
        subtitle={activeSession ? formatElapsed(elapsed) : pastSessions.length > 0 ? `${pastSessions.length} økter` : "Ingen økter"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={Dumbbell}
        iconColorClass="text-status-positive"
        alwaysShowSubtitle={!!activeSession}
      />
      {!collapsed && (
        <div className="flex flex-col gap-2">
          {loading ? (
            <SkeletonRows count={2} />
          ) : (
            <>
              {activeSession ? (
                <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg font-semibold tabular-nums text-ink-1">{formatElapsed(elapsed)}</span>
                    <div className="flex items-center gap-3">
                      {activeSession.entries.length > 0 && !showSaveRoutineForm && (
                        <button
                          type="button"
                          onClick={() => setShowSaveRoutineForm(true)}
                          className="text-2xs font-medium text-accent-privat hover:text-accent-privat/80"
                        >
                          Lagre som rutine
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleEndSession}
                        className="rounded-lg bg-status-danger px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-status-danger/85"
                      >
                        Avslutt økt
                      </button>
                    </div>
                  </div>
                  {showSaveRoutineForm && (
                    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-1 p-2">
                      <input
                        type="text"
                        autoFocus
                        value={newRoutineName}
                        onChange={(e) => setNewRoutineName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveRoutine(newRoutineName);
                          if (e.key === "Escape") setShowSaveRoutineForm(false);
                        }}
                        placeholder="Navn på rutine"
                        className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSaveRoutineForm(false)}
                        className="shrink-0 text-xs font-medium text-ink-4 hover:text-ink-2"
                      >
                        Avbryt
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveRoutine(newRoutineName)}
                        disabled={!newRoutineName.trim()}
                        className="shrink-0 rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
                      >
                        Lagre
                      </button>
                    </div>
                  )}
                  {activeSession.entries.length > 0 && (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorderEntries}>
                      <SortableContext items={activeSession.entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                        <ul className="flex flex-col gap-2">
                          {activeSession.entries.map((entry) => (
                            <EntryRow
                              key={entry.id}
                              entry={entry}
                              lastEntry={findLastEntry(entry.exerciseId, sessions, activeSession.id)}
                              history={exerciseHistory(entry.exerciseId, sessions, activeSession.id)}
                              onAddSet={(prefill) => handleAddSet(entry.id, prefill)}
                              onUpdateSet={(setId, updates) => handleUpdateSet(entry.id, setId, updates)}
                              onRemoveSet={(setId) => handleRemoveSet(entry.id, setId)}
                              onUpdateEntry={(updates) => handleUpdateEntry(entry.id, updates)}
                              onRemoveEntry={() => handleRemoveEntry(entry.id)}
                            />
                          ))}
                        </ul>
                      </SortableContext>
                    </DndContext>
                  )}
                  {showPicker ? (
                    <ExercisePicker
                      exercises={exercises}
                      onPick={(ex) => handleAddEntry(ex)}
                      onCreateAndPick={handleCreateExerciseAndAdd}
                      onSaveExercise={handleSaveExercise}
                      onDeleteExercise={(ex) => confirmDeleteExercise.request(ex)}
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
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleStartSession}
                    className="rounded-xl bg-status-positive px-3 py-3 text-center text-sm font-semibold text-surface-0 transition hover:bg-status-positive/85"
                  >
                    Start treningsøkt
                  </button>
                  {routines.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Rutiner</p>
                      <ul className="flex flex-col gap-1.5">
                        {routines.map((r) => (
                          <RoutineRow
                            key={r.id}
                            routine={r}
                            editing={editingRoutineId === r.id}
                            onStartEdit={() => setEditingRoutineId(r.id)}
                            onCancelEdit={() => setEditingRoutineId(null)}
                            onSave={(name) => handleRenameRoutine(r.id, name)}
                            onStart={() => handleStartFromRoutine(r)}
                            onDelete={() => confirmDeleteRoutine.request(r)}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {pastSessions.length > 0 && (
                <div className="mt-1 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Historikk</p>
                    <a
                      href="/api/workouts/export"
                      download
                      className="text-2xs font-medium text-accent-privat hover:text-accent-privat/80"
                    >
                      Eksporter
                    </a>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {visibleHistory.map((s) => (
                      <HistoryRow
                        key={s.id}
                        session={s}
                        expanded={expandedHistoryId === s.id}
                        onToggle={() => setExpandedHistoryId((v) => (v === s.id ? null : s.id))}
                        onDelete={() => confirmDeleteSession.request(s)}
                      />
                    ))}
                  </ul>
                  {pastSessions.length > VISIBLE_HISTORY && (
                    <button
                      type="button"
                      onClick={() => setShowAllHistory((v) => !v)}
                      className="self-start text-xs font-medium text-accent-privat hover:text-accent-privat/80"
                    >
                      {showAllHistory ? "Vis mindre" : `Mer (${pastSessions.length - VISIBLE_HISTORY})`}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmDeleteSession.isOpen}
        message={
          confirmDeleteSession.pending
            ? `Slette treningsøkten fra ${formatSessionDate(confirmDeleteSession.pending.startedAt)}?`
            : ""
        }
        onCancel={confirmDeleteSession.cancel}
        onConfirm={() => {
          if (confirmDeleteSession.pending) handleDeleteSession(confirmDeleteSession.pending);
          confirmDeleteSession.cancel();
        }}
      />
      <ConfirmDialog
        open={confirmDeleteExercise.isOpen}
        message={confirmDeleteExercise.pending ? `Slette øvelsen «${confirmDeleteExercise.pending.name}»?` : ""}
        onCancel={confirmDeleteExercise.cancel}
        onConfirm={() => {
          if (confirmDeleteExercise.pending) handleDeleteExercise(confirmDeleteExercise.pending);
          confirmDeleteExercise.cancel();
        }}
      />
      <ConfirmDialog
        open={confirmDeleteRoutine.isOpen}
        message={confirmDeleteRoutine.pending ? `Slette rutinen «${confirmDeleteRoutine.pending.name}»?` : ""}
        onCancel={confirmDeleteRoutine.cancel}
        onConfirm={() => {
          if (confirmDeleteRoutine.pending) handleDeleteRoutine(confirmDeleteRoutine.pending);
          confirmDeleteRoutine.cancel();
        }}
      />
      {sessionSummary && <SessionSummaryDialog summary={sessionSummary} onClose={() => setSessionSummary(null)} />}
    </div>
  );
}
