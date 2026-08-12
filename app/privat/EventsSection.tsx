"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_SHELL, CardHeader, ConfirmDialog, SkeletonRows, useConfirmDelete, usePersistedCollapse } from "../CardShell";
import { CommentBadge, CommentThreadBody } from "../CommentsCell";
import { PartyPopper } from "lucide-react";
import { commentKey, useComments } from "../useComments";
import type { Comment } from "@/lib/comments";
import type { EventCategory, LifeEvent } from "@/lib/payday";
import { localDateString, nextOccurrence, nextPaydayFrom } from "@/lib/payday";
import { vibrate } from "@/lib/haptics";
import SwipeableRow from "./SwipeableRow";

type DisplayCategory = EventCategory | "lonn";

const CATEGORY_META: Record<DisplayCategory, { label: string; bg: string; text: string }> = {
  lonn: { label: "Lønn", bg: "bg-source-outlook/8", text: "text-source-outlook" },
  bursdag: { label: "Bursdag", bg: "bg-status-action/8", text: "text-status-action" },
  permisjon: { label: "Permisjon", bg: "bg-accent-privat/8", text: "text-accent-privat" },
  bolig: { label: "Bolig", bg: "bg-accent/8", text: "text-accent" },
  annet: { label: "Annet", bg: "bg-source-teams/8", text: "text-source-teams" },
};

const CATEGORY_OPTIONS: EventCategory[] = ["bursdag", "permisjon", "bolig", "annet"];

function formatDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

interface Row {
  key: string;
  title: string;
  occurrence: string;
  category: DisplayCategory;
  yearly: boolean;
  event?: LifeEvent;
}

function EventEditForm({
  event,
  onCancel,
  onSave,
}: {
  event: LifeEvent;
  onCancel: () => void;
  onSave: (updates: { title: string; date: string; category: EventCategory; yearly: boolean }) => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(event.date);
  const [category, setCategory] = useState<EventCategory>(event.category);
  const [yearly, setYearly] = useState(event.yearly);

  function save() {
    if (!title.trim() || !date) return;
    onSave({ title: title.trim(), date, category, yearly });
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
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as EventCategory)}
          className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_META[c].label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-ink-3">
          <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} />
          Årlig
        </label>
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
  row,
  editing,
  onRemove,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  comments,
  onAddComment,
  onDeleteComment,
}: {
  row: Row;
  editing: boolean;
  onRemove: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, updates: { title: string; date: string; category: EventCategory; yearly: boolean }) => void;
  comments: Comment[];
  onAddComment: (tekst: string) => void;
  onDeleteComment: (commentId: string, preview: string) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);

  if (editing && row.event) {
    return <EventEditForm event={row.event} onCancel={onCancelEdit} onSave={(updates) => onSaveEdit(row.event!.id, updates)} />;
  }

  const meta = CATEGORY_META[row.category];
  const content = (
    <div className={`flex items-center gap-3 rounded-xl ${meta.bg} px-3 py-2`}>
      <button
        type="button"
        onClick={() => row.event && onStartEdit(row.event.id)}
        disabled={!row.event}
        className="min-w-0 flex-1 text-left"
      >
        <p className="text-sm text-ink-1">{row.title}</p>
        <p className="mt-0.5 text-2xs text-ink-4">
          {formatDMY(row.occurrence)}
          {row.yearly ? " · årlig" : ""} · {meta.label}
        </p>
      </button>
      {row.event && (
        <>
          <CommentBadge count={comments.length} open={notesOpen} onClick={() => setNotesOpen((v) => !v)} />
          <button
            type="button"
            onClick={() => onRemove(row.event!.id)}
            aria-label="Slett hendelse"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
          >
            ×
          </button>
        </>
      )}
    </div>
  );

  if (!row.event) return <li>{content}</li>;

  return (
    <li>
      <SwipeableRow onSwipeLeft={() => onRemove(row.event!.id)} leftLabel="Slett">
        {content}
      </SwipeableRow>
      {notesOpen && <EventNotes comments={comments} onAdd={onAddComment} onDelete={onDeleteComment} />}
    </li>
  );
}

export default function EventsSection() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Hendelser", true);
  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [category, setCategory] = useState<EventCategory>("annet");
  const [yearly, setYearly] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const confirmDelete = useConfirmDelete<string>();
  const { comments, addComment, removeComment, confirmDelete: confirmCommentDelete } = useComments();

  const load = useCallback(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((d) => setEvents((d.events ?? []) as LifeEvent[]))
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
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, date, category, yearly }),
      });
      if (res.ok) {
        const created: LifeEvent = await res.json();
        setEvents((prev) => [...prev, created]);
        setTitle("");
        setDate("");
        setCategory("annet");
        setYearly(false);
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
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
  }

  async function handleSaveEdit(
    id: string,
    updates: { title: string; date: string; category: EventCategory; yearly: boolean },
  ) {
    const res = await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated: LifeEvent = await res.json();
      setEvents((prev) => prev.map((e) => (e.id === id ? updated : e)));
      setEditingId(null);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  const today = localDateString();

  const rows: Row[] = [
    {
      key: "lonn",
      title: "Lønningsdag",
      occurrence: nextPaydayFrom(today),
      category: "lonn" as const,
      yearly: false,
    },
    ...events
      .filter((e) => e.yearly || e.date >= today)
      .map((e) => ({
        key: e.id,
        title: e.title,
        occurrence: nextOccurrence(e, today),
        category: e.category as DisplayCategory,
        yearly: e.yearly,
        event: e,
      })),
  ].sort((a, b) => a.occurrence.localeCompare(b.occurrence));

  function handleAddClick() {
    if (collapsed) toggleCollapsed();
    setShowForm(true);
  }

  return (
    <div className={`${CARD_SHELL} !border-2 !border-status-danger p-4`}>
      <CardHeader
        title="Hendelser"
        subtitle={rows.length > 0 ? `Neste: ${formatDMY(rows[0].occurrence)}` : "Ingen"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        onAdd={handleAddClick}
        addLabel="Ny hendelse"
        icon={PartyPopper}
        iconColorClass="text-status-danger"
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
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") setShowForm(false);
                }}
                placeholder="F.eks. Bursdag: Kari"
                className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
                />
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as EventCategory)}
                  className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_META[c].label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-ink-3">
                  <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} />
                  Årlig
                </label>
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
          ) : (
            <ul className="flex flex-col gap-1.5">
              {rows.map((row) => (
                <EventRow
                  key={row.key}
                  row={row}
                  editing={editingId === row.key}
                  onRemove={confirmDelete.request}
                  onStartEdit={setEditingId}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={handleSaveEdit}
                  comments={row.event ? comments[commentKey("life-event", row.event.id)] ?? [] : []}
                  onAddComment={(tekst) => row.event && addComment("life-event", row.event.id, tekst)}
                  onDeleteComment={(commentId, preview) =>
                    row.event &&
                    confirmCommentDelete.request({ targetType: "life-event", targetId: row.event.id, commentId, preview })
                  }
                />
              ))}
            </ul>
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
