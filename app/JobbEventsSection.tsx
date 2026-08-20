"use client";

import { Fragment, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { CardHeader, ConfirmDialog, MutationError, SkeletonRows, SuggestionList, useConfirmDelete, useMutationError } from "./CardShell";
import type { JobbEvent } from "@/lib/jobbEvents";
import type { Suggestion } from "@/lib/jobbSuggestions";
import { formatDMY, localDateString, relativeDayLabel } from "@/lib/payday";
import { vibrate } from "@/lib/haptics";
import SwipeableRow from "./privat/SwipeableRow";
import { CalendarPlus, X } from "lucide-react";

function EventEditForm({
  event,
  onCancel,
  onSave,
}: {
  event: JobbEvent;
  onCancel: () => void;
  onSave: (updates: { title: string; date: string; note?: string }) => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(event.date);
  const [note, setNote] = useState(event.note ?? "");

  function save() {
    if (!title.trim() || !date) return;
    onSave({ title: title.trim(), date, note: note.trim() || undefined });
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
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!title.trim() || !date}
          className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Notat (valgfritt)"
        className="rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
      />
    </li>
  );
}

function EventRow({
  event,
  editing,
  onRemove,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}: {
  event: JobbEvent;
  editing: boolean;
  onRemove: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, updates: { title: string; date: string; note?: string }) => void;
}) {
  if (editing) {
    return <EventEditForm event={event} onCancel={onCancelEdit} onSave={(updates) => onSaveEdit(event.id, updates)} />;
  }

  const content = (
    <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
      <button type="button" onClick={() => onStartEdit(event.id)} className="min-w-0 flex-1 text-left">
        <p className="min-w-0 truncate text-sm font-medium text-ink-1">{event.title}</p>
        {event.note && <p className="mt-0.5 text-2xs text-ink-4">{event.note}</p>}
      </button>
      <button
        type="button"
        onClick={() => onRemove(event.id)}
        aria-label="Slett hendelse"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <li>
      <SwipeableRow onSwipeLeft={() => onRemove(event.id)} leftLabel="Slett">
        {content}
      </SwipeableRow>
    </li>
  );
}

export default function JobbEventsSection() {
  const { data, isLoading: loading, mutate: mutateEvents } = useSWR<{ events: JobbEvent[] }>("/api/jobb-events", jsonFetcher);
  const events = data?.events ?? [];
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const confirmDelete = useConfirmDelete<string>();
  const mutationError = useMutationError();
  const { data: suggestionData, mutate: mutateSuggestions } = useSWR<{ suggestions: Suggestion[] }>(
    "/api/jobb-suggestions",
    jsonFetcher,
  );
  const suggestions = (suggestionData?.suggestions ?? []).filter((s) => s.target === "event");

  async function handleAcceptSuggestion(s: Suggestion) {
    mutateSuggestions(
      (current) => current && { suggestions: current.suggestions.filter((x) => x.id !== s.id) },
      { revalidate: false },
    );
    const res = await fetch("/api/jobb-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: s.title, date: s.date || localDateString(), note: s.note }),
    });
    if (res.ok) {
      const created: JobbEvent = await res.json();
      mutateEvents((current) => current && { events: [...current.events, created] }, { revalidate: false });
      window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
    }
    await fetch(`/api/jobb-suggestions/${s.id}`, { method: "DELETE" });
  }

  async function handleDeclineSuggestion(s: Suggestion) {
    mutateSuggestions(
      (current) => current && { suggestions: current.suggestions.filter((x) => x.id !== s.id) },
      { revalidate: false },
    );
    await fetch(`/api/jobb-suggestions/${s.id}`, { method: "DELETE" });
  }

  async function handleAdd() {
    if (!title.trim() || !date || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobb-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, date, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        mutationError.show("Kunne ikke legge til hendelsen. Prøv igjen.");
        return;
      }
      const created: JobbEvent = await res.json();
      mutateEvents((current) => current && { events: [...current.events, created] }, { revalidate: false });
      setTitle("");
      setDate("");
      setNote("");
      setShowForm(false);
      window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
    } catch {
      mutationError.show("Kunne ikke legge til hendelsen. Prøv igjen.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    let previous: JobbEvent[] = [];
    mutateEvents(
      (current) => {
        previous = current?.events ?? [];
        return current && { events: current.events.filter((e) => e.id !== id) };
      },
      { revalidate: false },
    );
    vibrate([10, 30, 10]);
    try {
      const res = await fetch(`/api/jobb-events/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
    } catch {
      mutateEvents({ events: previous }, { revalidate: false });
      mutationError.show("Kunne ikke slette hendelsen. Prøv igjen.");
    }
  }

  async function handleSaveEdit(id: string, updates: { title: string; date: string; note?: string }) {
    try {
      const res = await fetch(`/api/jobb-events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: updates.title, date: updates.date, note: updates.note ?? null }),
      });
      if (!res.ok) throw new Error("save failed");
      const updated: JobbEvent = await res.json();
      mutateEvents(
        (current) => current && { events: current.events.map((e) => (e.id === id ? updated : e)) },
        { revalidate: false },
      );
      setEditingId(null);
      window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
    } catch {
      mutationError.show("Kunne ikke lagre endringene. Prøv igjen.");
    }
  }

  const today = localDateString();
  const rows = events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="border-t-2 border-t-emerald-400/60 p-4">
      <CardHeader
        title="Hendelser"
        subtitle={rows.length > 0 ? `Neste: ${formatDMY(rows[0].date)}` : "Ingen"}
        onAdd={() => setShowForm(true)}
        addLabel="Ny hendelse"
        icon={CalendarPlus}
        iconColorClass="text-emerald-400"
      />
      <div className="flex flex-col gap-2">
          <MutationError message={mutationError.message} />
          <SuggestionList suggestions={suggestions} onAccept={handleAcceptSuggestion} onDecline={handleDeclineSuggestion} />
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
                placeholder="F.eks. Åpning av ny butikk"
                className="rounded-lg border border-transparent bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
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
                  className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent/85 disabled:opacity-40"
                >
                  Legg til
                </button>
              </div>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Notat (valgfritt)"
                className="rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
              />
            </div>
          )}

          {loading ? (
            <SkeletonRows count={2} />
          ) : rows.length === 0 ? (
            <p className="text-sm text-ink-3">Ingen kommende hendelser.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {rows.map((event, i) => {
                const prevDate = i > 0 ? rows[i - 1].date : null;
                const showHeader = event.date !== prevDate;
                return (
                  <Fragment key={event.id}>
                    {showHeader && (
                      <li className="mt-2 first:mt-0">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">
                          {relativeDayLabel(event.date, today)}
                        </p>
                      </li>
                    )}
                    <EventRow
                      event={event}
                      editing={editingId === event.id}
                      onRemove={confirmDelete.request}
                      onStartEdit={setEditingId}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveEdit={handleSaveEdit}
                    />
                  </Fragment>
                );
              })}
            </ul>
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
    </div>
  );
}
