"use client";

import { Fragment, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { CARD_SHELL, CardHeader, CollapsibleBody, ConfirmDialog, MutationError, SkeletonRows, useConfirmDelete, useMutationError, usePersistedCollapse } from "../CardShell";
import { CommentBadge, CommentThreadBody } from "../CommentsCell";
import { PartyPopper, X } from "lucide-react";
import { commentKey, useComments } from "../useComments";
import type { Comment } from "@/lib/comments";
import type { EventCategory, LifeEvent, LifeEventRecurrence } from "@/lib/payday";
import { formatDMY, localDateString, nextOccurrence, nextPaydayFrom, relativeDayLabel } from "@/lib/payday";
import { vibrate } from "@/lib/haptics";
import SwipeableRow from "./SwipeableRow";

type DisplayCategory = EventCategory | "lonn";

// Kun én liten fargeprikk per kategori nå (ikke en full radbakgrunn-vask) —
// se ReminderRowContent for samme prinsipp: ikonfarge/prikk er signalet,
// ikke en farget boks rundt hele raden.
const CATEGORY_META: Record<DisplayCategory, { label: string; dot: string }> = {
  lonn: { label: "Lønn", dot: "bg-source-outlook" },
  bursdag: { label: "Bursdag", dot: "bg-status-action" },
  permisjon: { label: "Permisjon", dot: "bg-accent-privat" },
  bolig: { label: "Bolig", dot: "bg-accent" },
  annet: { label: "Annet", dot: "bg-source-teams" },
};

const CATEGORY_OPTIONS: EventCategory[] = ["bursdag", "permisjon", "bolig", "annet"];

const RECURRENCE_OPTIONS: LifeEventRecurrence[] = ["none", "weekly", "monthly", "yearly"];
const RECURRENCE_LABEL: Record<LifeEventRecurrence, string> = {
  none: "Ingen gjentakelse",
  weekly: "Ukentlig",
  monthly: "Månedlig",
  yearly: "Årlig",
};

interface Row {
  key: string;
  title: string;
  occurrence: string;
  category: DisplayCategory;
  recurrence: LifeEventRecurrence;
  event?: LifeEvent;
}

function EventEditForm({
  event,
  onCancel,
  onSave,
}: {
  event: LifeEvent;
  onCancel: () => void;
  onSave: (updates: { title: string; date: string; category: EventCategory; recurrence: LifeEventRecurrence }) => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(event.date);
  const [category, setCategory] = useState<EventCategory>(event.category);
  const [recurrence, setRecurrence] = useState<LifeEventRecurrence>(event.recurrence);

  function save() {
    if (!title.trim() || !date) return;
    onSave({ title: title.trim(), date, category, recurrence });
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
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as EventCategory)}
          className="rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_META[c].label}
            </option>
          ))}
        </select>
        <select
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value as LifeEventRecurrence)}
          className="rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        >
          {RECURRENCE_OPTIONS.map((r) => (
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
  row,
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
  row: Row;
  editing: boolean;
  onRemove: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (
    id: string,
    updates: { title: string; date: string; category: EventCategory; recurrence: LifeEventRecurrence },
  ) => void;
  comments: Comment[];
  onAddComment: (tekst: string) => Promise<boolean>;
  onDeleteComment: (commentId: string, preview: string) => void;
  onToggleCommentRelevance: (commentId: string, ikkeRelevant: boolean) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);

  if (editing && row.event) {
    return <EventEditForm event={row.event} onCancel={onCancelEdit} onSave={(updates) => onSaveEdit(row.event!.id, updates)} />;
  }

  const meta = CATEGORY_META[row.category];
  const content = (
    <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
      <button
        type="button"
        onClick={() => row.event && onStartEdit(row.event.id)}
        disabled={!row.event}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
          <p className="min-w-0 truncate text-sm font-medium text-ink-1">{row.title}</p>
        </div>
        <p className="mt-0.5 pl-3.5 text-2xs text-ink-4">
          {meta.label}
          {row.recurrence !== "none" ? ` · ${RECURRENCE_LABEL[row.recurrence].toLowerCase()}` : ""}
        </p>
      </button>
      {row.event && (
        <>
          <CommentBadge count={comments.length} open={notesOpen} onClick={() => setNotesOpen((v) => !v)} />
          <button
            type="button"
            onClick={() => onRemove(row.event!.id)}
            aria-label="Slett hendelse"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
          >
            <X className="h-4 w-4" />
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
      {notesOpen && <EventNotes comments={comments} onAdd={onAddComment} onDelete={onDeleteComment} onToggleRelevance={onToggleCommentRelevance} />}
    </li>
  );
}

export default function EventsSection() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Hendelser", true);
  const { data, isLoading: loading, mutate: mutateEvents } = useSWR<{ events: LifeEvent[] }>("/api/events", jsonFetcher);
  const events = data?.events ?? [];
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [category, setCategory] = useState<EventCategory>("annet");
  const [recurrence, setRecurrence] = useState<LifeEventRecurrence>("none");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);
  const confirmDelete = useConfirmDelete<string>();
  const mutationError = useMutationError();
  const { comments, addComment, removeComment, toggleRelevance, confirmDelete: confirmCommentDelete } = useComments();

  // Start alltid på 5 synlige hendelser når kortet åpnes på nytt — "+10 til"
  // utvider gradvis i stedet for å vise hele lista med det samme. Avledet
  // direkte i render (ikke useEffect) — det anbefalte React-mønsteret for å
  // reagere på en prop/state-endring uten en ekstra effekt-runde.
  const [prevCollapsed, setPrevCollapsed] = useState(collapsed);
  if (collapsed !== prevCollapsed) {
    setPrevCollapsed(collapsed);
    if (collapsed) setVisibleCount(5);
  }

  async function handleAdd() {
    if (!title.trim() || !date || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, date, category, recurrence }),
      });
      if (!res.ok) {
        mutationError.show("Kunne ikke legge til hendelsen. Prøv igjen.");
        return;
      }
      const created: LifeEvent = await res.json();
      mutateEvents((current) => current && { events: [...current.events, created] }, { revalidate: false });
      if (note.trim()) {
        const ok = await addComment("life-event", created.id, note.trim());
        if (!ok) mutationError.show("Hendelsen ble lagret, men notatet kunne ikke lagres.");
      }
      setTitle("");
      setDate("");
      setCategory("annet");
      setRecurrence("none");
      setNote("");
      setShowForm(false);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutationError.show("Kunne ikke legge til hendelsen. Prøv igjen.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    let previous: LifeEvent[] = [];
    mutateEvents(
      (current) => {
        previous = current?.events ?? [];
        return current && { events: current.events.filter((e) => e.id !== id) };
      },
      { revalidate: false },
    );
    vibrate([10, 30, 10]);
    try {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutateEvents({ events: previous }, { revalidate: false });
      mutationError.show("Kunne ikke slette hendelsen. Prøv igjen.");
    }
  }

  async function handleSaveEdit(
    id: string,
    updates: { title: string; date: string; category: EventCategory; recurrence: LifeEventRecurrence },
  ) {
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("save failed");
      const updated: LifeEvent = await res.json();
      mutateEvents(
        (current) => current && { events: current.events.map((e) => (e.id === id ? updated : e)) },
        { revalidate: false },
      );
      setEditingId(null);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutationError.show("Kunne ikke lagre endringene. Prøv igjen.");
    }
  }

  const today = localDateString();

  const rows: Row[] = [
    {
      key: "lonn",
      title: "Lønningsdag",
      occurrence: nextPaydayFrom(today),
      category: "lonn" as const,
      recurrence: "none" as const,
    },
    ...events
      .filter((e) => e.recurrence !== "none" || e.date >= today)
      .map((e) => ({
        key: e.id,
        title: e.title,
        occurrence: nextOccurrence(e, today),
        category: e.category as DisplayCategory,
        recurrence: e.recurrence,
        event: e,
      })),
  ].sort((a, b) => a.occurrence.localeCompare(b.occurrence));

  function handleAddClick() {
    if (collapsed) toggleCollapsed();
    setShowForm(true);
  }

  const visibleRows = rows.slice(0, visibleCount);

  return (
    <div className={`${CARD_SHELL} border-t-2 border-t-accent-privat/60 p-4`}>
      <CardHeader
        title="Hendelser"
        subtitle={rows.length > 0 ? `Neste: ${formatDMY(rows[0].occurrence)}` : "Ingen"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        onAdd={handleAddClick}
        addLabel="Ny hendelse"
        icon={PartyPopper}
        iconColorClass="text-accent-privat"
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
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") setShowForm(false);
                }}
                placeholder="F.eks. Bursdag: Kari"
                className="rounded-lg border border-transparent bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
              />
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setShowForm(false);
                }}
                placeholder="Notat (valgfritt), f.eks. født i 1998"
                rows={2}
                className="rounded-lg border border-transparent bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
                />
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as EventCategory)}
                  className="rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_META[c].label}
                    </option>
                  ))}
                </select>
                <select
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value as LifeEventRecurrence)}
                  className="rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
                >
                  {RECURRENCE_OPTIONS.map((r) => (
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
          ) : (
            <>
              <ul className="flex flex-col gap-1.5">
                {visibleRows.map((row, i) => {
                  const prevDate = i > 0 ? visibleRows[i - 1].occurrence : null;
                  const showHeader = row.occurrence !== prevDate;
                  return (
                    <Fragment key={row.key}>
                      {showHeader && (
                        <li className="mt-2 first:mt-0">
                          <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">
                            {relativeDayLabel(row.occurrence, today)}
                          </p>
                        </li>
                      )}
                      <EventRow
                        row={row}
                        editing={editingId === row.key}
                        onRemove={confirmDelete.request}
                        onStartEdit={setEditingId}
                        onCancelEdit={() => setEditingId(null)}
                        onSaveEdit={handleSaveEdit}
                        comments={row.event ? comments[commentKey("life-event", row.event.id)] ?? [] : []}
                        onAddComment={(tekst) => (row.event ? addComment("life-event", row.event.id, tekst) : Promise.resolve(false))}
                        onDeleteComment={(commentId, preview) =>
                          row.event &&
                          confirmCommentDelete.request({ targetType: "life-event", targetId: row.event.id, commentId, preview })
                        }
                        onToggleCommentRelevance={(commentId, ikkeRelevant) =>
                          row.event && toggleRelevance("life-event", row.event.id, commentId, ikkeRelevant)
                        }
                      />
                    </Fragment>
                  );
                })}
              </ul>
              {rows.length > visibleCount && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((v) => v + 10)}
                  className="self-start text-xs font-medium text-ink-3 hover:text-ink-1"
                >
                  +10 til
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
