"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_SHELL, CardHeader, ConfirmDialog, SkeletonRows, useConfirmDelete, usePersistedCollapse } from "../CardShell";
import { CommentBadge, CommentThreadBody } from "../CommentsCell";
import { commentKey, useComments } from "../useComments";
import type { Comment } from "@/lib/comments";
import type { PrivatCalendarEvent } from "@/lib/privatCalendar";
import { vibrate } from "@/lib/haptics";
import { localDateString } from "@/lib/payday";
import SwipeableRow from "./SwipeableRow";
import { Calendar } from "lucide-react";

function formatDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function EventEditForm({
  event,
  onCancel,
  onSave,
}: {
  event: PrivatCalendarEvent;
  onCancel: () => void;
  onSave: (updates: { title: string; date: string; startTime?: string; endTime?: string }) => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(event.date);
  const [startTime, setStartTime] = useState(event.startTime ?? "");
  const [endTime, setEndTime] = useState(event.endTime ?? "");

  function save() {
    if (!title.trim() || !date) return;
    onSave({ title: title.trim(), date, startTime: startTime || undefined, endTime: endTime || undefined });
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      <input
        type="text"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 outline-none focus:border-line-strong"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        />
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        />
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        />
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!title.trim() || !date}
          className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </li>
  );
}

function EventNotes({
  comments,
  onAdd,
  onDelete,
}: {
  comments: Comment[];
  onAdd: (tekst: string) => void;
  onDelete: (commentId: string, preview: string) => void;
}) {
  return (
    <div className="mt-1.5 rounded-xl border border-line bg-surface-2/60 px-3 py-2">
      <CommentThreadBody comments={comments} onAdd={onAdd} onDelete={onDelete} accentClassName="bg-accent-privat hover:bg-accent-privat/85" />
    </div>
  );
}

function EventRow({
  event,
  editing,
  onRemove,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  comments,
  onAddComment,
  onDeleteComment,
}: {
  event: PrivatCalendarEvent;
  editing: boolean;
  onRemove: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, updates: { title: string; date: string; startTime?: string; endTime?: string }) => void;
  comments: Comment[];
  onAddComment: (tekst: string) => void;
  onDeleteComment: (commentId: string, preview: string) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);

  if (editing) {
    return (
      <EventEditForm event={event} onCancel={onCancelEdit} onSave={(updates) => onSaveEdit(event.id, updates)} />
    );
  }

  return (
    <li>
      <SwipeableRow onSwipeLeft={() => onRemove(event.id)} leftLabel="Slett">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
          <button
            type="button"
            onClick={() => onStartEdit(event.id)}
            aria-label="Rediger hendelse"
            className="min-w-0 flex-1 text-left"
          >
            <p className="text-sm text-ink-1">{event.title}</p>
            <p className="mt-0.5 text-2xs text-ink-4">
              {formatDMY(event.date)}
              {event.startTime ? ` ${event.startTime}` : ""}
              {event.endTime ? `–${event.endTime}` : ""}
              {event.note ? ` — ${event.note}` : ""}
            </p>
          </button>
          <CommentBadge count={comments.length} open={notesOpen} onClick={() => setNotesOpen((v) => !v)} />
          <button
            type="button"
            onClick={() => onRemove(event.id)}
            aria-label="Slett hendelse"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
          >
            ×
          </button>
        </div>
      </SwipeableRow>
      {notesOpen && <EventNotes comments={comments} onAdd={onAddComment} onDelete={onDeleteComment} />}
    </li>
  );
}

export default function CalendarSection() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Privat kalender", true);
  const [events, setEvents] = useState<PrivatCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const confirmDelete = useConfirmDelete<string>();
  const { comments, addComment, removeComment, confirmDelete: confirmCommentDelete } = useComments();

  const load = useCallback(() => {
    fetch("/api/privat-calendar")
      .then((r) => r.json())
      .then((d) => setEvents((d.events ?? []) as PrivatCalendarEvent[]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("mitt-dashboard:privat-refresh", load);
    return () => window.removeEventListener("mitt-dashboard:privat-refresh", load);
  }, [load]);

  async function handleAdd() {
    if (!title.trim() || !date || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/privat-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          date,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
        }),
      });
      if (res.ok) {
        const created: PrivatCalendarEvent = await res.json();
        setEvents((prev) =>
          [...prev, created].sort(
            (a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""),
          ),
        );
        setTitle("");
        setDate("");
        setStartTime("");
        setEndTime("");
        setShowForm(false);
        window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    vibrate([10, 30, 10]);
    await fetch(`/api/privat-calendar/${id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
  }

  async function handleSaveEdit(
    id: string,
    updates: { title: string; date: string; startTime?: string; endTime?: string },
  ) {
    const res = await fetch(`/api/privat-calendar/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: updates.title,
        date: updates.date,
        startTime: updates.startTime ?? null,
        endTime: updates.endTime ?? null,
      }),
    });
    if (res.ok) {
      const updated: PrivatCalendarEvent = await res.json();
      setEvents((prev) =>
        prev
          .map((e) => (e.id === id ? updated : e))
          .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? "")),
      );
      setEditingId(null);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  const today = localDateString();
  const upcoming = events.filter((e) => e.date >= today);
  const todays = upcoming.filter((e) => e.date === today);
  const rest = upcoming.filter((e) => e.date !== today);

  function handleAddClick() {
    if (collapsed) toggleCollapsed();
    setShowForm(true);
  }

  return (
    <div className={`${CARD_SHELL} !border-2 !border-source-teams p-4`}>
      <CardHeader
        title="Kalender"
        subtitle={todays.length > 0 ? `${todays.length} i dag` : "Ingen i dag"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        onAdd={handleAddClick}
        addLabel="Ny kalenderhendelse"
        icon={Calendar}
        iconColorClass="text-source-teams"
      />
      {!collapsed && (
        <div className="flex flex-col gap-2">
          {showForm ? (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-2.5">
              <input
                type="text"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setShowForm(false);
                }}
                placeholder="Tittel..."
                className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
                />
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
                />
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
                />
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
                  disabled={!title.trim() || !date || submitting}
                  className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
                >
                  Legg til
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm text-ink-3 transition hover:border-line-strong hover:text-ink-1"
            >
              <span className="text-base leading-none">+</span> Ny hendelse
            </button>
          )}

          {loading ? (
            <SkeletonRows count={2} />
          ) : todays.length === 0 ? (
            <p className="text-sm text-ink-3">Ingen hendelser i dag.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {todays.map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  editing={editingId === e.id}
                  onRemove={confirmDelete.request}
                  onStartEdit={setEditingId}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={handleSaveEdit}
                  comments={comments[commentKey("calendar-event", e.id)] ?? []}
                  onAddComment={(tekst) => addComment("calendar-event", e.id, tekst)}
                  onDeleteComment={(commentId, preview) =>
                    confirmCommentDelete.request({ targetType: "calendar-event", targetId: e.id, commentId, preview })
                  }
                />
              ))}
            </ul>
          )}

          {rest.length > 0 && (
            <>
              {showAll && (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {rest.map((e) => (
                    <EventRow
                      key={e.id}
                      event={e}
                      editing={editingId === e.id}
                      onRemove={confirmDelete.request}
                      onStartEdit={setEditingId}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveEdit={handleSaveEdit}
                      comments={comments[commentKey("calendar-event", e.id)] ?? []}
                      onAddComment={(tekst) => addComment("calendar-event", e.id, tekst)}
                      onDeleteComment={(commentId, preview) =>
                        confirmCommentDelete.request({ targetType: "calendar-event", targetId: e.id, commentId, preview })
                      }
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
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={`Slette hendelsen «${events.find((e) => e.id === confirmDelete.pending)?.title ?? ""}»?`}
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
