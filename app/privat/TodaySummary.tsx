"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_SHELL, SkeletonRows } from "../CardShell";
import type { Reminder } from "@/lib/reminders";
import type { PrivatCalendarEvent } from "@/lib/privatCalendar";
import type { SportEvent } from "@/lib/sports";
import type { Loan } from "@/lib/loans";
import type { Milestone } from "@/lib/alfred";
import { formatKr } from "@/lib/widgets";

function daysUntil(dateIso: string, todayIso: string): number {
  const target = new Date(dateIso + "T00:00:00Z").getTime();
  const from = new Date(todayIso + "T00:00:00Z").getTime();
  return Math.round((target - from) / (1000 * 60 * 60 * 24));
}

function relativeDayLabel(days: number): string {
  if (days === 0) return "i dag";
  if (days === 1) return "i morgen";
  return `om ${days} dager`;
}

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
  const [loans, setLoans] = useState<Loan[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    Promise.allSettled([
      fetch("/api/reminders").then((r) => r.json()),
      fetch("/api/privat-calendar").then((r) => r.json()),
      fetch("/api/sports").then((r) => r.json()),
      fetch("/api/loans").then((r) => r.json()),
      fetch("/api/alfred/milestones").then((r) => r.json()),
    ]).then(([r, e, s, l, m]) => {
      setReminders(r.status === "fulfilled" ? ((r.value.reminders ?? []) as Reminder[]) : []);
      setEvents(e.status === "fulfilled" ? ((e.value.events ?? []) as PrivatCalendarEvent[]) : []);
      setSports(s.status === "fulfilled" ? ((s.value.events ?? []) as SportEvent[]) : []);
      setLoans(l.status === "fulfilled" ? ((l.value.loans ?? []) as Loan[]) : []);
      setMilestones(m.status === "fulfilled" ? ((m.value.milestones ?? []) as Milestone[]) : []);
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
  const upcomingPayments = loans
    .filter((l) => l.nextPaymentDate)
    .map((l) => ({ loan: l, days: daysUntil(l.nextPaymentDate!, today) }))
    .filter(({ days }) => days >= 0 && days <= 7)
    .sort((a, b) => a.days - b.days);
  const nextAlfredFocus = milestones.find((m) => m.category === "fokus" && !m.done);

  useEffect(() => {
    if (loading) return;
    setBadgeCount(overdue.length + dueToday.length);
  }, [loading, overdue.length, dueToday.length]);

  return (
    <div className={`${CARD_SHELL} p-4`}>
      <h2 className="mb-3 text-sm font-semibold text-ink-1">I dag</h2>
      {loading ? (
        <SkeletonRows count={3} className="h-6" />
      ) : (
        <div className="flex flex-col gap-2">
          {overdue.length > 0 && (
            <div className="rounded-r-lg border-l-2 border-status-danger bg-status-danger/8 py-1.5 pl-3">
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

          {/* Påminnelser og Kalender vises alltid, med egen tom-tekst — slik at Sport
              aldri kan "vinne" toppen bare fordi de to viktigste kategoriene er tomme. */}
          <div className="rounded-r-lg border-l-2 border-accent-privat bg-accent-privat/8 py-1.5 pl-3">
            <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-accent-privat">Påminnelser</p>
            {dueToday.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {dueToday.map((r) => (
                  <li key={r.id} className="text-sm text-ink-1">
                    {r.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">Ingen påminnelser i dag.</p>
            )}
          </div>

          <div className="rounded-r-lg border-l-2 border-source-teams bg-source-teams/8 py-1.5 pl-3">
            <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-source-teams">Kalender</p>
            {todaysEvents.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {todaysEvents.map((e) => (
                  <li key={e.id} className="text-sm text-ink-1">
                    {e.startTime ? <span className="tabular-nums text-ink-3">{e.startTime} </span> : null}
                    {e.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">Ingen hendelser i dag.</p>
            )}
          </div>

          {todaysSports.length > 0 && (
            <div className="rounded-r-lg border-l-2 border-accent bg-accent/8 py-1.5 pl-3">
              <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-accent">Sport</p>
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

          {upcomingPayments.length > 0 && (
            <div className="rounded-r-lg border-l-2 border-source-outlook bg-source-outlook/8 py-1.5 pl-3">
              <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-source-outlook">Låneavdrag</p>
              <ul className="flex flex-col gap-1">
                {upcomingPayments.map(({ loan, days }) => (
                  <li key={loan.id} className="text-sm text-ink-1">
                    {loan.name} — {formatKr(loan.remainingAmount)}{" "}
                    <span className="text-ink-3">({relativeDayLabel(days)})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {nextAlfredFocus && (
            <div className="rounded-r-lg border-l-2 border-status-action bg-status-action/8 py-1.5 pl-3">
              <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-status-action">Alfred — neste fokus</p>
              <p className="text-sm text-ink-1">{nextAlfredFocus.label}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
