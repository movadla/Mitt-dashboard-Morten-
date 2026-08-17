"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_SHELL, CardHeader, ConfirmDialog, MutationError, SkeletonRows, useConfirmDelete, useMutationError, usePersistedCollapse } from "./CardShell";
import type { Recurrence, JobbReminder } from "@/lib/jobbReminders";
import { vibrate } from "@/lib/haptics";
import { localDateString } from "@/lib/payday";
import { markJustToggled, useJustToggled } from "@/lib/justToggled";
import SwipeableRow from "./privat/SwipeableRow";
import { GripVertical, Lightbulb } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Hvor lenge en avhuket påminnelse fortsatt vises i "Nylig fullført" og kan
// angres — se lib/reminders.ts sin RemindersSection for samme mønster.
const RECENTLY_COMPLETED_WINDOW_MS = 24 * 60 * 60 * 1000;

const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: "Ingen",
  daily: "Daglig",
  weekly: "Ukentlig",
  monthly: "Månedlig",
};

function formatDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function isDueToday(r: JobbReminder, today: string): boolean {
  if (r.done) return false;
  if (!r.dueDate) return true; // ingen frist -> alltid aktuell
  return r.dueDate <= today; // forfaller i dag eller er oversittet
}

function sortReminders(a: JobbReminder, b: JobbReminder): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate.localeCompare(b.dueDate);
}

function ReminderEditForm({
  reminder,
  onCancel,
  onSave,
}: {
  reminder: JobbReminder;
  onCancel: () => void;
  onSave: (updates: { text: string; dueDate?: string; recurrence: Recurrence }) => void;
}) {
  const [text, setText] = useState(reminder.text);
  const [dueDate, setDueDate] = useState(reminder.dueDate ?? "");
  const [recurrence, setRecurrence] = useState<Recurrence>(reminder.recurrence);

  function save() {
    if (!text.trim()) return;
    onSave({ text: text.trim(), dueDate: dueDate || undefined, recurrence });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onCancel();
        }}
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 outline-none focus:border-line-strong"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        />
        <select
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value as Recurrence)}
          className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        >
          {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => (
            <option key={r} value={r}>
              {RECURRENCE_LABEL[r]}
            </option>
          ))}
        </select>
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!text.trim()}
          className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </div>
  );
}

function ReminderRowContent({
  reminder,
  onToggle,
  onRemove,
  onStartEdit,
}: {
  reminder: JobbReminder;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onStartEdit: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
      <button
        type="button"
        onClick={() => onToggle(reminder.id)}
        aria-pressed={reminder.done}
        aria-label={reminder.done ? "Marker som ikke ferdig" : "Marker som ferdig"}
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ring-1 transition ${
          reminder.done ? "bg-emerald-500 ring-emerald-500" : "bg-transparent ring-line-strong hover:ring-line-strong"
        }`}
      >
        {reminder.done && (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-surface-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8.5L6.5 12 13 5" />
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={() => onStartEdit(reminder.id)}
        className="min-w-0 flex-1 text-left"
      >
        {/* Ingen aria-label her — se app/privat/RemindersSection.tsx sin
            ReminderRowContent for hvorfor: en fast aria-label ville overstyrt
            HELE det beregnede tilgjengelighetsnavnet for alle rader. */}
        <span className="sr-only">Rediger: </span>
        <p className={`text-sm ${reminder.done ? "text-ink-4 line-through" : "text-ink-1"}`}>{reminder.text}</p>
        {(reminder.dueDate || reminder.recurrence !== "none") && (
          <p className="mt-0.5 text-2xs text-ink-4">
            {reminder.dueDate ? formatDMY(reminder.dueDate) : ""}
            {reminder.dueDate && reminder.recurrence !== "none" ? " · " : ""}
            {reminder.recurrence !== "none" ? RECURRENCE_LABEL[reminder.recurrence] : ""}
          </p>
        )}
      </button>
      <button
        type="button"
        onClick={() => onRemove(reminder.id)}
        aria-label="Slett påminnelse"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
      >
        ×
      </button>
    </div>
  );
}

type RowCallbacks = {
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, updates: { text: string; dueDate?: string; recurrence: Recurrence }) => void;
};

function ReminderRow({
  reminder,
  editing,
  onToggle,
  onRemove,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}: { reminder: JobbReminder; editing: boolean } & RowCallbacks) {
  if (editing) {
    return (
      <li>
        <ReminderEditForm reminder={reminder} onCancel={onCancelEdit} onSave={(updates) => onSaveEdit(reminder.id, updates)} />
      </li>
    );
  }

  return (
    <li>
      <SwipeableRow
        onSwipeRight={() => onToggle(reminder.id)}
        onSwipeLeft={() => onRemove(reminder.id)}
        rightLabel={reminder.done ? "Ikke ferdig" : "Fullført"}
        leftLabel="Slett"
      >
        <ReminderRowContent reminder={reminder} onToggle={onToggle} onRemove={onRemove} onStartEdit={onStartEdit} />
      </SwipeableRow>
    </li>
  );
}

// Samme rad som ReminderRow, men dras via et eget håndtak (dnd-kit) — brukes
// kun i "i dag"-lista, der manuell prioritering gir mening.
function SortableReminderRow({
  reminder,
  editing,
  onToggle,
  onRemove,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}: { reminder: JobbReminder; editing: boolean } & RowCallbacks) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: reminder.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  if (editing) {
    return (
      <li ref={setNodeRef} style={style}>
        <ReminderEditForm reminder={reminder} onCancel={onCancelEdit} onSave={(updates) => onSaveEdit(reminder.id, updates)} />
      </li>
    );
  }

  return (
    <li ref={setNodeRef} style={style} className="flex items-stretch gap-1">
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label="Endre rekkefølge"
        className="grid shrink-0 cursor-grab place-items-center px-1 text-ink-4 transition hover:text-ink-2 active:cursor-grabbing"
        style={{ touchAction: "none" }}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <SwipeableRow
          onSwipeRight={() => onToggle(reminder.id)}
          onSwipeLeft={() => onRemove(reminder.id)}
          rightLabel={reminder.done ? "Ikke ferdig" : "Fullført"}
          leftLabel="Slett"
        >
          <ReminderRowContent reminder={reminder} onToggle={onToggle} onRemove={onRemove} onStartEdit={onStartEdit} />
        </SwipeableRow>
      </div>
    </li>
  );
}

export default function JobbRemindersSection() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Påminnelser (Jobb)", true);
  const [reminders, setReminders] = useState<JobbReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [showRecentlyCompleted, setShowRecentlyCompleted] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState(localDateString());
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Delt med Privat-fanens Påminnelser/TodaySummary via lib/justToggled.ts —
  // holder en nettopp avhuket påminnelse synlig i "i dag"-lista en kort stund
  // etter trykk, slik at man rekker se haken fylles inn før raden forsvinner.
  const justToggled = useJustToggled();
  const confirmDelete = useConfirmDelete<string>();
  const mutationError = useMutationError();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const load = useCallback(() => {
    fetch("/api/jobb-reminders")
      .then((r) => r.json())
      .then((d) => setReminders((d.reminders ?? []) as JobbReminder[]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("mitt-dashboard:jobb-refresh", load);
    return () => window.removeEventListener("mitt-dashboard:jobb-refresh", load);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  async function handleAdd() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobb-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, dueDate: dueDate || undefined, recurrence }),
      });
      if (!res.ok) {
        mutationError.show("Kunne ikke legge til påminnelsen. Prøv igjen.");
        return;
      }
      const created: JobbReminder = await res.json();
      setReminders((prev) => [...prev, created].sort(sortReminders));
      setText("");
      setDueDate(localDateString());
      setRecurrence("none");
      setShowForm(false);
      window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
    } catch {
      mutationError.show("Kunne ikke legge til påminnelsen. Prøv igjen.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(id: string) {
    const current = reminders.find((r) => r.id === id);
    if (!current) return;
    const optimisticDone = !current.done;
    const previous = reminders;
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, done: optimisticDone } : r)));
    markJustToggled(id);
    vibrate(optimisticDone ? 15 : 8);
    try {
      const res = await fetch(`/api/jobb-reminders/${id}`, { method: "PATCH" });
      if (!res.ok) throw new Error("toggle failed");
      const updated: JobbReminder = await res.json();
      setReminders((prev) => prev.map((r) => (r.id === id ? updated : r)).sort(sortReminders));
      window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
    } catch {
      setReminders(previous);
      mutationError.show("Kunne ikke oppdatere påminnelsen. Prøv igjen.");
    }
  }

  async function handleRemove(id: string) {
    const previous = reminders;
    setReminders((prev) => prev.filter((r) => r.id !== id));
    vibrate([10, 30, 10]);
    try {
      const res = await fetch(`/api/jobb-reminders/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
    } catch {
      setReminders(previous);
      mutationError.show("Kunne ikke slette påminnelsen. Prøv igjen.");
    }
  }

  async function handleSaveEdit(
    id: string,
    updates: { text: string; dueDate?: string; recurrence: Recurrence },
  ) {
    try {
      const res = await fetch(`/api/jobb-reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: updates.text, dueDate: updates.dueDate ?? null, recurrence: updates.recurrence }),
      });
      if (!res.ok) throw new Error("save failed");
      const updated: JobbReminder = await res.json();
      setReminders((prev) => prev.map((r) => (r.id === id ? updated : r)).sort(sortReminders));
      setEditingId(null);
      window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
    } catch {
      mutationError.show("Kunne ikke lagre endringene. Prøv igjen.");
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    setReminders((prev) => {
      const todaysIds = prev
        .filter((r) => isDueToday(r, today))
        .sort((a, b) => a.order - b.order)
        .map((r) => r.id);
      const oldIndex = todaysIds.indexOf(activeId);
      const newIndex = todaysIds.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reordered = arrayMove(todaysIds, oldIndex, newIndex);
      const orderOf = new Map(reordered.map((id, i) => [id, i]));
      const next = prev.map((r) => (orderOf.has(r.id) ? { ...r, order: orderOf.get(r.id)! } : r));

      fetch("/api/jobb-reminders/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("reorder failed");
          window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
        })
        .catch(() => mutationError.show("Kunne ikke lagre ny rekkefølge."));

      return next;
    });
    vibrate(10);
  }

  const today = localDateString();
  const todays = reminders
    .filter((r) => isDueToday(r, today) || justToggled.has(r.id))
    .sort((a, b) => a.order - b.order);
  const rest = reminders.filter((r) => !isDueToday(r, today) && !r.done);
  // Avhukede påminnelser får sin egen "Nylig fullført"-seksjon (samme mønster
  // som Privat-fanens Påminnelser-kort) i stedet for å forsvinne permanent
  // uten angre-mulighet.
  const recentlyCompleted = reminders
    .filter(
      (r) =>
        (r.done && r.completedAt && now - new Date(r.completedAt).getTime() <= RECENTLY_COMPLETED_WINDOW_MS) ||
        (r.done && justToggled.has(r.id)),
    )
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  return (
    <div className={`${CARD_SHELL} border-t-2 border-t-accent/60 p-4`}>
      <CardHeader
        title="Påminnelser"
        subtitle={todays.length > 0 ? `${todays.length} i dag` : "Ingen i dag"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        onAdd={() => {
          setDueDate(localDateString());
          setShowForm(true);
        }}
        addLabel="Ny påminnelse"
        icon={Lightbulb}
        iconColorClass="text-accent"
        alwaysShowSubtitle
      />
      {!collapsed && (
        <div className="flex flex-col gap-2">
          <MutationError message={mutationError.message} />
          {showForm && (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-2.5">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") setShowForm(false);
                }}
                placeholder="Ny påminnelse..."
                className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
                />
                <select
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value as Recurrence)}
                  className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
                >
                  {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => (
                    <option key={r} value={r}>
                      {RECURRENCE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-xs font-medium text-ink-4 hover:text-ink-2"
                >
                  Avbryt
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!text.trim() || submitting}
                  className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent/85 disabled:opacity-40"
                >
                  Legg til
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <SkeletonRows count={2} />
          ) : todays.length === 0 ? (
            <p className="text-sm text-ink-3">Ingen påminnelser i dag.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={todays.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <ul className="flex flex-col gap-1.5">
                  {todays.map((r) => (
                    <SortableReminderRow
                      key={r.id}
                      reminder={r}
                      editing={editingId === r.id}
                      onToggle={handleToggle}
                      onRemove={confirmDelete.request}
                      onStartEdit={setEditingId}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveEdit={handleSaveEdit}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          {rest.length > 0 && (
            <>
              {showAll && (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {rest.map((r) => (
                    <ReminderRow
                      key={r.id}
                      reminder={r}
                      editing={editingId === r.id}
                      onToggle={handleToggle}
                      onRemove={confirmDelete.request}
                      onStartEdit={setEditingId}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveEdit={handleSaveEdit}
                    />
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-1 text-left text-xs font-medium text-accent hover:text-accent/80"
              >
                {showAll ? "Vis mindre" : `Mer (${rest.length})`}
              </button>
            </>
          )}

          {recentlyCompleted.length > 0 && (
            <>
              {showRecentlyCompleted && (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {recentlyCompleted.map((r) => (
                    <ReminderRow
                      key={r.id}
                      reminder={r}
                      editing={editingId === r.id}
                      onToggle={handleToggle}
                      onRemove={confirmDelete.request}
                      onStartEdit={setEditingId}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveEdit={handleSaveEdit}
                    />
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => setShowRecentlyCompleted((v) => !v)}
                className="mt-1 text-left text-xs font-medium text-ink-4 hover:text-ink-2"
              >
                {showRecentlyCompleted ? "Skjul nylig fullført" : `Nylig fullført (${recentlyCompleted.length})`}
              </button>
            </>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={`Slette påminnelsen «${reminders.find((r) => r.id === confirmDelete.pending)?.text ?? ""}»?`}
        onCancel={confirmDelete.cancel}
        onConfirm={() => {
          handleRemove(confirmDelete.pending!);
          confirmDelete.cancel();
        }}
      />
    </div>
  );
}
