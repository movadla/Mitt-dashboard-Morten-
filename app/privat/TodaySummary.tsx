"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_SHELL, SkeletonRows } from "../CardShell";
import type { Reminder } from "@/lib/reminders";
import type { PrivatCalendarEvent } from "@/lib/privatCalendar";
import type { SportEvent } from "@/lib/sports";
import type { Loan } from "@/lib/loans";
import type { FplData } from "@/lib/fpl";
import type { WeatherData } from "@/lib/weather";
import type { LifeEvent } from "@/lib/payday";
import { isPaydayToday, localDateString, nextOccurrence } from "@/lib/payday";
import { formatKr } from "@/lib/widgets";
import {
  Sun,
  Cloud,
  CloudSun,
  CloudRain,
  CloudDrizzle,
  CloudSnow,
  CloudLightning,
  CloudFog,
  AlertTriangle,
  Lightbulb,
  Calendar,
  Trophy,
  Shirt,
  PartyPopper,
  Banknote,
} from "lucide-react";

// Kategori-header i "I dag" vises som ikon i stedet for tekst (kompakt, rask å
// skanne) — men beholder en skjult tekst for skjermlesere og en title-tooltip.
function CategoryLabel({
  icon: Icon,
  colorClass,
  label,
  count,
}: {
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  label: string;
  count?: number;
}) {
  return (
    <div className="mb-1 flex items-center gap-1.5" title={label}>
      <Icon className={`h-4 w-4 ${colorClass}`} />
      <span className="sr-only">{label}</span>
      {count !== undefined && <span className={`text-2xs font-semibold tabular-nums ${colorClass}`}>{count}</span>}
    </div>
  );
}

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

function baseSymbol(s: string): string {
  return s.replace(/_day|_night|_polartwilight/, "");
}

function WeatherIcon({ symbol, className }: { symbol: string; className?: string }) {
  const s = baseSymbol(symbol);
  if (s.includes("thunder")) return <CloudLightning className={className} />;
  if (s === "heavyrain" || s === "rain") return <CloudRain className={className} />;
  if (s.includes("rain") || s.includes("shower") || s.includes("sleet")) return <CloudDrizzle className={className} />;
  if (s.includes("snow")) return <CloudSnow className={className} />;
  if (s === "fog") return <CloudFog className={className} />;
  if (s === "clearsky") return <Sun className={className} />;
  if (s === "fair" || s.includes("partly")) return <CloudSun className={className} />;
  return <Cloud className={className} />;
}

function hourLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

export default function TodaySummary() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [events, setEvents] = useState<PrivatCalendarEvent[]>([]);
  const [sports, setSports] = useState<SportEvent[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [fpl, setFpl] = useState<FplData | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [lifeEvents, setLifeEvents] = useState<LifeEvent[]>([]);
  const [weatherExpanded, setWeatherExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    Promise.allSettled([
      fetch("/api/reminders").then((r) => r.json()),
      fetch("/api/privat-calendar").then((r) => r.json()),
      fetch("/api/sports").then((r) => r.json()),
      fetch("/api/loans").then((r) => r.json()),
      fetch("/api/fpl").then((r) => r.json()),
      fetch("/api/weather").then((r) => r.json()),
      fetch("/api/events").then((r) => r.json()),
    ]).then(([r, e, s, l, f, w, ev]) => {
      setReminders(r.status === "fulfilled" ? ((r.value.reminders ?? []) as Reminder[]) : []);
      setEvents(e.status === "fulfilled" ? ((e.value.events ?? []) as PrivatCalendarEvent[]) : []);
      setSports(s.status === "fulfilled" ? ((s.value.events ?? []) as SportEvent[]) : []);
      setLoans(l.status === "fulfilled" ? ((l.value.loans ?? []) as Loan[]) : []);
      setFpl(f.status === "fulfilled" && !f.value.error ? (f.value as FplData) : null);
      setWeather(w.status === "fulfilled" && !w.value.error ? (w.value as WeatherData) : null);
      setLifeEvents(ev.status === "fulfilled" ? ((ev.value.events ?? []) as LifeEvent[]) : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("mitt-dashboard:privat-refresh", load);
    return () => window.removeEventListener("mitt-dashboard:privat-refresh", load);
  }, [load]);

  const today = localDateString();
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
  const fplDeadlineToday =
    fpl?.active && fpl.gw?.deadline && new Date(fpl.gw.deadline).toDateString() === new Date().toDateString()
      ? fpl.gw.deadline
      : null;
  const todaysLifeEvents = lifeEvents.filter((e) => nextOccurrence(e, today) === today);
  const paydayToday = isPaydayToday(today);

  useEffect(() => {
    if (loading) return;
    setBadgeCount(overdue.length + dueToday.length);
  }, [loading, overdue.length, dueToday.length]);

  return (
    <div className={`${CARD_SHELL} p-4`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-1">I dag</h2>
        {weather && (
          <button
            type="button"
            onClick={() => setWeatherExpanded((v) => !v)}
            aria-expanded={weatherExpanded}
            aria-label="Vis vær time for time"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-ink-2 transition hover:bg-surface-2"
          >
            <WeatherIcon symbol={weather.symbol} className="h-4 w-4 text-accent" />
            <span className="tabular-nums">{weather.temp}°</span>
          </button>
        )}
      </div>

      {weather && weatherExpanded && (
        <div className="mb-3 overflow-x-auto rounded-xl border border-line bg-surface-2 p-2.5">
          <div className="flex w-max gap-4">
            {weather.hourly.map((h) => (
              <div key={h.time} className="flex flex-col items-center gap-1 text-center">
                <span className="text-2xs text-ink-4">{hourLabel(h.time)}</span>
                <WeatherIcon symbol={h.symbol} className="h-4 w-4 text-accent" />
                <span className="text-xs tabular-nums text-ink-1">{h.temp}°</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonRows count={3} className="h-6" />
      ) : (
        <div className="flex flex-col gap-2">
          {overdue.length > 0 && (
            <div className="rounded-lg border border-status-danger/40 bg-status-danger/8 px-3 py-1.5">
              <CategoryLabel icon={AlertTriangle} colorClass="text-status-danger" label="Oversittet" count={overdue.length} />
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
          <div className="rounded-lg border border-accent-privat/40 bg-accent-privat/8 px-3 py-1.5">
            <CategoryLabel icon={Lightbulb} colorClass="text-accent-privat" label="Påminnelser" />
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

          <div className="rounded-lg border border-source-teams/40 bg-source-teams/8 px-3 py-1.5">
            <CategoryLabel icon={Calendar} colorClass="text-source-teams" label="Kalender" />
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
            <div className="rounded-lg border border-accent/40 bg-accent/8 px-3 py-1.5">
              <CategoryLabel icon={Trophy} colorClass="text-accent" label="Sport" />
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

          {fplDeadlineToday && (
            <div className="rounded-lg border border-status-action/40 bg-status-action/8 px-3 py-1.5">
              <CategoryLabel icon={Shirt} colorClass="text-status-action" label="Fantasy Premier League" />
              <p className="text-sm text-ink-1">
                Deadline i dag kl.{" "}
                <span className="tabular-nums">
                  {new Date(fplDeadlineToday).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </p>
            </div>
          )}

          {(paydayToday || todaysLifeEvents.length > 0) && (
            <div className="rounded-lg border border-status-warning/40 bg-status-warning/8 px-3 py-1.5">
              <CategoryLabel icon={PartyPopper} colorClass="text-status-warning" label="Hendelser" />
              <ul className="flex flex-col gap-1">
                {paydayToday && <li className="text-sm text-ink-1">Lønningsdag</li>}
                {todaysLifeEvents.map((e) => (
                  <li key={e.id} className="text-sm text-ink-1">
                    {e.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {upcomingPayments.length > 0 && (
            <div className="rounded-lg border border-source-outlook/40 bg-source-outlook/8 px-3 py-1.5">
              <CategoryLabel icon={Banknote} colorClass="text-source-outlook" label="Låneavdrag" />
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
        </div>
      )}
    </div>
  );
}
