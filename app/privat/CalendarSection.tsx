"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { CardHeader, ConfirmDialog, MutationError, SkeletonRows, useConfirmDelete, useMutationError } from "../CardShell";
import { DayAxis } from "./DataStrips";
import { CommentBadge, CommentThreadBody } from "../CommentsCell";
import { commentKey, useComments } from "../useComments";
import type { Comment } from "@/lib/comments";
import type { PrivatCalendarEvent } from "@/lib/privatCalendar";
import { vibrate } from "@/lib/haptics";
import { addDaysIso, localDateString, relativeDayLabel, weekRangeContaining } from "@/lib/payday";
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
  onCreateReminder,
}: {
  comments: Comment[];
  onAdd: (tekst: string) => Promise<boolean>;
  onDelete: (commentId: string, preview: string) => void;
  onToggleRelevance: (commentId: string, ikkeRelevant: boolean) => void;
  onCreateReminder: (comment: Comment) => void;
}) {
  return (
    <div className="mt-1.5 border-l-2 border-line py-0.5 pl-3">
      <CommentThreadBody
        comments={comments}
        onAdd={onAdd}
        onDelete={onDelete}
        onToggleRelevance={onToggleRelevance}
        onCreateReminder={onCreateReminder}
        accentClassName="bg-accent-privat hover:bg-accent-privat/85"
      />
    </div>
  );
}

function EventRow({
  event,
  editing,
  dayLabel,
  highlighted,
  setRowRef,
  onRemove,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  comments,
  onAddComment,
  onDeleteComment,
  onToggleCommentRelevance,
  onCreateReminder,
}: {
  event: PrivatCalendarEvent;
  editing: boolean;
  // Dag+hendelse på samme linje (f.eks. "I dag ·"/"Fre 21.08 ·") i stedet
  // for en egen overskriftslinje per dato — se runde 2 sin uke-inndeling.
  dayLabel?: string;
  // Kort visuell markering (~2-3 sek) etter at man har hoppet hit fra en
  // lenket påminnelse i Påminnelser — se PrivatPanel sin highlightTarget.
  highlighted?: boolean;
  setRowRef?: (id: string, el: HTMLLIElement | null) => void;
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
  onCreateReminder: (comment: Comment) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);

  if (editing) {
    return (
      <EventEditForm event={event} onCancel={onCancelEdit} onSave={(updates) => onSaveEdit(event.id, updates)} />
    );
  }

  const hasSubMeta = event.location || event.note;

  return (
    <li ref={setRowRef ? (el) => setRowRef(event.id, el) : undefined}>
      <SwipeableRow onSwipeLeft={() => onRemove(event.id)} leftLabel="Slett">
        <div
          className={`flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 transition ${
            highlighted ? "ring-2 ring-accent-privat" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => onStartEdit(event.id)}
            aria-label="Rediger hendelse"
            className="flex min-w-0 flex-1 items-start gap-3 text-left"
          >
            {/* Fast bredde slik at alle titler starter på samme x-posisjon
                uansett dag-tekstens lengde ("I dag" vs. "Fre 21.08 · 14:00"). */}
            <div className="w-28 shrink-0 pt-0.5 text-2xs font-semibold tabular-nums text-ink-2">
              {dayLabel}
              {event.startTime ? ` · ${event.startTime}` : ""}
            </div>
            <div className="min-w-0 flex-1">
              <p className="min-w-0 truncate text-sm font-medium text-ink-1">{event.title}</p>
              {hasSubMeta && (
                <p className="mt-0.5 text-2xs text-ink-4">
                  {event.location ? event.location : ""}
                  {event.location && event.note ? " — " : ""}
                  {event.note ? event.note : ""}
                </p>
              )}
            </div>
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
      {notesOpen && (
        <EventNotes
          comments={comments}
          onAdd={onAddComment}
          onDelete={onDeleteComment}
          onToggleRelevance={onToggleCommentRelevance}
          onCreateReminder={onCreateReminder}
        />
      )}
    </li>
  );
}

export default function CalendarSection({
  highlightEventId,
  onHighlightHandled,
}: {
  // Satt av PrivatPanel når man hopper hit fra en påminnelse lenket til en
  // kalenderhendelse — skroller til og fremhever raden midlertidig.
  highlightEventId?: string | null;
  onHighlightHandled?: () => void;
} = {}) {
  const { data, isLoading: loading, mutate: mutateEvents } = useSWR<{ events: PrivatCalendarEvent[] }>(
    "/api/privat-calendar",
    jsonFetcher,
  );
  const events = data?.events ?? [];
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(localDateString());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const confirmDelete = useConfirmDelete<string>();
  const mutationError = useMutationError();
  const { comments, addComment, removeComment, toggleRelevance, confirmDelete: confirmCommentDelete } = useComments();
  const [visibleCount, setVisibleCount] = useState(10);
  const [showRecentlyPast, setShowRecentlyPast] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  // "Nå"-streken på døgnaksen. Klokkeslettet leses i en effekt og ikke under
  // render — `new Date()` i render er urent og feiler React Compiler. Ticker
  // hvert minutt, så streken flytter seg mens kortet står åpent.
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  useEffect(() => {
    function tick() {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  function setRowRef(id: string, el: HTMLLIElement | null) {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  }

  async function handleCreateReminderFromComment(comment: Comment, event: PrivatCalendarEvent) {
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: comment.tekst,
          linkedTo: { targetType: "calendar-event", targetId: event.id, label: event.title },
        }),
      });
      if (!res.ok) throw new Error("create reminder failed");
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutationError.show("Kunne ikke lage påminnelse fra kommentaren. Prøv igjen.");
    }
  }

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
      setDate(localDateString());
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
  // Tre bøtter i stedet for bare "i dag"/"resten" — mer fokus på det som
  // faktisk er nært i tid, mindre fremtredende lenger frem.
  const { end: thisWeekEnd } = weekRangeContaining(today);
  const { end: nextWeekEnd } = weekRangeContaining(addDaysIso(thisWeekEnd, 1));
  const thisWeek = upcoming.filter((e) => e.date <= thisWeekEnd);
  const nextWeek = upcoming.filter((e) => e.date > thisWeekEnd && e.date <= nextWeekEnd);
  const later = upcoming.filter((e) => e.date > nextWeekEnd);
  const visibleLater = later.slice(0, visibleCount);
  // Nylig passerte hendelser (siste 14 dager) — kalenderhendelser har ingen
  // "fullført"-status som påminnelser, så "nylig" er rent dato-basert i
  // stedet for et 24-timers angre-vindu. Skjult bak en knapp per default,
  // samme mønster som "Nylig fullført" i Påminnelser.
  const recentlyPast = events
    .filter((e) => e.date < today && e.date >= addDaysIso(today, -14))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.startTime ?? "").localeCompare(a.startTime ?? ""));

  // Døgnaksen over lista. `startTime` er et VALGFRITT felt på en
  // kalenderhendelse, så heldagshendelser har ingen posisjon å tegne på —
  // de telles opp separat i stedet for å bli gjettet inn på aksen.
  const todaysEvents = events.filter((e) => e.date === today);
  const todaysTimes = todaysEvents.map((e) => e.startTime).filter((t): t is string => !!t);
  const todaysAllDayCount = todaysEvents.length - todaysTimes.length;

  // Skroller til og fremhever raden når man hopper hit fra en lenket
  // påminnelse. Hvis raden ligger bak "Fremover"-paginering, bumpes
  // visibleCount først — effekten kjører på nytt (visibleCount er en
  // dependency) og finner da raden i DOM-en.
  useEffect(() => {
    if (!highlightEventId) return;
    const laterIdx = later.findIndex((e) => e.id === highlightEventId);
    if (laterIdx !== -1 && laterIdx >= visibleCount) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisibleCount(laterIdx + 1);
      return;
    }
    const node = rowRefs.current.get(highlightEventId);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(highlightEventId);
    const t = setTimeout(() => {
      setHighlightedId(null);
      onHighlightHandled?.();
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightEventId, visibleCount, later.length]);

  function handleAddClick() {
    setShowForm(true);
  }

  return (
    <div className="border-t-2 border-t-source-teams/60 p-4">
      <CardHeader
        title="Kalender"
        stat={{ value: todaysEvents.length, label: "i dag" }}
        subtitle={thisWeek.length > 0 ? `${thisWeek.length} denne uken` : undefined}
        onAdd={handleAddClick}
        addLabel="Ny kalenderhendelse"
        icon={Calendar}
        iconColorClass="text-source-teams"
      />
      <div className="flex flex-col gap-2">
        <MutationError message={mutationError.message} />
        {!loading && todaysEvents.length > 0 && (
          <div className="flex flex-col gap-1">
            <DayAxis
              times={todaysTimes}
              allDayCount={todaysAllDayCount}
              nowMinutes={nowMinutes}
              colorClass="text-source-teams"
            />
            {thisWeek.length > 0 && (
              <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-ink-4">
                {thisWeek.length} denne uken
              </p>
            )}
          </div>
        )}
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
          ) : (
            <>
              {upcoming.length === 0 && <p className="text-sm text-ink-3">Ingen kommende hendelser.</p>}
              {thisWeek.length > 0 && (
                <div>
                  <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-2">Denne uken</p>
                  <ul className="flex flex-col gap-1.5">
                    {thisWeek.map((e) => (
                      <EventRow
                        key={e.id}
                        event={e}
                        dayLabel={relativeDayLabel(e.date, today)}
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
                        onCreateReminder={(comment) => handleCreateReminderFromComment(comment, e)}
                        highlighted={highlightedId === e.id}
                        setRowRef={setRowRef}
                      />
                    ))}
                  </ul>
                </div>
              )}

              {nextWeek.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-3">Neste uke</p>
                  <ul className="flex flex-col gap-1.5 opacity-90">
                    {nextWeek.map((e) => (
                      <EventRow
                        key={e.id}
                        event={e}
                        dayLabel={relativeDayLabel(e.date, today)}
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
                        onCreateReminder={(comment) => handleCreateReminderFromComment(comment, e)}
                        highlighted={highlightedId === e.id}
                        setRowRef={setRowRef}
                      />
                    ))}
                  </ul>
                </div>
              )}

              {later.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-4">Fremover</p>
                  <ul className="flex flex-col gap-1.5 opacity-75">
                    {visibleLater.map((e) => (
                      <EventRow
                        key={e.id}
                        event={e}
                        dayLabel={relativeDayLabel(e.date, today)}
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
                        onCreateReminder={(comment) => handleCreateReminderFromComment(comment, e)}
                        highlighted={highlightedId === e.id}
                        setRowRef={setRowRef}
                      />
                    ))}
                  </ul>
                  {later.length > visibleCount && (
                    <button
                      type="button"
                      onClick={() => setVisibleCount((v) => v + 10)}
                      className="mt-1 text-left text-xs font-medium text-ink-3 hover:text-ink-1"
                    >
                      {`Mer (${later.length - visibleCount})`}
                    </button>
                  )}
                </div>
              )}

              {recentlyPast.length > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowRecentlyPast((v) => !v)}
                    className="text-left text-xs font-medium text-ink-3 hover:text-ink-1"
                  >
                    {showRecentlyPast ? "Skjul nylig passerte" : `Nylig passerte (${recentlyPast.length})`}
                  </button>
                  {showRecentlyPast && (
                    <ul className="mt-1 flex flex-col gap-1.5 opacity-75">
                      {recentlyPast.map((e) => (
                        <EventRow
                          key={e.id}
                          event={e}
                          dayLabel={relativeDayLabel(e.date, today)}
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
                          onCreateReminder={(comment) => handleCreateReminderFromComment(comment, e)}
                          highlighted={highlightedId === e.id}
                          setRowRef={setRowRef}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
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
        message={confirmCommentDelete.pending ? `Slette kommentaren «${confirmCommentDelete.pending.preview}»?` : ""}
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
