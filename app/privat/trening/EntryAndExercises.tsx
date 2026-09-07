"use client";

import { useState } from "react";
import type { Exercise, ExerciseCategory } from "@/lib/exercises";
import type { SetIntensity, WorkoutEntry } from "@/lib/workouts";
import type { Routine } from "@/lib/routines";
import { vibrate } from "@/lib/haptics";
import { Activity, Dumbbell, GripVertical, Pencil, X } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DoneToggle, ProgressChart, CardioSetRow, StrengthSetRow } from "./SetRows";
import { formatSetLog, type ExerciseHistoryPoint } from "./treningHelpers";

const CATEGORY_LABEL: Record<ExerciseCategory, string> = { styrke: "Styrke", cardio: "Cardio" };
const CATEGORY_ICON: Record<ExerciseCategory, typeof Dumbbell> = { styrke: Dumbbell, cardio: Activity };
// Styrke er bevisst nøytral (ikke emerald) — Trenings egen fane-farge OG
// "fullført"-tilstanden (status-positive) er begge grønne, så et grønt
// styrke-ikon druknet i de to andre grønnfargene og gjorde det umulig å se
// hvorfor en rad var grønn (kategori, eller ferdig?) i praksis. Selve
// ikon-formen (Dumbbell vs. Activity) bærer taksonomien, ikke fargen.
const CATEGORY_ACCENT: Record<ExerciseCategory, string> = { styrke: "text-ink-3", cardio: "text-sky-400" };

export function EntryRow({
  entry,
  lastEntry,
  history,
  bodyweight = false,
  startExpanded = false,
  onAddSet,
  onUpdateSet,
  onToggleSetDone,
  onRemoveSet,
  onUpdateEntry,
  onToggleEntryDone,
  onRemoveEntry,
}: {
  entry: WorkoutEntry;
  lastEntry: WorkoutEntry | null;
  history: ExerciseHistoryPoint[];
  bodyweight?: boolean;
  startExpanded?: boolean;
  onAddSet: (prefill: { kg?: number; reps?: number; minutes?: number; kmt?: number; distanceKm?: number; intensity?: SetIntensity }) => void;
  onUpdateSet: (
    setId: string,
    updates: {
      kg?: number | null;
      reps?: number | null;
      minutes?: number | null;
      kmt?: number | null;
      distanceKm?: number | null;
      intensity?: SetIntensity | null;
    },
  ) => void;
  onToggleSetDone: (setId: string, done: boolean) => void;
  onRemoveSet: (setId: string) => void;
  onUpdateEntry: (updates: { minutes: number | null; notes: string | null }) => void;
  onToggleEntryDone: () => void;
  onRemoveEntry: () => void;
}) {
  const [minutes, setMinutes] = useState(entry.minutes?.toString() ?? "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [showGraph, setShowGraph] = useState(false);
  const [showMore, setShowMore] = useState(!!entry.minutes || !!entry.notes);
  // Lukket (sammenslått) rad viser KUN øvelsesnavnet — man drilles ned igjen
  // ved å trykke raden. Starter kollapset (i motsetning til før) slik at en
  // økt med mange øvelser forblir oversiktlig med det samme man legger dem
  // til, i stedet for at man må lukke hver og én manuelt — MED unntak av
  // øvelsen man akkurat la til (startExpanded), som skal være klar for
  // sett-registrering med det samme uten en ekstra åpne-handling.
  const [collapsed, setCollapsed] = useState(!startExpanded);
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

  // Høyeste vekt noensinne på tvers av ALLE tidligere økter (ikke bare
  // forrige) — grunnlaget for PR-badgen i StrengthSetRow.
  const bestEverKg = history.length > 0 ? Math.max(...history.map((h) => h.maxKg)) : 0;

  // Foreslår vekt/reps (eller minutter/km-t/intensitet for cardio) for et nytt
  // sett fra forrige sett i samme øvelse denne økten, ellers fra "sist"-
  // referansen — matcher hvordan Strong/Hevy foreslår neste vekt i stedet for
  // å starte tomt hver gang.
  function handleAddSetClick() {
    vibrate(8);
    const prevSet = entry.sets[entry.sets.length - 1] ?? lastEntry?.sets[0];
    onAddSet({
      kg: prevSet?.kg,
      reps: prevSet?.reps,
      minutes: prevSet?.minutes,
      kmt: prevSet?.kmt,
      distanceKm: prevSet?.distanceKm,
      intensity: prevSet?.intensity,
    });
  }

  const gripHandle = (
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
  );

  const doneToggle = (
    <DoneToggle
      done={!!entry.done}
      onToggle={onToggleEntryDone}
      label={entry.done ? "Merk øvelsen som ikke fullført" : "Merk øvelsen som fullført"}
    />
  );

  // Venstre kant-stripe skiller to ulike konsepter fra hverandre: "aktiv nå"
  // (utvidet, accent-privat — appens signal for "relevant nå") vs. "fullført"
  // (status-positive, en sluttilstand som prioriteres visuelt over aktiv).
  // Kategorifargen (styrke/cardio) er bevisst IKKE brukt her — den lever kun
  // i ikon-chippen, slik at kant-stripen ikke blir tvetydig mellom "dette er
  // cardio" og "dette jobber jeg med".
  const containerClass = `rounded-xl border-l-[3px] border transition ${
    entry.done
      ? "border-l-status-positive border-status-positive/50 bg-status-positive/10"
      : collapsed
        ? "border-l-transparent border-line bg-surface-1"
        : "border-l-accent-privat border-line-strong bg-surface-1"
  }`;

  const CategoryIcon = CATEGORY_ICON[entry.category];
  const categoryChip = (
    <span
      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${CATEGORY_ACCENT[entry.category].replace("text-", "bg-")}/10`}
    >
      <CategoryIcon className={`h-3 w-3 ${CATEGORY_ACCENT[entry.category]}`} />
    </span>
  );

  if (collapsed) {
    return (
      <li ref={setNodeRef} style={style} className={`${containerClass} px-3 py-2.5`}>
        <div className="flex items-center gap-2">
          {gripHandle}
          {doneToggle}
          <button type="button" onClick={() => setCollapsed(false)} aria-expanded={false} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            {categoryChip}
            <p className="truncate text-sm font-semibold text-ink-1">{entry.exerciseName}</p>
          </button>
          <button
            type="button"
            onClick={onRemoveEntry}
            aria-label="Fjern øvelse fra økten"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-status-danger"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </li>
    );
  }

  return (
    <li ref={setNodeRef} style={style} className={`${containerClass} flex flex-col gap-2 px-3 py-2.5`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {gripHandle}
          {doneToggle}
          <button type="button" onClick={() => setCollapsed(true)} aria-expanded={true} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            {categoryChip}
            <p className="truncate text-sm font-semibold text-ink-1">{entry.exerciseName}</p>
          </button>
        </div>
        <button
          type="button"
          onClick={onRemoveEntry}
          aria-label="Fjern øvelse fra økten"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-status-danger"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Egne chips per sett i stedet for én lang komma-separert tekststreng
          — mer oversiktlig å skanne, og bryter pent over flere linjer i
          stedet for å bli en tekstvegg for øvelser med mange sett. */}
      {lastEntry && lastEntry.sets.some((s) => formatSetLog(s)) && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="shrink-0 text-2xs font-medium text-ink-4">Forrige økt:</span>
          {lastEntry.sets.slice(-4).map((s, i) => {
            const label = formatSetLog(s);
            return label ? (
              <span key={i} className="rounded-md bg-surface-3 px-1.5 py-0.5 text-2xs tabular-nums text-ink-3">
                {label}
              </span>
            ) : null;
          })}
        </div>
      )}
      {history.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setShowGraph((v) => !v)}
            aria-expanded={showGraph}
            className="self-start text-2xs font-medium text-accent-privat hover:text-accent-privat/80"
          >
            {showGraph ? "Skjul graf" : "Vis graf"}
          </button>
          {showGraph && <ProgressChart points={history} />}
        </div>
      )}
      {entry.sets.length > 0 && (
        <div className="flex flex-col gap-2">
          {entry.sets.map((s, i) => {
            // Samme sett-indeks forrige gang øvelsen ble logget — vist som en
            // dempet "spøkelses"-verdi rett ved dette settet, i tillegg til
            // den sammenslåtte "Sist:"-linjen over. Gir progresjon sett-for-
            // sett i stedet for bare et aggregert sammendrag.
            const previousLabel = lastEntry?.sets[i] ? formatSetLog(lastEntry.sets[i]) ?? undefined : undefined;
            return entry.category === "cardio" ? (
              <CardioSetRow
                key={s.id}
                set={s}
                index={i}
                previousLabel={previousLabel}
                onUpdate={(updates) => onUpdateSet(s.id, updates)}
                onToggleDone={() => onToggleSetDone(s.id, !s.done)}
                onRemove={() => onRemoveSet(s.id)}
              />
            ) : (
              <StrengthSetRow
                key={s.id}
                set={s}
                index={i}
                previousLabel={previousLabel}
                bodyweight={bodyweight}
                bestEverKg={bestEverKg}
                onUpdate={(updates) => onUpdateSet(s.id, updates)}
                onToggleDone={() => onToggleSetDone(s.id, !s.done)}
                onRemove={() => onRemoveSet(s.id)}
              />
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleAddSetClick}
          className="rounded-lg border border-accent-privat/40 bg-accent-privat/10 px-3 py-1.5 text-xs font-semibold text-accent-privat transition hover:border-accent-privat/60 hover:bg-accent-privat/15"
        >
          + Nytt sett
        </button>
        {!showMore && (
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="shrink-0 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-2xs font-medium text-ink-3 transition hover:border-line-strong hover:text-ink-1"
          >
            {entry.category === "cardio" ? "+ Notat" : "+ Minutter/notat"}
          </button>
        )}
      </div>
      {showMore && (
        <div className="grid grid-cols-2 gap-2">
          {entry.category !== "cardio" && (
            <input
              type="number"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              onBlur={commitEntry}
              placeholder="Minutter"
              className="w-full rounded-lg border border-transparent bg-surface-2 px-2 py-1.5 text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
            />
          )}
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={commitEntry}
            placeholder="Notat (valgfritt)"
            className={`w-full rounded-lg border border-transparent bg-surface-2 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong ${
              entry.category === "cardio" ? "col-span-2" : ""
            }`}
          />
        </div>
      )}
    </li>
  );
}

export function CategoryToggle({ value, onChange }: { value: ExerciseCategory; onChange: (c: ExerciseCategory) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {(Object.keys(CATEGORY_LABEL) as ExerciseCategory[]).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-pressed={value === c}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
            value === c
              ? "border-accent-privat bg-accent-privat/15 text-accent-privat"
              : "border-line bg-surface-2 text-ink-3 hover:border-line-strong hover:text-ink-1"
          }`}
        >
          {CATEGORY_LABEL[c]}
        </button>
      ))}
    </div>
  );
}

export function ExerciseEditForm({
  exercise,
  onCancel,
  onSave,
}: {
  exercise: Exercise;
  onCancel: () => void;
  onSave: (updates: { name: string; description?: string; category: ExerciseCategory; bodyweight?: boolean }) => Promise<boolean>;
}) {
  const [name, setName] = useState(exercise.name);
  const [description, setDescription] = useState(exercise.description ?? "");
  const [category, setCategory] = useState<ExerciseCategory>(exercise.category);
  const [bodyweight, setBodyweight] = useState(!!exercise.bodyweight);
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSave({ name: name.trim(), description: description.trim() || undefined, category, bodyweight: category === "styrke" && bodyweight });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line-strong bg-surface-1 p-2.5">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className="rounded-lg border border-transparent bg-surface-2 px-3 py-2 text-sm text-ink-1 outline-none focus:border-line-strong"
      />
      <CategoryToggle value={category} onChange={setCategory} />
      {category === "styrke" && (
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input
            type="checkbox"
            checked={bodyweight}
            onChange={(e) => setBodyweight(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-line accent-accent-privat"
          />
          Kroppsvekt (skjul kg-felt)
        </label>
      )}
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Beskrivelse (valgfritt)"
        rows={2}
        className="rounded-lg border border-transparent bg-surface-2 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!name.trim() || submitting}
          className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </li>
  );
}

export function ExercisePicker({
  exercises,
  onPick,
  onCreateAndPick,
  onSaveExercise,
  onDeleteExercise,
  onClose,
}: {
  exercises: Exercise[];
  onPick: (exercise: Exercise) => void;
  onCreateAndPick: (name: string, description: string, category: ExerciseCategory, bodyweight: boolean) => Promise<boolean>;
  onSaveExercise: (id: string, updates: { name: string; description?: string; category: ExerciseCategory; bodyweight?: boolean }) => Promise<boolean>;
  onDeleteExercise: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState<ExerciseCategory>("styrke");
  const [newBodyweight, setNewBodyweight] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = exercises.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()));

  async function handleCreateClick() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const ok = await onCreateAndPick(newName.trim(), newDescription.trim(), newCategory, newCategory === "styrke" && newBodyweight);
      if (ok) {
        setNewName("");
        setNewDescription("");
        setNewCategory("styrke");
        setNewBodyweight(false);
        setShowNewForm(false);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      {/* Søk og opprett ligger side ved side helt øverst — begge er
          like tilgjengelige med det samme, ikke gjemt bak "ingen treff". */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Søk øvelse..."
          aria-label="Søk øvelse"
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <button
          type="button"
          onClick={() => setShowNewForm((v) => !v)}
          aria-pressed={showNewForm}
          className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold uppercase transition ${
            showNewForm
              ? "border-accent-privat bg-accent-privat/15 text-accent-privat"
              : "border-line bg-surface-1 text-ink-2 hover:border-line-strong hover:text-ink-1"
          }`}
        >
          + Opprett
        </button>
      </div>
      {showNewForm && (
        <div className="flex flex-col gap-2 rounded-lg border border-line-strong bg-surface-1 p-2.5">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Navn på øvelse"
            className="rounded-lg border border-transparent bg-surface-2 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
          />
          <CategoryToggle value={newCategory} onChange={setNewCategory} />
          {newCategory === "styrke" && (
            <label className="flex items-center gap-2 text-xs text-ink-2">
              <input
                type="checkbox"
                checked={newBodyweight}
                onChange={(e) => setNewBodyweight(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-line accent-accent-privat"
              />
              Kroppsvekt (skjul kg-felt)
            </label>
          )}
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Beskrivelse (valgfritt)"
            rows={2}
            className="rounded-lg border border-transparent bg-surface-2 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
          />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowNewForm(false)} className="text-xs font-medium text-ink-4 hover:text-ink-2">
              Avbryt
            </button>
            <button
              type="button"
              onClick={handleCreateClick}
              disabled={!newName.trim() || creating}
              className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
            >
              Legg til
            </button>
          </div>
        </div>
      )}
      {filtered.length > 0 && (
        <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          {filtered.map((ex) =>
            editingId === ex.id ? (
              <ExerciseEditForm
                key={ex.id}
                exercise={ex}
                onCancel={() => setEditingId(null)}
                onSave={async (updates) => {
                  const ok = await onSaveExercise(ex.id, updates);
                  if (ok) setEditingId(null);
                  return ok;
                }}
              />
            ) : (
              <li key={ex.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-2.5 py-2">
                <button type="button" onClick={() => onPick(ex)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${CATEGORY_ACCENT[ex.category].replace("text-", "bg-")}/10`}>
                      {(() => {
                        const Icon = CATEGORY_ICON[ex.category];
                        return <Icon className={`h-3 w-3 ${CATEGORY_ACCENT[ex.category]}`} />;
                      })()}
                    </span>
                    <p className="truncate text-sm font-medium text-ink-1">{ex.name}</p>
                  </div>
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
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-status-danger"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      {filtered.length === 0 && <p className="text-sm text-ink-3">Ingen treff.</p>}
      <button type="button" onClick={onClose} className="self-end text-xs font-medium text-ink-4 hover:text-ink-2">
        Lukk
      </button>
    </div>
  );
}

export function RoutineRow({
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
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancelEdit();
          }}
          className="rounded-lg border border-transparent bg-surface-2 px-3 py-2 text-sm text-ink-1 outline-none focus:border-line-strong"
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
        <p className="truncate text-sm font-medium text-ink-1">{routine.name}</p>
        <p className="truncate text-2xs text-ink-4">{routine.exercises.map((e) => e.exerciseName).join(", ")}</p>
      </div>
      <button
        type="button"
        onClick={onStart}
        className="shrink-0 rounded-lg bg-accent-privat px-2.5 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85"
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
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-status-danger"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
