"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_SHELL, CardHeader, usePersistedCollapse } from "../CardShell";
import type { PrivatCalendarEvent } from "@/lib/privatCalendar";

function formatDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function EventRow({ event, onRemove }: { event: PrivatCalendarEvent; onRemove: (id: string) => void }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-1">{event.title}</p>
        <p className="mt-0.5 text-2xs text-ink-4">
          {formatDMY(event.date)}
          {event.startTime ? ` ${event.startTime}` : ""}
          {event.endTime ? `–${event.endTime}` : ""}
          {event.note ? ` — ${event.note}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onRemove(event.id)}
        aria-label="Slett hendelse"
        className="shrink-0 text-ink-4 hover:text-rose-400"
      >
        ×
      </button>
    </li>
  );
}

export default function CalendarSection() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Privat kalender");
  const [events, setEvents] = useState<PrivatCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
        window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    await fetch(`/api/privat-calendar/${id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.date >= today);
  const todays = upcoming.filter((e) => e.date === today);
  const rest = upcoming.filter((e) => e.date !== today);

  return (
    <div className={`${CARD_SHELL} p-4`}>
      <CardHeader
        title="Kalender"
        subtitle={todays.length > 0 ? `${todays.length} i dag` : "Ingen i dag"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {!collapsed && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-2.5">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
                onClick={handleAdd}
                disabled={!title.trim() || !date || submitting}
                className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-2xs font-semibold uppercase text-white transition hover:bg-accent/85 disabled:opacity-40"
              >
                Legg til
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-ink-3">Laster…</p>
          ) : todays.length === 0 ? (
            <p className="text-sm text-ink-3">Ingen hendelser i dag.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {todays.map((e) => (
                <EventRow key={e.id} event={e} onRemove={handleRemove} />
              ))}
            </ul>
          )}

          {rest.length > 0 && (
            <>
              {showAll && (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {rest.map((e) => (
                    <EventRow key={e.id} event={e} onRemove={handleRemove} />
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
        </div>
      )}
    </div>
  );
}
