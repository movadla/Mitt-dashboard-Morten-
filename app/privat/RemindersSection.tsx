"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { CARD_SHELL, CardHeader, CollapsibleBody, ConfirmDialog, SkeletonRows, useConfirmDelete, usePersistedCollapse } from "../CardShell";
import { CommentBadge, CommentThreadBody } from "../CommentsCell";
import { commentKey, useComments } from "../useComments";
import type { Comment } from "@/lib/comments";
import type { Recurrence, Reminder, Subtask } from "@/lib/reminders";
import { vibrate } from "@/lib/haptics";
import { localDateString } from "@/lib/payday";
import SwipeableRow from "./SwipeableRow";
import { GripVertical, Lightbulb, Plus } from "lucide-react";
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
// angres — minst 24 timer, jf. tilbakemelding.
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

function isDueToday(r: Reminder, today: string): boolean {
  if (r.done) return false;
  if (!r.dueDate) return true; // ingen frist -> alltid aktuell
  return r.dueDate <= today; // forfaller i dag eller er oversittet
}

function sortReminders(a: Reminder, b: Reminder): number {
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
  onAddSubtask,
  onToggleSubtask,
  onRemoveSubtask,
}: {
  reminder: Reminder;
  onCancel: () => void;
  onSave: (updates: { text: string; dueDate?: string; dueTime?: string; recurrence: Recurrence }) => void;
} & RowSubtaskProps) {
  const [text, setText] = useState(reminder.text);
  const [dueDate, setDueDate] = useState(reminder.dueDate ?? "");
  const [dueTime, setDueTime] = useState(reminder.dueTime ?? "");
  const [recurrence, setRecurrence] = useState<Recurrence>(reminder.recurrence);

  function save() {
    if (!text.trim()) return;
    onSave({ text: text.trim(), dueDate: dueDate || undefined, dueTime: dueTime || undefined, recurrence });
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
        <input
          type="time"
          value={dueTime}
          onChange={(e) => setDueTime(e.target.value)}
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
          className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
      <div>
        <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-4">Underoppgaver</p>
        <ReminderSubtasks subtasks={reminder.subtasks ?? []} onAdd={onAddSubtask} onToggle={onToggleSubtask} onRemove={onRemoveSubtask} />
      </div>
    </div>
  );
}

function ReminderRowContent({
  reminder,
  onToggle,
  onRemove,
  onStartEdit,
  commentCount,
  notesOpen,
  onToggleNotes,
}: {
  reminder: Reminder;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onStartEdit: (id: string) => void;
  commentCount: number;
  notesOpen: boolean;
  onToggleNotes: () => void;
}) {
  const subtasks = reminder.subtasks ?? [];
  const subtasksDone = subtasks.filter((s) => s.done).length;
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
        aria-label="Rediger påminnelse"
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className={`min-w-0 truncate text-sm ${reminder.done ? "text-ink-4 line-through" : "text-ink-1"}`}>{reminder.text}</p>
          {reminder.dueTime && <span className="shrink-0 text-2xs tabular-nums text-ink-3">{reminder.dueTime}</span>}
        </div>
        {(reminder.dueDate || reminder.recurrence !== "none" || subtasks.length > 0) && (
          <p className="mt-0.5 text-2xs text-ink-4">
            {reminder.dueDate ? formatDMY(reminder.dueDate) : ""}
            {reminder.dueDate && reminder.recurrence !== "none" ? " · " : ""}
            {reminder.recurrence !== "none" ? RECURRENCE_LABEL[reminder.recurrence] : ""}
            {(reminder.dueDate || reminder.recurrence !== "none") && subtasks.length > 0 ? " · " : ""}
            {subtasks.length > 0 ? `${subtasksDone}/${subtasks.length} underoppgaver` : ""}
          </p>
        )}
      </button>
      <CommentBadge count={commentCount} open={notesOpen} onClick={onToggleNotes} />
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

function ReminderNotes({
  comments,
  onAdd,
  onDelete,
  onToggleRelevance,
}: {
  comments: Comment[];
  onAdd: (tekst: string) => void;
  onDelete: (commentId: string, preview: string) => void;
  onToggleRelevance: (commentId: string, ikkeRelevant: boolean) => void;
}) {
  return (
    <div className="mt-1.5 rounded-xl border border-line bg-surface-2/60 px-3 py-2">
      <CommentThreadBody comments={comments} onAdd={onAdd} onDelete={onDelete} onToggleRelevance={onToggleRelevance} accentClassName="bg-accent-privat hover:bg-accent-privat/85" />
    </div>
  );
}

function ReminderSubtasks({
  subtasks,
  onAdd,
  onToggle,
  onRemove,
}: {
  subtasks: Subtask[];
  onAdd: (text: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");

  function submit() {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText("");
    setAdding(false);
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1.5 rounded-xl border border-line bg-surface-2/60 px-3 py-2">
      {subtasks.length > 0 && (
        <ul className="flex flex-col gap-1">
          {subtasks.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onToggle(s.id)}
                aria-pressed={s.done}
                aria-label={s.done ? "Marker underpunkt som ikke ferdig" : "Marker underpunkt som ferdig"}
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ring-1 transition ${
                  s.done ? "bg-emerald-500 ring-emerald-500" : "bg-transparent ring-line-strong hover:ring-line-strong"
                }`}
              >
                {s.done && (
                  <svg viewBox="0 0 16 16" className="h-3 w-3 text-surface-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8.5L6.5 12 13 5" />
                  </svg>
                )}
              </button>
              <p className={`min-w-0 flex-1 text-sm ${s.done ? "text-ink-4 line-through" : "text-ink-1"}`}>{s.text}</p>
              <button
                type="button"
                onClick={() => onRemove(s.id)}
                aria-label="Slett underpunkt"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-base leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Nytt underpunkt..."
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            className="rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
          >
            Legg til
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="text-left text-xs font-medium text-accent-privat hover:text-accent-privat/80">
          + Nytt underpunkt
        </button>
      )}
    </div>
  );
}

type RowCallbacks = {
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, updates: { text: string; dueDate?: string; dueTime?: string; recurrence: Recurrence }) => void;
};

type RowCommentProps = {
  comments: Comment[];
  onAddComment: (tekst: string) => void;
  onDeleteComment: (commentId: string, preview: string) => void;
  onToggleCommentRelevance: (commentId: string, ikkeRelevant: boolean) => void;
};

type RowSubtaskProps = {
  onAddSubtask: (text: string) => void;
  onToggleSubtask: (subtaskId: string) => void;
  onRemoveSubtask: (subtaskId: string) => void;
};

function ReminderRow({
  reminder,
  editing,
  onToggle,
  onRemove,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  comments,
  onAddComment,
  onDeleteComment,
  onToggleCommentRelevance,
  onAddSubtask,
  onToggleSubtask,
  onRemoveSubtask,
}: { reminder: Reminder; editing: boolean } & RowCallbacks & RowCommentProps & RowSubtaskProps) {
  const [notesOpen, setNotesOpen] = useState(false);

  if (editing) {
    return (
      <li>
        <ReminderEditForm
          reminder={reminder}
          onCancel={onCancelEdit}
          onSave={(updates) => onSaveEdit(reminder.id, updates)}
          onAddSubtask={onAddSubtask}
          onToggleSubtask={onToggleSubtask}
          onRemoveSubtask={onRemoveSubtask}
        />
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
        <ReminderRowContent
          reminder={reminder}
          onToggle={onToggle}
          onRemove={onRemove}
          onStartEdit={onStartEdit}
          commentCount={comments.length}
          notesOpen={notesOpen}
          onToggleNotes={() => setNotesOpen((v) => !v)}
        />
      </SwipeableRow>
      {notesOpen && <ReminderNotes comments={comments} onAdd={onAddComment} onDelete={onDeleteComment} onToggleRelevance={onToggleCommentRelevance} />}
    </li>
  );
}

// Samme rad som ReminderRow, men drabar via et eget håndtak (dnd-kit) — brukes
// kun i "i dag"-lista, der manuell prioritering gir mening.
function SortableReminderRow({
  reminder,
  editing,
  onToggle,
  onRemove,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  comments,
  onAddComment,
  onDeleteComment,
  onToggleCommentRelevance,
  onAddSubtask,
  onToggleSubtask,
  onRemoveSubtask,
}: { reminder: Reminder; editing: boolean } & RowCallbacks & RowCommentProps & RowSubtaskProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: reminder.id,
  });
  const [notesOpen, setNotesOpen] = useState(false);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  if (editing) {
    return (
      <li ref={setNodeRef} style={style}>
        <ReminderEditForm
          reminder={reminder}
          onCancel={onCancelEdit}
          onSave={(updates) => onSaveEdit(reminder.id, updates)}
          onAddSubtask={onAddSubtask}
          onToggleSubtask={onToggleSubtask}
          onRemoveSubtask={onRemoveSubtask}
        />
      </li>
    );
  }

  return (
    <li ref={setNodeRef} style={style} className="flex flex-col">
      <div className="flex items-stretch gap-1">
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
            <ReminderRowContent
              reminder={reminder}
              onToggle={onToggle}
              onRemove={onRemove}
              onStartEdit={onStartEdit}
              commentCount={comments.length}
              notesOpen={notesOpen}
              onToggleNotes={() => setNotesOpen((v) => !v)}
            />
          </SwipeableRow>
        </div>
      </div>
      {notesOpen && (
        <div className="pl-7">
          <ReminderNotes comments={comments} onAdd={onAddComment} onDelete={onDeleteComment} onToggleRelevance={onToggleCommentRelevance} />
        </div>
      )}
    </li>
  );
}

export default function RemindersSection() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Påminnelser", true);
  // Delt SWR-nøkkel med TodaySummary — begge leser/skriver samme cache-oppføring
  // istedenfor å holde hver sin kopi og hente uavhengig av hverandre.
  const { data, isLoading: loading, mutate: mutateReminders } = useSWR<{ reminders: Reminder[] }>(
    "/api/reminders",
    jsonFetcher,
  );
  const reminders = data?.reminders ?? [];
  const [showAll, setShowAll] = useState(false);
  const [showRecentlyCompleted, setShowRecentlyCompleted] = useState(false);
  // "now" leses fra state (ikke Date.now() direkte i render, som React
  // Compiler flagger som uren) — oppdateres sjelden, siden 24-timers-vinduet
  // for "Nylig fullført" ikke trenger sekund-presisjon.
  const [now, setNow] = useState(() => Date.now());
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState(localDateString());
  const [dueTime, setDueTime] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Holder en nettopp avhuket (eller angret) påminnelse synlig i "i dag"-lista
  // en kort stund etter trykk — uten denne filtreres raden ut med det samme
  // state oppdateres, og man rekker aldri se haken bli fylt inn før den er
  // borte. Se samme mønster i ShoppingListSection/JobbRemindersSection.
  const [justToggledIds, setJustToggledIds] = useState<Set<string>>(new Set());
  const confirmDelete = useConfirmDelete<string>();
  const { comments, addComment, removeComment, toggleRelevance, confirmDelete: confirmCommentDelete } = useComments();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  async function handleAdd() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, dueDate: dueDate || undefined, dueTime: dueTime || undefined, recurrence }),
      });
      if (res.ok) {
        const created: Reminder = await res.json();
        if (notes.trim()) await addComment("reminder", created.id, notes.trim());
        mutateReminders(
          (current) => current && { reminders: [...current.reminders, created].sort(sortReminders) },
          { revalidate: false },
        );
        setText("");
        setDueDate(localDateString());
        setDueTime("");
        setRecurrence("none");
        setNotes("");
        setShowForm(false);
        window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(id: string) {
    const res = await fetch(`/api/reminders/${id}`, { method: "PATCH" });
    if (res.ok) {
      const updated: Reminder = await res.json();
      mutateReminders(
        (current) => current && { reminders: current.reminders.map((r) => (r.id === id ? updated : r)).sort(sortReminders) },
        { revalidate: false },
      );
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      vibrate(updated.done ? 15 : 8);
      setJustToggledIds((prev) => new Set(prev).add(id));
      setTimeout(() => {
        setJustToggledIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 700);
    }
  }

  async function handleRemove(id: string) {
    mutateReminders((current) => current && { reminders: current.reminders.filter((r) => r.id !== id) }, {
      revalidate: false,
    });
    vibrate([10, 30, 10]);
    await fetch(`/api/reminders/${id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
  }

  async function handleSaveEdit(
    id: string,
    updates: { text: string; dueDate?: string; dueTime?: string; recurrence: Recurrence },
  ) {
    const res = await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: updates.text,
        dueDate: updates.dueDate ?? null,
        dueTime: updates.dueTime ?? null,
        recurrence: updates.recurrence,
      }),
    });
    if (res.ok) {
      const updated: Reminder = await res.json();
      mutateReminders(
        (current) => current && { reminders: current.reminders.map((r) => (r.id === id ? updated : r)).sort(sortReminders) },
        { revalidate: false },
      );
      setEditingId(null);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  async function handleAddSubtask(reminderId: string, text: string) {
    const res = await fetch(`/api/reminders/${reminderId}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const updated: Reminder = await res.json();
      mutateReminders((current) => current && { reminders: current.reminders.map((r) => (r.id === reminderId ? updated : r)) }, {
        revalidate: false,
      });
    }
  }

  async function handleToggleSubtask(reminderId: string, subtaskId: string) {
    const res = await fetch(`/api/reminders/${reminderId}/subtasks/${subtaskId}`, { method: "PATCH" });
    if (res.ok) {
      const updated: Reminder = await res.json();
      mutateReminders((current) => current && { reminders: current.reminders.map((r) => (r.id === reminderId ? updated : r)) }, {
        revalidate: false,
      });
      vibrate(8);
    }
  }

  async function handleRemoveSubtask(reminderId: string, subtaskId: string) {
    const res = await fetch(`/api/reminders/${reminderId}/subtasks/${subtaskId}`, { method: "DELETE" });
    if (res.ok) {
      const updated: Reminder = await res.json();
      mutateReminders((current) => current && { reminders: current.reminders.map((r) => (r.id === reminderId ? updated : r)) }, {
        revalidate: false,
      });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const todaysIds = reminders
      .filter((r) => isDueToday(r, today))
      .sort((a, b) => a.order - b.order)
      .map((r) => r.id);
    const oldIndex = todaysIds.indexOf(activeId);
    const newIndex = todaysIds.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(todaysIds, oldIndex, newIndex);
    const orderOf = new Map(reordered.map((id, i) => [id, i]));
    const next = reminders.map((r) => (orderOf.has(r.id) ? { ...r, order: orderOf.get(r.id)! } : r));
    mutateReminders({ reminders: next }, { revalidate: false });

    fetch("/api/reminders/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: reordered }),
    }).then(() => window.dispatchEvent(new Event("mitt-dashboard:privat-refresh")));

    vibrate(10);
  }

  const today = localDateString();
  const todays = reminders
    .filter((r) => isDueToday(r, today) || justToggledIds.has(r.id))
    .sort((a, b) => a.order - b.order);
  const rest = reminders.filter((r) => !isDueToday(r, today) && !r.done);
  // Avhukede påminnelser havner ikke lenger i "rest" — de får sin egen
  // seksjon her, slik at man kan angre (huke av igjen) i minst 24 timer
  // etter man trykket dem bort, jf. tilbakemelding.
  const recentlyCompleted = reminders
    .filter(
      (r) =>
        (r.done && r.completedAt && now - new Date(r.completedAt).getTime() <= RECENTLY_COMPLETED_WINDOW_MS) ||
        justToggledIds.has(r.id),
    )
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  function openAddForm() {
    setDueDate(localDateString());
    setDueTime("");
    setNotes("");
    setShowForm(true);
  }

  function handleAddClick() {
    if (collapsed) toggleCollapsed();
    openAddForm();
  }

  return (
    <div className={`${CARD_SHELL} border-t-2 border-t-accent-privat/60 p-4`}>
      <CardHeader
        title="Påminnelser"
        subtitle={todays.length > 0 ? `${todays.length} i dag` : "Ingen i dag"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        onAdd={handleAddClick}
        addLabel="Ny påminnelse"
        icon={Lightbulb}
        iconColorClass="text-accent-privat"
      />
      <CollapsibleBody collapsed={collapsed}>
        <div className="flex flex-col gap-2">
          {showForm ? (
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
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
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
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Notat (valgfritt)..."
                className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
              />
              <div className="flex items-center gap-2">
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
                  className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
                >
                  Legg til
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={openAddForm}
              aria-label="Ny påminnelse"
              title="Ny påminnelse"
              className="grid h-9 w-9 place-items-center self-start rounded-xl border border-dashed border-line text-ink-3 transition hover:border-line-strong hover:text-ink-1"
            >
              <Plus className="h-4 w-4" />
            </button>
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
                      comments={comments[commentKey("reminder", r.id)] ?? []}
                      onAddComment={(tekst) => addComment("reminder", r.id, tekst)}
                      onDeleteComment={(commentId, preview) =>
                        confirmCommentDelete.request({ targetType: "reminder", targetId: r.id, commentId, preview })
                      }
                      onToggleCommentRelevance={(commentId, ikkeRelevant) => toggleRelevance("reminder", r.id, commentId, ikkeRelevant)}
                      onAddSubtask={(text) => handleAddSubtask(r.id, text)}
                      onToggleSubtask={(subtaskId) => handleToggleSubtask(r.id, subtaskId)}
                      onRemoveSubtask={(subtaskId) => handleRemoveSubtask(r.id, subtaskId)}
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
                      comments={comments[commentKey("reminder", r.id)] ?? []}
                      onAddComment={(tekst) => addComment("reminder", r.id, tekst)}
                      onDeleteComment={(commentId, preview) =>
                        confirmCommentDelete.request({ targetType: "reminder", targetId: r.id, commentId, preview })
                      }
                      onToggleCommentRelevance={(commentId, ikkeRelevant) => toggleRelevance("reminder", r.id, commentId, ikkeRelevant)}
                      onAddSubtask={(text) => handleAddSubtask(r.id, text)}
                      onToggleSubtask={(subtaskId) => handleToggleSubtask(r.id, subtaskId)}
                      onRemoveSubtask={(subtaskId) => handleRemoveSubtask(r.id, subtaskId)}
                    />
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-1 text-left text-xs font-medium text-accent-privat hover:text-accent-privat/80"
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
                      comments={comments[commentKey("reminder", r.id)] ?? []}
                      onAddComment={(tekst) => addComment("reminder", r.id, tekst)}
                      onDeleteComment={(commentId, preview) =>
                        confirmCommentDelete.request({ targetType: "reminder", targetId: r.id, commentId, preview })
                      }
                      onToggleCommentRelevance={(commentId, ikkeRelevant) => toggleRelevance("reminder", r.id, commentId, ikkeRelevant)}
                      onAddSubtask={(text) => handleAddSubtask(r.id, text)}
                      onToggleSubtask={(subtaskId) => handleToggleSubtask(r.id, subtaskId)}
                      onRemoveSubtask={(subtaskId) => handleRemoveSubtask(r.id, subtaskId)}
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
      </CollapsibleBody>
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={`Slette påminnelsen «${reminders.find((r) => r.id === confirmDelete.pending)?.text ?? ""}»?`}
        onCancel={confirmDelete.cancel}
        onConfirm={() => {
          handleRemove(confirmDelete.pending!);
          confirmDelete.cancel();
        }}
      />
      <ConfirmDialog
        open={confirmCommentDelete.isOpen}
        message={confirmCommentDelete.pending ? `Slette notatet «${confirmCommentDelete.pending.preview}»?` : ""}
        onCancel={confirmCommentDelete.cancel}
        onConfirm={() => {
          const pending = confirmCommentDelete.pending;
          if (pending) removeComment(pending.targetType, pending.targetId, pending.commentId);
          confirmCommentDelete.cancel();
        }}
      />
    </div>
  );
}
