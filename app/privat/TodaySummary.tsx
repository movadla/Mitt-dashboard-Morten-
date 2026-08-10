"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_SHELL } from "../CardShell";
import type { Reminder } from "@/lib/reminders";
import type { PrivatCalendarEvent } from "@/lib/privatCalendar";
import type { SportEvent } from "@/lib/sports";

function setBadgeCount(count: number) {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0) nav.setAppBadge?.(count).catch(() => {});
  else nav.clearAppBadge?.().catch(() => {});
}

export default function TodaySummary() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [events, setEvents] = useState<PrivatCalendarEvent[]>([]);
  const [sports, setSports] = useState<SportEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    Promise.allSettled([
      fetch("/api/reminders").then((r) => r.json()),
      fetch("/api/privat-calendar").then((r) => r.json()),
      fetch("/api/sports").then((r) => r.json()),
    ]).then(([r, e, s]) => {
      setReminders(r.status === "fulfilled" ? ((r.value.reminders ?? []) as Reminder[]) : []);
      setEvents(e.status === "fulfilled" ? ((e.value.events ?? []) as PrivatCalendarEvent[]) : []);
      setSports(s.status === "fulfilled" ? ((s.value.events ?? []) as SportEvent[]) : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("mitt-dashboard:privat-refresh", load);
    return () => window.removeEventListener("mitt-dashboard:privat-refresh", load);
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const activeReminders = reminders.filter((r) => !r.done && (!r.dueDate || r.dueDate <= today));
  const overdue = activeReminders.filter((r) => r.dueDate && r.dueDate < today);
  const dueToday = activeReminders.filter((r) => !r.dueDate || r.dueDate === today);
  const todaysEvents = events.filter((e) => e.date === today);
  const todaysSports = sports.filter((s) => s.date === today);

  useEffect(() => {
    if (loading) return;
    setBadgeCount(overdue.length + dueToday.length);
  }, [loading, overdue.length, dueToday.length]);

  const isEmpty =
    !loading && overdue.length === 0 && dueToday.length === 0 && todaysEvents.length === 0 && todaysSports.length === 0;

  return (
    <div className={`${CARD_SHELL} p-4`}>
      <h2 className="mb-3 text-sm font-semibold text-ink-1">I dag</h2>
      {loading ? (
        <p className="text-sm text-ink-3">Laster…</p>
      ) : isEmpty ? (
        <p className="text-sm text-ink-3">Ingenting planlagt i dag.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {overdue.length > 0 && (
            <div>
              <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-status-danger">
                Oversittet ({overdue.length})
              </p>
              <ul className="flex flex-col gap-1">
                {overdue.map((r) => (
                  <li key={r.id} className="text-sm text-ink-1">
                    {r.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {dueToday.length > 0 && (
            <div>
              <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-4">Påminnelser</p>
              <ul className="flex flex-col gap-1">
                {dueToday.map((r) => (
                  <li key={r.id} className="text-sm text-ink-1">
                    {r.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {todaysEvents.length > 0 && (
            <div>
              <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-4">Kalender</p>
              <ul className="flex flex-col gap-1">
                {todaysEvents.map((e) => (
                  <li key={e.id} className="text-sm text-ink-1">
                    {e.startTime ? <span className="tabular-nums text-ink-3">{e.startTime} </span> : null}
                    {e.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {todaysSports.length > 0 && (
            <div>
              <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-4">Sport</p>
              <ul className="flex flex-col gap-1">
                {todaysSports.map((s) => (
                  <li key={s.id} className="text-sm text-ink-1">
                    {s.time ? <span className="tabular-nums text-ink-3">{s.time} </span> : null}
                    {s.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
