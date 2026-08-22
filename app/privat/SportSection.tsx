"use client";

import { useState } from "react";
import { Trophy, Flag, Target, Timer, Award, Star } from "lucide-react";
import { HIGHLIGHT_CATEGORIES, LEAGUE_ROUND_CATEGORIES } from "@/lib/sportsCategories";
import type { SportEvent } from "@/lib/sports";
import { CardHeader } from "../CardShell";
import { timeAgo } from "@/lib/timeAgo";
import { localDateString, toOsloDateString } from "@/lib/payday";

export type { SportEvent } from "@/lib/sports";

function todayStr() {
  return localDateString();
}
function daysUntil(d: string) {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(d + "T00:00:00").getTime() - t.getTime()) / 86_400_000);
}

const SPORT_COLOR: Record<string, string> = {
  football: "#2563eb",
  f1: "#dc2626",
  darts: "#7c3aed",
  athletics: "#d97706",
  golf: "#15803d",
  football_eli: "#ef4444",
  football_obos: "#f97316",
  football_pl: "#8b5cf6",
  football_facup: "#be185d",
  football_ucl: "#0891b2",
  football_manu: "#da291c",
  football_norway: "#1e3a8a",
  football_no_uefa: "#4338ca",
  worldcup: "#eab308",
  personal: "#0e9e79",
};
const SPORT_LABEL: Record<string, string> = {
  football: "Fotball",
  f1: "Formel 1",
  darts: "Dart",
  athletics: "Friidrett",
  golf: "Golf",
  football_eli: "Eliteserien",
  football_obos: "Obosligaen",
  football_pl: "Premier League",
  football_facup: "FA Cup",
  football_ucl: "Champions League",
  football_manu: "Manchester United",
  football_norway: "Norge",
  football_no_uefa: "Norsk lag i Europa",
  worldcup: "VM 2026",
  personal: "Egen kamp",
};
type LucideComp = React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
const SPORT_ICON: Record<string, LucideComp> = {
  football: Trophy,
  f1: Flag,
  darts: Target,
  athletics: Timer,
  golf: Award,
  worldcup: Trophy,
  personal: Star,
  football_manu: Trophy,
  football_norway: Trophy,
  football_no_uefa: Trophy,
  football_eli: Trophy,
  football_obos: Trophy,
  football_pl: Trophy,
  football_facup: Trophy,
  football_ucl: Trophy,
};

// Nøytral "det er en full liga-runde denne dagen"-indikator — frikoblet fra
// status-positive-semantikken (den er reservert ekte suksess-/positive-tilstander).
const LEAGUE_ROUND_DOT_COLOR = "#8b5cf6";

// Fulle liga-/turnerings-runder grupperes bak en drill-down ("X-runde"), i
// stedet for å liste alle kampene enkeltvis — se LeagueSubsection under.
const LEAGUE_CATS = LEAGUE_ROUND_CATEGORIES;

function SportEventRow({ ev, border = false }: { ev: SportEvent; border?: boolean }) {
  const col = SPORT_COLOR[ev.category] ?? "#6b7280";
  const Icon = SPORT_ICON[ev.category];
  const isHighlight = HIGHLIGHT_CATEGORIES.has(ev.category);
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 ${border ? "border-t border-line" : ""}`}
      style={{ background: isHighlight ? `${col}12` : undefined }}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${col}18` }}>
        {Icon && <Icon size={14} style={{ color: col }} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-1">{ev.name}</p>
        <p className="mt-0.5 truncate text-2xs text-ink-3">
          {ev.competition}
          {ev.venue ? ` · ${ev.venue}` : ""}
        </p>
      </div>
      {ev.time && <span className="shrink-0 text-xs font-bold tabular-nums" style={{ color: col }}>{ev.time}</span>}
    </div>
  );
}

function LeagueSubsection({ cat, matches }: { cat: string; matches: SportEvent[] }) {
  const [open, setOpen] = useState(false);
  const col = SPORT_COLOR[cat] ?? "#6b7280";
  const label = SPORT_LABEL[cat] ?? cat;
  return (
    <div className="border-t border-line">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-2.5 text-left">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${col}18` }}>
          <Trophy size={14} style={{ color: col }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-1">{label}</p>
          <p className="text-2xs text-ink-3">
            {matches.length} {matches.length === 1 ? "kamp" : "kamper"}
          </p>
        </div>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`h-3.5 w-3.5 shrink-0 text-ink-4 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <polyline points="4,6 8,10 12,6" />
        </svg>
      </button>
      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.25s ease" }}>
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div className="border-t border-line">
            {matches.map((ev, i) => (
              <SportEventRow key={ev.id} ev={ev} border={i > 0} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Skiller en dags kamper i tre: fremhevede enkeltkamper (Viking/Man Utd/Norge
// + andre ikke-liga-sporter), og fulle liga-runder gruppert per turnering
// (dedupet mot de fremhevede, samme mønster som backend-dedupen i lib/sports.ts).
//
// "Norsk lag i Europa" (football_no_uefa) kan ha flere kamper samme dag (en
// hel runde med norske Europa-/Conference League-lag) — da vises kun ÉN åpent
// (Viking om de spiller, ellers den første), og resten legges i en egen
// drilldown (gjenbruker LeagueSubsection, samme visuelle mønster som en
// liga-runde) i stedet for å liste alle enkeltvis.
function splitDayEvents(dayEvts: SportEvent[]) {
  const allHighlights = dayEvts.filter((e) => HIGHLIGHT_CATEGORIES.has(e.category));
  const euroEvts = allHighlights.filter((e) => e.category === "football_no_uefa");
  const otherHighlights = allHighlights.filter((e) => e.category !== "football_no_uefa");

  let shownEuro: SportEvent[] = [];
  let euroDrilldown: SportEvent[] = [];
  if (euroEvts.length > 0) {
    const vikingIdx = euroEvts.findIndex((e) => e.name.toLowerCase().includes("viking"));
    const primaryIdx = vikingIdx !== -1 ? vikingIdx : 0;
    shownEuro = [euroEvts[primaryIdx]];
    euroDrilldown = euroEvts.filter((_, i) => i !== primaryIdx);
  }

  const highlightEvts = [...otherHighlights, ...shownEuro];
  const highlightNames = new Set(allHighlights.map((e) => e.name.toLowerCase()));
  const otherEvts = dayEvts.filter((e) => !HIGHLIGHT_CATEGORIES.has(e.category) && !LEAGUE_CATS.has(e.category));
  const leagueGroups = [...LEAGUE_CATS]
    .map((cat) => ({
      cat,
      matches: dayEvts.filter((e) => e.category === cat && !highlightNames.has(e.name.toLowerCase())),
    }))
    .filter((g) => g.matches.length > 0);
  return { highlightEvts, otherEvts, leagueGroups, euroDrilldown };
}

function SportDayCard({ date, allEvents }: { date: string; allEvents: SportEvent[] }) {
  // Åpen fra start — resten av uken skal vises uten et ekstra klikk.
  const [open, setOpen] = useState(true);

  const dayEvts = allEvents.filter((e) => e.date === date);
  const { highlightEvts, otherEvts, leagueGroups, euroDrilldown } = splitDayEvents(dayEvts);

  const hasEvents = dayEvts.length > 0;
  const d = daysUntil(date);
  const dateObj = new Date(date + "T12:00:00");
  const dayName =
    d === 1
      ? "I morgen"
      : dateObj.toLocaleDateString("nb-NO", { weekday: "long" }).replace(/^\w/, (c) => c.toUpperCase());
  const dateNum = dateObj.toLocaleDateString("nb-NO", { day: "numeric", month: "long" });

  const dotCats = [...new Set(dayEvts.filter((e) => !LEAGUE_CATS.has(e.category)).map((e) => e.category))];
  const hasLeague = leagueGroups.length > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface-2">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:opacity-75"
        style={{ cursor: hasEvents ? "pointer" : "default" }}
        onClick={() => hasEvents && setOpen((v) => !v)}
        disabled={!hasEvents}
        aria-expanded={hasEvents ? open : undefined}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-ink-1">{dayName}</p>
            {dotCats.map((cat) => (
              <div key={cat} className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SPORT_COLOR[cat] ?? "#9ca3af" }} />
            ))}
            {hasLeague && <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: LEAGUE_ROUND_DOT_COLOR }} />}
          </div>
          <p className="mt-0.5 text-2xs text-ink-4">{dateNum}</p>
        </div>
        {hasEvents ? (
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={`h-3.5 w-3.5 shrink-0 text-ink-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          >
            <polyline points="4,6 8,10 12,6" />
          </svg>
        ) : (
          <span className="text-2xs text-ink-4">–</span>
        )}
      </button>

      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.25s ease" }}>
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div className="border-t border-line">
            {[...highlightEvts, ...otherEvts].map((ev, i) => (
              <SportEventRow key={ev.id} ev={ev} border={i > 0} />
            ))}
            {leagueGroups.map((g) => (
              <LeagueSubsection key={g.cat} cat={g.cat} matches={g.matches} />
            ))}
            {euroDrilldown.length > 0 && <LeagueSubsection cat="football_no_uefa" matches={euroDrilldown} />}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SportSection({
  events,
  loading,
  fetchedAt,
}: {
  events: SportEvent[];
  loading: boolean;
  fetchedAt?: number | null;
}) {
  // Åpen fra start — resten av uken skal vises uten et ekstra klikk.
  const [showWeek, setShowWeek] = useState(true);
  // Egen andre disclosure — to uker til utover den første, holdt separat fra
  // showWeek slik at man kan se resten av uken uten å drukne i tre uker med
  // dagkort med det samme.
  const [showMoreWeeks, setShowMoreWeeks] = useState(false);
  const today = todayStr();
  const todayEvents = events.filter((e) => e.date === today);
  const {
    highlightEvts: todayHighlights,
    otherEvts: todayOthers,
    leagueGroups: todayLeagueGroups,
    euroDrilldown: todayEuroDrilldown,
  } = splitDayEvents(todayEvents);
  function dayOffset(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return toOsloDateString(d);
  }
  const restDays = Array.from({ length: 7 }, (_, i) => dayOffset(i)).filter(
    (day) => day !== today && events.some((e) => e.date === day),
  );
  const moreWeeksDays = Array.from({ length: 14 }, (_, i) => dayOffset(i + 7)).filter((day) =>
    events.some((e) => e.date === day),
  );

  return (
    <div className="border-t-2 border-t-accent/60 p-4">
      <CardHeader
        title="Sport"
        subtitle={todayEvents.length > 0 ? `${todayEvents.length} i dag` : "Ingen i dag"}
        icon={Trophy}
        iconColorClass="text-accent"
      />
        {loading && !events.length ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((n) => (
              <div key={n} className="h-12 animate-pulse rounded-xl bg-surface-2" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {todayEvents.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
                {[...todayHighlights, ...todayOthers].map((ev, i) => (
                  <SportEventRow key={ev.id} ev={ev} border={i > 0} />
                ))}
                {todayLeagueGroups.map((g) => (
                  <LeagueSubsection key={g.cat} cat={g.cat} matches={g.matches} />
                ))}
                {todayEuroDrilldown.length > 0 && (
                  <LeagueSubsection cat="football_no_uefa" matches={todayEuroDrilldown} />
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-3">Ingen kamper i dag.</p>
            )}
            {restDays.length > 0 && (
              <>
                {showWeek && (
                  <div className="mt-1 flex flex-col gap-2">
                    {restDays.map((day) => (
                      <SportDayCard key={day} date={day} allEvents={events} />
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowWeek((v) => !v)}
                  className="mt-1 text-left text-xs font-medium text-accent-privat hover:text-accent-privat/80"
                >
                  {showWeek ? "Vis mindre" : "Mer (resten av uken)"}
                </button>
              </>
            )}
            {showWeek && moreWeeksDays.length > 0 && (
              <>
                {showMoreWeeks && (
                  <div className="mt-1 flex flex-col gap-2">
                    {moreWeeksDays.map((day) => (
                      <SportDayCard key={day} date={day} allEvents={events} />
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowMoreWeeks((v) => !v)}
                  className="mt-1 text-left text-xs font-medium text-accent-privat hover:text-accent-privat/80"
                >
                  {showMoreWeeks ? "Vis mindre" : "Vis flere uker"}
                </button>
              </>
            )}
            {fetchedAt && <p className="mt-1 text-2xs text-ink-4">Oppdatert {timeAgo(fetchedAt)}</p>}
          </div>
        )}
    </div>
  );
}

function WorldCupDayCard({ date, matches }: { date: string; matches: SportEvent[] }) {
  const [open, setOpen] = useState(false);
  const d = daysUntil(date);
  const dateObj = new Date(date + "T12:00:00");
  const isToday = d === 0;
  const dayName =
    isToday
      ? "I dag"
      : d === 1
        ? "I morgen"
        : dateObj.toLocaleDateString("nb-NO", { weekday: "long" }).replace(/^\w/, (c) => c.toUpperCase());
  const dateNum = dateObj.toLocaleDateString("nb-NO", { day: "numeric", month: "long" });

  return (
    <div
      className={`overflow-hidden rounded-2xl border ${isToday ? "border-accent-privat/40 bg-surface-2" : "border-line bg-surface-2"}`}
    >
      {isToday && <div className="h-[2px] bg-accent-privat" />}
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:opacity-75"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-1">{dayName}</p>
          <p className="mt-0.5 text-2xs text-ink-4">{dateNum}</p>
        </div>
        <span className="text-2xs font-medium tabular-nums text-ink-4">
          {matches.length} {matches.length === 1 ? "kamp" : "kamper"}
        </span>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`h-3.5 w-3.5 shrink-0 text-ink-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <polyline points="4,6 8,10 12,6" />
        </svg>
      </button>
      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.28s ease" }}>
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div className="border-t border-line">
            {matches.map((ev, i) => (
              <SportEventRow key={ev.id} ev={ev} border={i > 0} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorldCupSection({
  events,
  loading = false,
  fetchedAt,
}: {
  events: SportEvent[];
  loading?: boolean;
  fetchedAt?: number | null;
}) {
  const [showMore, setShowMore] = useState(false);
  if (!events.length && !loading) return null;

  const today = todayStr();
  const byDay = new Map<string, SportEvent[]>();
  for (const e of events) {
    let displayDate = e.date;
    if (e.time && e.time < "11:00") {
      const d = new Date(e.date + "T12:00:00");
      d.setDate(d.getDate() - 1);
      displayDate = toOsloDateString(d);
    }
    const arr = byDay.get(displayDate) ?? [];
    arr.push(e);
    byDay.set(displayDate, arr);
  }
  const days = [...byDay.keys()].sort();
  const todayMatches = byDay.get(today) ?? [];
  const restDays = days.filter((d) => d !== today);

  return (
    <div className="p-4">
      <CardHeader title="VM 2026" subtitle={`${events.length} kamper`} icon={Trophy} />
        {loading && !events.length ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((n) => (
              <div key={n} className="h-12 animate-pulse rounded-xl bg-surface-2" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {todayMatches.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
                {todayMatches.map((ev, i) => (
                  <SportEventRow key={ev.id} ev={ev} border={i > 0} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-3">Ingen kamper i dag.</p>
            )}
            {restDays.length > 0 && (
              <>
                {showMore && (
                  <div className="mt-1 flex flex-col gap-2">
                    {restDays.map((day) => (
                      <WorldCupDayCard key={day} date={day} matches={byDay.get(day)!} />
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowMore((v) => !v)}
                  className="mt-1 text-left text-xs font-medium text-accent-privat hover:text-accent-privat/80"
                >
                  {showMore ? "Vis mindre" : "Mer (resten av turneringen)"}
                </button>
              </>
            )}
            {fetchedAt && <p className="mt-1 text-2xs text-ink-4">Oppdatert {timeAgo(fetchedAt)}</p>}
          </div>
        )}
    </div>
  );
}
