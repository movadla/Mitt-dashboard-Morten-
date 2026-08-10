"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_SHELL, CardHeader, usePersistedCollapse } from "../CardShell";
import type { Recurrence, Reminder } from "@/lib/reminders";

const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: "Ingen",
  daily: "Daglig",
  weekly: "Ukentlig",
  monthly: "Månedlig",
};

function formatDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function isDueToday(r: Reminder, today: string): boolean {
  if (r.done) return false;
  if (!r.dueDate) return true; // ingen frist -> alltid aktuell
  return r.dueDate <= today; // forfaller i dag eller er oversittet
}

function sortReminders(a: Reminder, b: Reminder): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate.localeCompare(b.dueDate);
}

function ReminderRow({
  reminder,
  onToggle,
  onRemove,
}: {
  reminder: Reminder;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
      <button
        type="button"
        onClick={() => onToggle(reminder.id)}
        aria-pressed={reminder.done}
        aria-label={reminder.done ? "Marker som ikke ferdig" : "Marker som ferdig"}
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ring-1 transition ${
          reminder.done ? "bg-emerald-500 ring-emerald-500" : "bg-transparent ring-line-strong hover:ring-line-strong"
        }`}
      >
        {reminder.done && (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-surface-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8.5L6.5 12 13 5" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${reminder.done ? "text-ink-4 line-through" : "text-ink-1"}`}>{reminder.text}</p>
        {(reminder.dueDate || reminder.recurrence !== "none") && (
          <p className="mt-0.5 text-2xs text-ink-4">
            {reminder.dueDate ? formatDMY(reminder.dueDate) : ""}
            {reminder.dueDate && reminder.recurrence !== "none" ? " · " : ""}
            {reminder.recurrence !== "none" ? RECURRENCE_LABEL[reminder.recurrence] : ""}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(reminder.id)}
        aria-label="Slett påminnelse"
        className="shrink-0 text-ink-4 hover:text-rose-400"
      >
        ×
      </button>
    </li>
  );
}

export default function RemindersSection() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Påminnelser");
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
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
        window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
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
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  async function handleRemove(id: string) {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/reminders/${id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
  }

  const today = new Date().toISOString().slice(0, 10);
  const todays = reminders.filter((r) => isDueToday(r, today));
  const rest = reminders.filter((r) => !isDueToday(r, today));

  return (
    <div className={`${CARD_SHELL} p-4`}>
      <CardHeader
        title="Påminnelser"
        subtitle={todays.length > 0 ? `${todays.length} i dag` : "Ingen i dag"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {!collapsed && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-2.5">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              placeholder="Ny påminnelse..."
              className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
              />
              <div className="flex gap-1">
                {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRecurrence(r)}
                    className={`rounded-lg px-2 py-1 text-2xs font-medium uppercase tracking-wide ${
                      recurrence === r ? "bg-accent text-white" : "bg-surface-3 text-ink-3 hover:text-ink-1"
                    }`}
                  >
                    {RECURRENCE_LABEL[r]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!text.trim() || submitting}
                className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-2xs font-semibold uppercase text-white transition hover:bg-accent/85 disabled:opacity-40"
              >
                Legg til
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-ink-3">Laster…</p>
          ) : todays.length === 0 ? (
            <p className="text-sm text-ink-3">Ingen påminnelser i dag.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {todays.map((r) => (
                <ReminderRow key={r.id} reminder={r} onToggle={handleToggle} onRemove={handleRemove} />
              ))}
            </ul>
          )}

          {rest.length > 0 && (
            <>
              {showAll && (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {rest.map((r) => (
                    <ReminderRow key={r.id} reminder={r} onToggle={handleToggle} onRemove={handleRemove} />
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
