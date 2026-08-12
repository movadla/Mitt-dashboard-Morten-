"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CARD_SHELL, SkeletonRows } from "../CardShell";
import type { Reminder } from "@/lib/reminders";
import type { PrivatCalendarEvent } from "@/lib/privatCalendar";
import { LEAGUE_ROUND_CATEGORIES, LEAGUE_ROUND_LABELS } from "@/lib/sportsCategories";
import type { SportEvent } from "@/lib/sports";
import type { FplData } from "@/lib/fpl";
import type { WeatherData } from "@/lib/weather";
import type { LifeEvent } from "@/lib/payday";
import { addDaysIso, isPaydayToday, localDateString, occursOnDate, toOsloDateString } from "@/lib/payday";
import type { AiUsageSummary } from "@/lib/aiUsage";
import type { NewsItem } from "@/lib/news";
import {
  Sun,
  Cloud,
  CloudSun,
  CloudRain,
  CloudDrizzle,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Lightbulb,
  Calendar,
  CalendarClock,
  Trophy,
  Shirt,
  PartyPopper,
  Newspaper,
  ChevronLeft,
  ChevronDown,
  Bot,
} from "lucide-react";

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

const MAX_OFFSET = 365;
const SWIPE_THRESHOLD = 60;

// Kategori-ikonet ligger til venstre for teksten, på linje med den (ikke som
// en egen rad over) — men beholder en skjult tekst for skjermlesere og en
// title-tooltip.
function CategoryRow({
  icon: Icon,
  colorClass,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2" title={label}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${colorClass}`} />
      <span className="sr-only">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// Én påminnelseslinje i "I dag" — prikk foran teksten skiller radene fra
// hverandre når det er flere på samme dag, rød tekst for oversittede, og et
// lite kalenderikon lar deg endre fristen direkte uten å åpne Påminnelser-kortet.
function ReminderLine({
  reminder,
  overdue,
  editing,
  onStartEdit,
  onChangeDueDate,
  onCancelEdit,
}: {
  reminder: Reminder;
  overdue: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onChangeDueDate: (date: string) => void;
  onCancelEdit: () => void;
}) {
  return (
    <li className="flex items-start gap-1.5">
      <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${overdue ? "bg-status-danger" : "bg-ink-4"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`min-w-0 text-sm ${overdue ? "text-status-danger" : "text-ink-1"}`}>{reminder.text}</span>
          <button
            type="button"
            onClick={onStartEdit}
            aria-label="Endre frist"
            title="Endre frist"
            className="shrink-0 text-ink-4 transition hover:text-ink-2"
          >
            <CalendarClock className="h-3 w-3" />
          </button>
        </div>
        {editing && (
          <input
            type="date"
            autoFocus
            defaultValue={reminder.dueDate ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancelEdit();
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            onBlur={(e) => {
              // Lagre kun når feltet faktisk inneholder en gyldig, komplett dato —
              // en input som fortsatt er delvis tastet inn gir "" her, og skal
              // ikke tolkes som "fjern fristen".
              if (e.target.value) onChangeDueDate(e.target.value);
              onCancelEdit();
            }}
            className="mt-1 rounded-lg border border-line bg-surface-1 px-2 py-1 text-xs text-ink-2 outline-none focus:border-line-strong"
          />
        )}
      </div>
    </li>
  );
}

// Samlelinje for en full liga-runde (Eliteserien/PL/FA Cup/Champions League) —
// viser kun antall kamper, med drill-down på klikk i stedet for å liste alle
// enkeltvis og oversvømme "I dag".
function SportRoundLine({ label, matches }: { label: string; matches: SportEvent[] }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="text-sm text-ink-1">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1.5 text-left">
        <span className="min-w-0 flex-1 truncate">{label}-runde</span>
        <span className="shrink-0 text-2xs tabular-nums text-ink-4">{matches.length} kamper</span>
        <ChevronDown className={`h-3 w-3 shrink-0 text-ink-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="mt-1 flex flex-col gap-1 border-l border-line pl-2">
          {matches.map((m) => (
            <li key={m.id} className="text-xs text-ink-3">
              {m.time ? <span className="tabular-nums">{m.time} </span> : null}
              {m.name}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// Overskrift for den viste dagen — alltid samme format og rekkefølge
// (ukedag, så dato), uansett hvilken dag som vises, slik at teksten ikke
// bytter form/plassering når man blar mellom dager med pil-navigeringen.
// "Tilbake til i dag"-knappen dekker signalet om at man ser en annen dag.
function dayHeaderLabel(dateIso: string): string {
  const d = new Date(dateIso + "T12:00:00");
  const weekday = d.toLocaleDateString("nb-NO", { weekday: "long" });
  const [, m, day] = dateIso.split("-");
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day}.${m}`;
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

// Fargekoding for raskere skanning av timeoversikten. Fire tydelig atskilte
// fargefamilier for de fire vanligste tilstandene — sol (gul), delvis skyet
// (oransje, skiller seg fra solens gul), overskyet (grå, ingen varme), regn
// (blå) — pluss snø/tåke/torden. Fargen kommer fra symbolet selv (ikke fra
// kalleren sin className), så alle bruksstedene får samme fargelogikk.
function weatherColorClass(s: string): string {
  if (s.includes("thunder")) return "text-violet-400";
  if (s === "heavyrain" || s === "rain") return "text-blue-500";
  if (s.includes("rain") || s.includes("shower") || s.includes("sleet")) return "text-blue-300";
  if (s.includes("snow")) return "text-sky-100";
  if (s === "fog") return "text-slate-400";
  if (s === "clearsky") return "text-yellow-300";
  if (s === "cloudy") return "text-slate-300";
  if (s === "fair" || s.includes("partly")) return "text-orange-300";
  return "text-slate-300";
}

function WeatherIcon({ symbol, className }: { symbol: string; className?: string }) {
  const s = baseSymbol(symbol);
  const cls = `${weatherColorClass(s)} ${className ?? ""}`.trim();
  if (s.includes("thunder")) return <CloudLightning className={cls} />;
  if (s === "heavyrain" || s === "rain") return <CloudRain className={cls} />;
  if (s.includes("rain") || s.includes("shower") || s.includes("sleet")) return <CloudDrizzle className={cls} />;
  if (s.includes("snow")) return <CloudSnow className={cls} />;
  if (s === "fog") return <CloudFog className={cls} />;
  if (s === "clearsky") return <Sun className={cls} />;
  if (s === "cloudy") return <Cloud className={cls} />;
  if (s === "fair" || s.includes("partly")) return <CloudSun className={cls} />;
  return <Cloud className={cls} />;
}

function hourLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

export default function TodaySummary() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [events, setEvents] = useState<PrivatCalendarEvent[]>([]);
  const [sports, setSports] = useState<SportEvent[]>([]);
  const [fpl, setFpl] = useState<FplData | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [lifeEvents, setLifeEvents] = useState<LifeEvent[]>([]);
  const [aiUsage, setAiUsage] = useState<AiUsageSummary | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [weatherExpanded, setWeatherExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewedOffset, setViewedOffset] = useState(0);
  const [slideDirection, setSlideDirection] = useState<"forward" | "backward" | null>(null);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);

  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragAxis = useRef<"x" | "y" | null>(null);

  const load = useCallback(() => {
    Promise.allSettled([
      fetch("/api/reminders").then((r) => r.json()),
      fetch("/api/privat-calendar").then((r) => r.json()),
      fetch("/api/sports").then((r) => r.json()),
      fetch("/api/fpl").then((r) => r.json()),
      fetch("/api/weather").then((r) => r.json()),
      fetch("/api/events").then((r) => r.json()),
      fetch("/api/ai-usage").then((r) => r.json()),
      fetch("/api/news").then((r) => r.json()),
    ]).then(([r, e, s, f, w, ev, au, n]) => {
      setReminders(r.status === "fulfilled" ? ((r.value.reminders ?? []) as Reminder[]) : []);
      setEvents(e.status === "fulfilled" ? ((e.value.events ?? []) as PrivatCalendarEvent[]) : []);
      setSports(s.status === "fulfilled" ? ((s.value.events ?? []) as SportEvent[]) : []);
      setFpl(f.status === "fulfilled" && !f.value.error ? (f.value as FplData) : null);
      setWeather(w.status === "fulfilled" && !w.value.error ? (w.value as WeatherData) : null);
      setLifeEvents(ev.status === "fulfilled" ? ((ev.value.events ?? []) as LifeEvent[]) : []);
      setAiUsage(au.status === "fulfilled" && !au.value.error ? (au.value as AiUsageSummary) : null);
      setNews(n.status === "fulfilled" ? ((n.value.items ?? []) as NewsItem[]) : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("mitt-dashboard:privat-refresh", load);
    return () => window.removeEventListener("mitt-dashboard:privat-refresh", load);
  }, [load]);

  const realToday = localDateString();
  const viewedDate = addDaysIso(realToday, viewedOffset);
  const isToday = viewedOffset === 0;

  function goForward() {
    setViewedOffset((v) => Math.min(MAX_OFFSET, v + 1));
    setSlideDirection("forward");
  }
  function goBackward() {
    setViewedOffset((v) => Math.max(0, v - 1));
    setSlideDirection("backward");
  }
  function goToToday() {
    setViewedOffset(0);
    setSlideDirection("backward");
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragAxis.current = null;
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    const deltaX = e.clientX - dragStart.current.x;
    const deltaY = e.clientY - dragStart.current.y;
    if (!dragAxis.current && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
      dragAxis.current = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
    }
  }
  function handlePointerUp(e: React.PointerEvent) {
    if (dragAxis.current === "x" && dragStart.current) {
      const deltaX = e.clientX - dragStart.current.x;
      if (deltaX < -SWIPE_THRESHOLD) goForward();
      else if (deltaX > SWIPE_THRESHOLD) goBackward();
    }
    dragStart.current = null;
    dragAxis.current = null;
  }

  async function handleChangeDueDate(id: string, newDate: string) {
    const res = await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: newDate || null }),
    });
    if (res.ok) {
      const updated: Reminder = await res.json();
      setReminders((prev) => prev.map((r) => (r.id === id ? updated : r)));
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  const activeReminders = reminders.filter((r) => !r.done && (!r.dueDate || r.dueDate <= realToday));
  const overdueReal = activeReminders.filter((r) => r.dueDate && r.dueDate < realToday);
  const dueTodayReal = activeReminders.filter((r) => !r.dueDate || r.dueDate === realToday);

  const dueOnViewed = reminders.filter((r) => !r.done && (r.dueDate === viewedDate || (!r.dueDate && isToday)));
  // Slår sammen oversittede (kun relevant på selve i dag-visningen) og de som
  // forfaller på den viste dagen i én liste, med et overdue-flagg per rad —
  // vises i samme boks, ikke to separate, jf. tilbakemelding.
  const reminderRows = isToday
    ? [
        ...overdueReal.map((r) => ({ reminder: r, overdue: true })),
        ...dueOnViewed.map((r) => ({ reminder: r, overdue: false })),
      ]
    : dueOnViewed.map((r) => ({ reminder: r, overdue: false }));
  const eventsOnViewed = events.filter((e) => e.date === viewedDate);
  // Egendefinerte kamper (category "personal") vises i "I dag" kun når de er
  // markert highlight, og fulle liga-runder (Eliteserien/PL/FA Cup/Champions
  // League) vises IKKE enkeltvis her — de samles i en klikkbar "X-runde"-linje
  // (se SportRoundLine) i stedet for å oversvømme "I dag" med alle kampene.
  const sportsOnViewed = sports.filter(
    (s) =>
      s.date === viewedDate &&
      !LEAGUE_ROUND_CATEGORIES.has(s.category) &&
      (s.category !== "personal" || s.highlight),
  );
  const sportRoundsOnViewed = [...LEAGUE_ROUND_CATEGORIES]
    .map((cat) => ({ cat, matches: sports.filter((s) => s.date === viewedDate && s.category === cat) }))
    .filter((g) => g.matches.length > 0);
  const fplDeadlineOnViewed =
    fpl?.active && fpl.gw?.deadline && toOsloDateString(new Date(fpl.gw.deadline)) === viewedDate ? fpl.gw.deadline : null;
  const lifeEventsOnViewed = lifeEvents.filter((e) => occursOnDate(e, viewedDate));
  const paydayOnViewed = isPaydayToday(viewedDate);

  useEffect(() => {
    if (loading) return;
    setBadgeCount(overdueReal.length + dueTodayReal.length);
  }, [loading, overdueReal.length, dueTodayReal.length]);

  const slideClass = slideDirection === "forward" ? "day-slide-in-right" : slideDirection === "backward" ? "day-slide-in-left" : "";

  return (
    <div className={`${CARD_SHELL} p-4`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-ink-1">{dayHeaderLabel(viewedDate)}</h2>
          {!isToday && (
            <button
              type="button"
              onClick={goToToday}
              className="flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-2 px-2 py-1 text-2xs font-medium text-accent-privat transition hover:bg-surface-3"
            >
              <ChevronLeft className="h-3 w-3" />
              Tilbake til i dag
            </button>
          )}
        </div>
        {weather && isToday && (
          <button
            type="button"
            onClick={() => setWeatherExpanded((v) => !v)}
            aria-expanded={weatherExpanded}
            aria-label="Vis vær time for time"
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-ink-2 transition hover:bg-surface-2"
          >
            <WeatherIcon symbol={weather.symbol} className="h-5 w-5" />
            <span className="tabular-nums">{weather.temp}°</span>
          </button>
        )}
      </div>

      {weather && weatherExpanded && isToday && (
        <div className="mb-3 overflow-x-auto rounded-xl border border-line bg-surface-2 p-2.5">
          <div className="flex w-max gap-4">
            {weather.hourly.map((h) => (
              <div key={h.time} className="flex flex-col items-center gap-1 text-center">
                <span className="text-2xs text-ink-4">{hourLabel(h.time)}</span>
                <WeatherIcon symbol={h.symbol} className="h-5 w-5" />
                <span className="text-xs tabular-nums text-ink-1">{h.temp}°</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonRows count={3} className="h-6" />
      ) : (
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            dragStart.current = null;
            dragAxis.current = null;
          }}
          style={{ touchAction: "pan-y" }}
        >
          <div key={viewedOffset} className={`flex flex-col gap-2 ${slideClass}`}>
            {isToday && aiUsage && (aiUsage.overDaily || aiUsage.overMonthly) && (
              <div className="rounded-lg border border-status-danger/40 bg-status-danger/8 px-3 py-1.5">
                <CategoryRow icon={Bot} colorClass="text-status-danger" label="AI-bruk">
                  <p className="text-sm text-ink-1">
                    {aiUsage.overDaily && `${formatUsd(aiUsage.last24hUsd)} siste 24t (over ${formatUsd(aiUsage.dailyAlertUsd)}/dag)`}
                    {aiUsage.overDaily && aiUsage.overMonthly && " · "}
                    {aiUsage.overMonthly &&
                      `${formatUsd(aiUsage.last30daysUsd)} siste 30 dager (over ${formatUsd(aiUsage.monthlyAlertUsd)})`}
                  </p>
                </CategoryRow>
              </div>
            )}

            {isToday && news.length > 0 && (
              <div className="rounded-lg border border-white/40 bg-white/8 px-3 py-1.5">
                <CategoryRow icon={Newspaper} colorClass="text-white" label="Toppnyhet">
                  <a
                    href={news[0].link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-ink-1 hover:underline"
                  >
                    {news[0].title}
                  </a>
                </CategoryRow>
              </div>
            )}

            {/* Påminnelser og Kalender vises alltid, med egen tom-tekst — slik at Sport
                aldri kan "vinne" toppen bare fordi de to viktigste kategoriene er tomme. */}
            <div className="rounded-lg border border-accent-privat/40 bg-accent-privat/8 px-3 py-1.5">
              <CategoryRow icon={Lightbulb} colorClass="text-accent-privat" label="Påminnelser">
                {reminderRows.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {reminderRows.map(({ reminder, overdue }) => (
                      <ReminderLine
                        key={reminder.id}
                        reminder={reminder}
                        overdue={overdue}
                        editing={editingReminderId === reminder.id}
                        onStartEdit={() => setEditingReminderId(reminder.id)}
                        onChangeDueDate={(date) => handleChangeDueDate(reminder.id, date)}
                        onCancelEdit={() => setEditingReminderId(null)}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-3">{isToday ? "Ingen påminnelser i dag." : "Ingen påminnelser denne dagen."}</p>
                )}
              </CategoryRow>
            </div>

            <div className="rounded-lg border border-source-teams/40 bg-source-teams/8 px-3 py-1.5">
              <CategoryRow icon={Calendar} colorClass="text-source-teams" label="Kalender">
                {eventsOnViewed.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {eventsOnViewed.map((e) => (
                      <li key={e.id} className="flex items-baseline justify-between gap-2 text-sm text-ink-1">
                        <span className="min-w-0 truncate">{e.title}</span>
                        {e.startTime && <span className="shrink-0 tabular-nums text-ink-3">{e.startTime}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-3">{isToday ? "Ingen hendelser i dag." : "Ingen hendelser denne dagen."}</p>
                )}
              </CategoryRow>
            </div>

            {(sportsOnViewed.length > 0 || sportRoundsOnViewed.length > 0) && (
              <div className="rounded-lg border border-accent/40 bg-accent/8 px-3 py-1.5">
                <CategoryRow icon={Trophy} colorClass="text-accent" label="Sport">
                  <ul className="flex flex-col gap-1">
                    {sportsOnViewed.map((s) => (
                      <li key={s.id} className="text-sm text-ink-1">
                        {s.time ? <span className="tabular-nums text-ink-3">{s.time} </span> : null}
                        {s.name}
                      </li>
                    ))}
                    {sportRoundsOnViewed.map((g) => (
                      <SportRoundLine key={g.cat} label={LEAGUE_ROUND_LABELS[g.cat] ?? g.cat} matches={g.matches} />
                    ))}
                  </ul>
                </CategoryRow>
              </div>
            )}

            {fplDeadlineOnViewed && (
              <div className="rounded-lg border border-status-action/40 bg-status-action/8 px-3 py-1.5">
                <CategoryRow icon={Shirt} colorClass="text-status-action" label="Fantasy Premier League">
                  <p className="text-sm text-ink-1">
                    Deadline kl.{" "}
                    <span className="tabular-nums">
                      {new Date(fplDeadlineOnViewed).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </p>
                </CategoryRow>
              </div>
            )}

            {(paydayOnViewed || lifeEventsOnViewed.length > 0) && (
              <div className="rounded-lg border border-status-warning/40 bg-status-warning/8 px-3 py-1.5">
                <CategoryRow icon={PartyPopper} colorClass="text-status-warning" label="Hendelser">
                  <ul className="flex flex-col gap-1">
                    {paydayOnViewed && <li className="text-sm text-ink-1">Lønningsdag</li>}
                    {lifeEventsOnViewed.map((e) => (
                      <li key={e.id} className="text-sm text-ink-1">
                        {e.title}
                      </li>
                    ))}
                  </ul>
                </CategoryRow>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
