"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_SHELL, CardHeader, ConfirmDialog, SkeletonRows, useConfirmDelete, usePersistedCollapse } from "../CardShell";
import type { Exercise } from "@/lib/exercises";
import type { WorkoutEntry, WorkoutSession } from "@/lib/workouts";
import { Dumbbell, Pencil } from "lucide-react";

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

function entrySummary(e: WorkoutEntry): string {
  return [e.sets ? `${e.sets} sett` : null, e.reps ? `${e.reps} reps` : null, e.minutes ? `${e.minutes} min` : null]
    .filter(Boolean)
    .join(" · ");
}

// Sett/reps/minutter/notat lagres lokalt til feltet mister fokus (samme
// mønster som andre inline-redigerbare felt i appen) — unngår at hver
// tastetrykk sender en egen nettverksforespørsel.
function EntryRow({
  entry,
  onUpdate,
  onRemove,
}: {
  entry: WorkoutEntry;
  onUpdate: (updates: { sets: number | null; reps: number | null; minutes: number | null; notes: string | null }) => void;
  onRemove: () => void;
}) {
  const [sets, setSets] = useState(entry.sets?.toString() ?? "");
  const [reps, setReps] = useState(entry.reps?.toString() ?? "");
  const [minutes, setMinutes] = useState(entry.minutes?.toString() ?? "");
  const [notes, setNotes] = useState(entry.notes ?? "");

  function commit() {
    onUpdate({
      sets: sets.trim() ? Number(sets) : null,
      reps: reps.trim() ? Number(reps) : null,
      minutes: minutes.trim() ? Number(minutes) : null,
      notes: notes.trim() || null,
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink-1">{entry.exerciseName}</p>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Fjern øvelse fra økten"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
        >
          ×
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={sets}
          onChange={(e) => setSets(e.target.value)}
          onBlur={commit}
          placeholder="Sett"
          className="w-full rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <input
          type="number"
          inputMode="numeric"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          onBlur={commit}
          placeholder="Reps"
          className="w-full rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <input
          type="number"
          inputMode="numeric"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          onBlur={commit}
          placeholder="Minutter"
          className="w-full rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
        />
      </div>
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={commit}
        placeholder="Notat (valgfritt)"
        className="w-full rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
      />
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
                {entrySummary(e) && <span className="text-ink-3"> · {entrySummary(e)}</span>}
                {e.notes && <p className="text-2xs text-ink-4">{e.notes}</p>}
              </li>
            ))
          )}
        </ul>
      )}
    </li>
  );
}

export default function TreningSection() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Trening", true);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const confirmDeleteSession = useConfirmDelete<WorkoutSession>();
  const confirmDeleteExercise = useConfirmDelete<Exercise>();

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

  useEffect(() => {
    load();
    loadExercises();
    window.addEventListener("mitt-dashboard:privat-refresh", load);
    window.addEventListener("mitt-dashboard:privat-refresh", loadExercises);
    return () => {
      window.removeEventListener("mitt-dashboard:privat-refresh", load);
      window.removeEventListener("mitt-dashboard:privat-refresh", loadExercises);
    };
  }, [load, loadExercises]);

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
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
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

  async function handleUpdateEntry(
    entryId: string,
    updates: { sets: number | null; reps: number | null; minutes: number | null; notes: string | null },
  ) {
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
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold tabular-nums text-ink-1">{formatElapsed(elapsed)}</span>
                    <button
                      type="button"
                      onClick={handleEndSession}
                      className="rounded-lg bg-status-danger px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-status-danger/85"
                    >
                      Avslutt økt
                    </button>
                  </div>
                  {activeSession.entries.length > 0 && (
                    <ul className="flex flex-col gap-2">
                      {activeSession.entries.map((entry) => (
                        <EntryRow
                          key={entry.id}
                          entry={entry}
                          onUpdate={(updates) => handleUpdateEntry(entry.id, updates)}
                          onRemove={() => handleRemoveEntry(entry.id)}
                        />
                      ))}
                    </ul>
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
                <button
                  type="button"
                  onClick={handleStartSession}
                  className="rounded-xl bg-status-positive px-3 py-3 text-center text-sm font-semibold text-surface-0 transition hover:bg-status-positive/85"
                >
                  Start treningsøkt
                </button>
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
    </div>
  );
}
