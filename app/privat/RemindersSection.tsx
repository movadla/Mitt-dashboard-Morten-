"use client";

import { useCallback, useEffect, useState } from "react";
import { CollapsibleSection } from "./SportSection";
import type { Recurrence, Reminder } from "@/lib/reminders";

const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: "Ingen",
  daily: "Daglig",
  weekly: "Ukentlig",
  monthly: "Månedlig",
};

const ACCENT = "var(--ds-trips)";

function sortReminders(a: Reminder, b: Reminder): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate.localeCompare(b.dueDate);
}

export default function RemindersSection() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    fetch("/api/reminders")
      .then((r) => r.json())
      .then((d) => setReminders((d.reminders ?? []) as Reminder[]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("mitt-dashboard:privat-refresh", load);
    return () => window.removeEventListener("mitt-dashboard:privat-refresh", load);
  }, [load]);

  async function handleAdd() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, dueDate: dueDate || undefined, recurrence }),
      });
      if (res.ok) {
        const created: Reminder = await res.json();
        setReminders((prev) => [...prev, created].sort(sortReminders));
        setText("");
        setDueDate("");
        setRecurrence("none");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(id: string) {
    const res = await fetch(`/api/reminders/${id}`, { method: "PATCH" });
    if (res.ok) {
      const updated: Reminder = await res.json();
      setReminders((prev) => prev.map((r) => (r.id === id ? updated : r)).sort(sortReminders));
    }
  }

  async function handleRemove(id: string) {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/reminders/${id}`, { method: "DELETE" });
  }

  const openCount = reminders.filter((r) => !r.done).length;

  return (
    <CollapsibleSection
      accent={ACCENT}
      title="Påminnelser"
      defaultOpen={false}
      count={openCount > 0 ? `${openCount} ugjort` : undefined}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 rounded-xl p-2.5" style={{ background: "rgba(0,0,0,0.20)" }}>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="Ny påminnelse..."
            className="rounded-lg border px-3 py-2 text-[13px] outline-none"
            style={{ background: "rgba(0,0,0,0.25)", borderColor: "var(--ds-hairline)", color: "var(--ds-ink)" }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-lg border px-2 py-1.5 text-[12px] outline-none"
              style={{ background: "rgba(0,0,0,0.25)", borderColor: "var(--ds-hairline)", color: "var(--ds-ink-2)" }}
            />
            <div className="flex gap-1">
              {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRecurrence(r)}
                  className="rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    background: recurrence === r ? ACCENT : "rgba(255,255,255,0.05)",
                    color: recurrence === r ? "#000" : "rgba(255,255,255,0.4)",
                  }}
                >
                  {RECURRENCE_LABEL[r]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!text.trim() || submitting}
              className="ml-auto rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase disabled:opacity-40"
              style={{ background: ACCENT, color: "#000" }}
            >
              Legg til
            </button>
          </div>
        </div>

        {loading ? (
          <p className="px-1 text-[11px]" style={{ color: "var(--ds-muted)" }}>Laster…</p>
        ) : reminders.length === 0 ? (
          <p className="px-1 text-[11px]" style={{ color: "var(--ds-muted)" }}>Ingen påminnelser ennå.</p>
        ) : (
          reminders.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-1 py-1.5">
              <button
                type="button"
                onClick={() => handleToggle(r.id)}
                aria-pressed={r.done}
                aria-label={r.done ? "Marker som ikke ferdig" : "Marker som ferdig"}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
                style={{
                  background: r.done ? ACCENT : "transparent",
                  boxShadow: `0 0 0 1px ${r.done ? ACCENT : "rgba(255,255,255,0.18)"}`,
                }}
              >
                {r.done && (
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8.5L6.5 12 13 5" />
                  </svg>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-[13px] ${r.done ? "line-through" : ""}`}
                  style={{ color: r.done ? "var(--ds-muted)" : "var(--ds-ink)" }}
                >
                  {r.text}
                </p>
                {(r.dueDate || r.recurrence !== "none") && (
                  <p className="mt-0.5 text-[10px]" style={{ color: "var(--ds-muted)" }}>
                    {r.dueDate ?? ""}
                    {r.dueDate && r.recurrence !== "none" ? " · " : ""}
                    {r.recurrence !== "none" ? RECURRENCE_LABEL[r.recurrence] : ""}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(r.id)}
                aria-label="Slett påminnelse"
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
