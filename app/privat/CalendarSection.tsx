"use client";

import { useCallback, useEffect, useState } from "react";
import { CollapsibleSection } from "./SportSection";
import type { PrivatCalendarEvent } from "@/lib/privatCalendar";

const ACCENT = "var(--ds-vm)";

export default function CalendarSection() {
  const [events, setEvents] = useState<PrivatCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
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
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    await fetch(`/api/privat-calendar/${id}`, { method: "DELETE" });
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.date >= today);

  return (
    <CollapsibleSection
      accent={ACCENT}
      title="Kalender"
      defaultOpen={false}
      count={upcoming.length > 0 ? `${upcoming.length} kommende` : undefined}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 rounded-xl p-2.5" style={{ background: "rgba(0,0,0,0.20)" }}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tittel..."
            className="rounded-lg border px-3 py-2 text-[13px] outline-none"
            style={{ background: "rgba(0,0,0,0.25)", borderColor: "var(--ds-hairline)", color: "var(--ds-ink)" }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border px-2 py-1.5 text-[12px] outline-none"
              style={{ background: "rgba(0,0,0,0.25)", borderColor: "var(--ds-hairline)", color: "var(--ds-ink-2)" }}
            />
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-lg border px-2 py-1.5 text-[12px] outline-none"
              style={{ background: "rgba(0,0,0,0.25)", borderColor: "var(--ds-hairline)", color: "var(--ds-ink-2)" }}
            />
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-lg border px-2 py-1.5 text-[12px] outline-none"
              style={{ background: "rgba(0,0,0,0.25)", borderColor: "var(--ds-hairline)", color: "var(--ds-ink-2)" }}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!title.trim() || !date || submitting}
              className="ml-auto rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase disabled:opacity-40"
              style={{ background: ACCENT, color: "#000" }}
            >
              Legg til
            </button>
          </div>
        </div>

        {loading ? (
          <p className="px-1 text-[11px]" style={{ color: "var(--ds-muted)" }}>Laster…</p>
        ) : upcoming.length === 0 ? (
          <p className="px-1 text-[11px]" style={{ color: "var(--ds-muted)" }}>Ingen hendelser ennå.</p>
        ) : (
          upcoming.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-1 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px]" style={{ color: "var(--ds-ink)" }}>{e.title}</p>
                <p className="mt-0.5 text-[10px]" style={{ color: "var(--ds-muted)" }}>
                  {e.date}
                  {e.startTime ? ` ${e.startTime}` : ""}
                  {e.endTime ? `–${e.endTime}` : ""}
                  {e.note ? ` — ${e.note}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(e.id)}
                aria-label="Slett hendelse"
                className="shrink-0 text-[16px] leading-none"
                style={{ color: "var(--ds-faint)" }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </CollapsibleSection>
  );
}
