"use client";

import { Fragment, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { CardHeader, CollapsibleBody, ConfirmDialog, MutationError, SkeletonRows, useConfirmDelete, useMutationError, usePersistedCollapse } from "../CardShell";
import { CommentBadge, CommentThreadBody } from "../CommentsCell";
import { commentKey, useComments } from "../useComments";
import type { Comment } from "@/lib/comments";
import type { PrivatCalendarEvent } from "@/lib/privatCalendar";
import { vibrate } from "@/lib/haptics";
import { localDateString, relativeDayLabel } from "@/lib/payday";
import SwipeableRow from "./SwipeableRow";
import { Calendar, X } from "lucide-react";

function EventEditForm({
  event,
  onCancel,
  onSave,
}: {
  event: PrivatCalendarEvent;
  onCancel: () => void;
  onSave: (updates: { title: string; date: string; startTime?: string; endTime?: string; location?: string }) => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(event.date);
  const [startTime, setStartTime] = useState(event.startTime ?? "");
  const [endTime, setEndTime] = useState(event.endTime ?? "");
  const [location, setLocation] = useState(event.location ?? "");

  function save() {
    if (!title.trim() || !date) return;
    onSave({
      title: title.trim(),
      date,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      location: location.trim() || undefined,
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className="rounded-lg border border-transparent bg-surface-1 px-3 py-2 text-sm text-ink-1 outline-none focus:border-line-strong"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        />
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        />
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        />
      </div>
      <input
        type="text"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="Sted..."
        className="rounded-lg border border-transparent bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <div className="flex items-center gap-2">
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
  onToggleRelevance,
}: {
  comments: Comment[];
  onAdd: (tekst: string) => Promise<boolean>;
  onDelete: (commentId: string, preview: string) => void;
  onToggleRelevance: (commentId: string, ikkeRelevant: boolean) => void;
}) {
  return (
    <div className="mt-1.5 border-l-2 border-line py-0.5 pl-3">
      <CommentThreadBody comments={comments} onAdd={onAdd} onDelete={onDelete} onToggleRelevance={onToggleRelevance} accentClassName="bg-accent-privat hover:bg-accent-privat/85" />
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
  onToggleCommentRelevance,
}: {
  event: PrivatCalendarEvent;
  editing: boolean;
  onRemove: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (
    id: string,
    updates: { title: string; date: string; startTime?: string; endTime?: string; location?: string },
  ) => void;
  comments: Comment[];
  onAddComment: (tekst: string) => Promise<boolean>;
  onDeleteComment: (commentId: string, preview: string) => void;
  onToggleCommentRelevance: (commentId: string, ikkeRelevant: boolean) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);

  if (editing) {
    return (
      <EventEditForm event={event} onCancel={onCancelEdit} onSave={(updates) => onSaveEdit(event.id, updates)} />
    );
  }

  const hasMeta = event.startTime || event.endTime || event.location || event.note;

  return (
    <li>
      <SwipeableRow onSwipeLeft={() => onRemove(event.id)} leftLabel="Slett">
        <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
          <button
            type="button"
            onClick={() => onStartEdit(event.id)}
            aria-label="Rediger hendelse"
            className="min-w-0 flex-1 text-left"
          >
            <p className="min-w-0 truncate text-sm font-medium text-ink-1">{event.title}</p>
            {hasMeta && (
              <p className="mt-0.5 text-2xs text-ink-4">
                {event.startTime ? event.startTime : ""}
                {event.endTime ? `–${event.endTime}` : ""}
                {event.location ? ` · ${event.location}` : ""}
                {event.note ? ` — ${event.note}` : ""}
              </p>
            )}
          </button>
          <CommentBadge count={comments.length} open={notesOpen} onClick={() => setNotesOpen((v) => !v)} />
          <button
            type="button"
            onClick={() => onRemove(event.id)}
            aria-label="Slett hendelse"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </SwipeableRow>
      {notesOpen && <EventNotes comments={comments} onAdd={onAddComment} onDelete={onDeleteComment} onToggleRelevance={onToggleCommentRelevance} />}
    </li>
  );
}

export default function CalendarSection({ defaultExpanded = false }: { defaultExpanded?: boolean } = {}) {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Privat kalender", !defaultExpanded);
  const { data, isLoading: loading, mutate: mutateEvents } = useSWR<{ events: PrivatCalendarEvent[] }>(
    "/api/privat-calendar",
    jsonFetcher,
  );
  const events = data?.events ?? [];
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const confirmDelete = useConfirmDelete<string>();
  const mutationError = useMutationError();
  const { comments, addComment, removeComment, toggleRelevance, confirmDelete: confirmCommentDelete } = useComments();
  const [visibleCount, setVisibleCount] = useState(10);

  function sortEvents(list: PrivatCalendarEvent[]): PrivatCalendarEvent[] {
    return [...list].sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  }

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
          location: location.trim() || undefined,
        }),
      });
      if (!res.ok) {
        mutationError.show("Kunne ikke legge til hendelsen. Prøv igjen.");
        return;
      }
      const created: PrivatCalendarEvent = await res.json();
      mutateEvents((current) => current && { events: sortEvents([...current.events, created]) }, { revalidate: false });
      setTitle("");
      setDate("");
      setStartTime("");
      setEndTime("");
      setLocation("");
      setShowForm(false);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutationError.show("Kunne ikke legge til hendelsen. Prøv igjen.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    let previous: PrivatCalendarEvent[] = [];
    mutateEvents(
      (current) => {
        previous = current?.events ?? [];
        return current && { events: current.events.filter((e) => e.id !== id) };
      },
      { revalidate: false },
    );
    vibrate([10, 30, 10]);
    try {
      const res = await fetch(`/api/privat-calendar/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutateEvents({ events: previous }, { revalidate: false });
      mutationError.show("Kunne ikke slette hendelsen. Prøv igjen.");
    }
  }

  async function handleSaveEdit(
    id: string,
    updates: { title: string; date: string; startTime?: string; endTime?: string; location?: string },
  ) {
    try {
      const res = await fetch(`/api/privat-calendar/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: updates.title,
          date: updates.date,
          startTime: updates.startTime ?? null,
          endTime: updates.endTime ?? null,
          location: updates.location ?? null,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      const updated: PrivatCalendarEvent = await res.json();
      mutateEvents(
        (current) => current && { events: sortEvents(current.events.map((e) => (e.id === id ? updated : e))) },
        { revalidate: false },
      );
      setEditingId(null);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutationError.show("Kunne ikke lagre endringene. Prøv igjen.");
    }
  }

  const today = localDateString();
  const upcoming = events.filter((e) => e.date >= today);
  const todays = upcoming.filter((e) => e.date === today);
  const rest = upcoming.filter((e) => e.date !== today);
  const visibleRest = rest.slice(0, visibleCount);

  function handleAddClick() {
    if (collapsed) toggleCollapsed();
    setShowForm(true);
  }

  return (
    <div className="border-t-2 border-t-source-teams/60 p-4">
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
      <CollapsibleBody collapsed={collapsed}>
        <div className="flex flex-col gap-2">
          <MutationError message={mutationError.message} />
          {showForm && (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-2.5">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setShowForm(false);
                }}
                placeholder="Tittel..."
                className="rounded-lg border border-transparent bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
                />
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
                />
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
                />
              </div>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Sted..."
                className="rounded-lg border border-transparent bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
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
                  disabled={!title.trim() || !date || submitting}
                  className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
                >
                  Legg til
                </button>
              </div>
            </div>
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
                  onToggleCommentRelevance={(commentId, ikkeRelevant) => toggleRelevance("calendar-event", e.id, commentId, ikkeRelevant)}
                />
              ))}
            </ul>
          )}

          {rest.length > 0 && (
            <>
              <ul className="mt-1 flex flex-col gap-1.5">
                {visibleRest.map((e, i) => {
                  const prevDate = i > 0 ? visibleRest[i - 1].date : null;
                  const showHeader = e.date !== prevDate;
                  return (
                    <Fragment key={e.id}>
                      {showHeader && (
                        <li className="mt-2 first:mt-0">
                          <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">
                            {relativeDayLabel(e.date, today)}
                          </p>
                        </li>
                      )}
                      <EventRow
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
                        onToggleCommentRelevance={(commentId, ikkeRelevant) => toggleRelevance("calendar-event", e.id, commentId, ikkeRelevant)}
                      />
                    </Fragment>
                  );
                })}
              </ul>
              {rest.length > visibleCount && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((v) => v + 10)}
                  className="mt-1 text-left text-xs font-medium text-ink-3 hover:text-ink-1"
                >
                  {`Mer (${rest.length - visibleCount})`}
                </button>
              )}
            </>
          )}
        </div>
      </CollapsibleBody>
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
