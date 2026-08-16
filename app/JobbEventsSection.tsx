"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_SHELL, CardHeader, ConfirmDialog, SkeletonRows, useConfirmDelete, usePersistedCollapse } from "./CardShell";
import type { JobbEvent } from "@/lib/jobbEvents";
import { localDateString } from "@/lib/payday";
import { vibrate } from "@/lib/haptics";
import SwipeableRow from "./privat/SwipeableRow";
import { CalendarPlus } from "lucide-react";

function formatDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

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
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 outline-none focus:border-line-strong"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
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
        className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
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
    <div className="flex items-center gap-3 rounded-xl border-l-2 border-l-accent bg-accent/8 px-3 py-2">
      <button type="button" onClick={() => onStartEdit(event.id)} className="min-w-0 flex-1 text-left">
        <p className="text-sm text-ink-1">{event.title}</p>
        <p className="mt-0.5 text-2xs text-ink-4">
          {formatDMY(event.date)}
          {event.note ? ` · ${event.note}` : ""}
        </p>
      </button>
      <button
        type="button"
        onClick={() => onRemove(event.id)}
        aria-label="Slett hendelse"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
      >
        ×
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
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Hendelser (Jobb)", true);
  const [events, setEvents] = useState<JobbEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const confirmDelete = useConfirmDelete<string>();

  const load = useCallback(() => {
    fetch("/api/jobb-events")
      .then((r) => r.json())
      .then((d) => setEvents((d.events ?? []) as JobbEvent[]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("mitt-dashboard:jobb-refresh", load);
    return () => window.removeEventListener("mitt-dashboard:jobb-refresh", load);
  }, [load]);

  async function handleAdd() {
    if (!title.trim() || !date || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobb-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, date, note: note.trim() || undefined }),
      });
      if (res.ok) {
        const created: JobbEvent = await res.json();
        setEvents((prev) => [...prev, created]);
        setTitle("");
        setDate("");
        setNote("");
        setShowForm(false);
        window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    vibrate([10, 30, 10]);
    await fetch(`/api/jobb-events/${id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
  }

  async function handleSaveEdit(id: string, updates: { title: string; date: string; note?: string }) {
    const res = await fetch(`/api/jobb-events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: updates.title, date: updates.date, note: updates.note ?? null }),
    });
    if (res.ok) {
      const updated: JobbEvent = await res.json();
      setEvents((prev) => prev.map((e) => (e.id === id ? updated : e)));
      setEditingId(null);
      window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
    }
  }

  const today = localDateString();
  const rows = events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className={`${CARD_SHELL} border-t-2 border-t-emerald-400/60 p-4`}>
      <CardHeader
        title="Hendelser"
        subtitle={rows.length > 0 ? `Neste: ${formatDMY(rows[0].date)}` : "Ingen"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        onAdd={() => setShowForm(true)}
        addLabel="Ny hendelse"
        icon={CalendarPlus}
        iconColorClass="text-emerald-400"
      />
      {!collapsed && (
        <div className="flex flex-col gap-2">
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
                className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
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
                className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
              />
            </div>
          )}

          {loading ? (
            <SkeletonRows count={2} />
          ) : rows.length === 0 ? (
            <p className="text-sm text-ink-3">Ingen kommende hendelser.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {rows.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  editing={editingId === event.id}
                  onRemove={confirmDelete.request}
                  onStartEdit={setEditingId}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={handleSaveEdit}
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
    </div>
  );
}
