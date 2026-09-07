"use client";

import { useState } from "react";
import { Trophy, Flag, Target, Timer, Award, Star } from "lucide-react";
import { HIGHLIGHT_CATEGORIES, LEAGUE_ROUND_CATEGORIES } from "@/lib/sportsCategories";
import type { SportEvent } from "@/lib/sports";
import { CardHeader, MutationError, SkeletonRows } from "../CardShell";
import { SECTION_ACCENT } from "./sectionAccents";
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

// Fargene selv er nå tokens i app/globals.css (--color-sport-*) - egen valør per tema der
// kontrasten krever det (se worldcup i html[data-theme="dag"]) - i stedet for rå hex her,
// som DESIGN.md sitt --t-*-system er bygget for å unngå (samme dag/kveld-felle som resten
// av paletten, se innledningen der).
const SPORT_COLOR: Record<string, string> = {
  football: "var(--color-sport-football)",
  f1: "var(--color-sport-f1)",
  darts: "var(--color-sport-darts)",
  athletics: "var(--color-sport-athletics)",
  golf: "var(--color-sport-golf)",
  football_eli: "var(--color-sport-football-eli)",
  football_obos: "var(--color-sport-football-obos)",
  football_pl: "var(--color-sport-football-pl)",
  football_facup: "var(--color-sport-football-facup)",
  football_ucl: "var(--color-sport-football-ucl)",
  football_manu: "var(--color-sport-football-manu)",
  football_norway: "var(--color-sport-football-norway)",
  football_no_uefa: "var(--color-sport-football-no-uefa)",
  worldcup: "var(--color-sport-worldcup)",
  personal: "var(--color-sport-personal)",
  football_lyn: "var(--color-sport-lyn)",
};

// `col` er nå en CSS-variabel-referanse, ikke en hex-streng - kan derfor ikke lenger få en
// alpha-hex-suffiks (`${col}12`) limt på. `color-mix()` gir samme lave-opasitets-tint.
function tint(col: string, percent: number): string {
  return `color-mix(in srgb, ${col} ${percent}%, transparent)`;
}
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
  football_lyn: "Lyn (hjemme)",
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
  football_lyn: Trophy,
};

// Nøytral "det er en full liga-runde denne dagen"-indikator — frikoblet fra
// status-positive-semantikken (den er reservert ekte suksess-/positive-tilstander).
const LEAGUE_ROUND_DOT_COLOR = "#8b5cf6";

// Fulle liga-/turnerings-runder grupperes bak en drill-down ("X-runde"), i
// stedet for å liste alle kampene enkeltvis — se LeagueSubsection under.
const LEAGUE_CATS = LEAGUE_ROUND_CATEGORIES;

// Ingen egen lenke-affordance i UI-et (ikon/tekst) — hele raden er
// klikkbar til et Google-søk på kampen, jf. ønske om at det ikke skal ta
// opp noe ekstra plass i seksjonen.
function sportEventSearchUrl(ev: SportEvent): string {
  const query = [ev.name, ev.competition, ev.date].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function SportEventRow({ ev, border = false }: { ev: SportEvent; border?: boolean }) {
  const col = SPORT_COLOR[ev.category] ?? "#6b7280";
  const Icon = SPORT_ICON[ev.category];
  const isHighlight = HIGHLIGHT_CATEGORIES.has(ev.category);
  return (
    <a
      href={sportEventSearchUrl(ev)}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface-3/50 ${border ? "border-t border-line" : ""}`}
      style={{ background: isHighlight ? tint(col, 7) : undefined }}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: tint(col, 9) }}>
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
    </a>
  );
}

function LeagueSubsection({ cat, matches }: { cat: string; matches: SportEvent[] }) {
  const [open, setOpen] = useState(false);
  const col = SPORT_COLOR[cat] ?? "#6b7280";
  const label = SPORT_LABEL[cat] ?? cat;
  return (
    <div className="border-t border-line">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-2.5 text-left">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: tint(col, 9) }}>
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
  error,
}: {
  events: SportEvent[];
  loading: boolean;
  fetchedAt?: number | null;
  // Feilen fra useSWR i PrivatPanel.tsx - tidligere ikke sendt inn i det hele tatt, så en
  // feilet /api/sports-henting så identisk ut som en helt vanlig, tom dag ("Ingen i dag"),
  // uten noe tegn til brukeren om at noe faktisk gikk galt.
  error?: unknown;
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
    // border-t-sky-400 må matche SECTION_ACCENT.sport — se sectionAccents.ts. Kortet brukte
    // tidligere `accent`, altså JOBB-fanens blå, midt i Privat-fanen (2026-09-07).
    <div className="border-t-2 border-t-sky-400/60 p-4">
      <CardHeader
        title="Sport"
        stat={
          todayEvents.length > 0
            ? { value: todayEvents.length, label: todayEvents.length === 1 ? "kamp i dag" : "kamper i dag" }
            : undefined
        }
        subtitle={todayEvents.length === 0 ? "Ingen kamper i dag" : undefined}
        icon={Trophy}
        iconColorClass={SECTION_ACCENT.sport}
      />
        {loading && !events.length ? (
          <SkeletonRows count={3} className="h-12" />
        ) : error && !events.length ? (
          <MutationError message="Kunne ikke hente sportsdata — prøv å laste siden på nytt." />
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
  error,
}: {
  events: SportEvent[];
  loading?: boolean;
  fetchedAt?: number | null;
  error?: unknown;
}) {
  const [showMore, setShowMore] = useState(false);
  // PrivatPanel.tsx sin egen render-gate matcher denne (worldCup.length > 0 || loading ||
  // error) - uten `error` her forsvant HELE seksjonen sporløst fra "Mer"-navigasjonen ved en
  // feilet henting, i stedet for å vise at noe faktisk gikk galt.
  if (!events.length && !loading && !error) return null;

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
          <SkeletonRows count={3} className="h-12" />
        ) : error && !events.length ? (
          <MutationError message="Kunne ikke hente VM-data — prøv å laste siden på nytt." />
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
