"use client";

import { useState } from "react";
import { Trophy, Flag, Target, Timer, Award } from "lucide-react";
import type { SportEvent } from "@/lib/sports";
import { CARD_SHELL, CardHeader, usePersistedCollapse } from "../CardShell";

export type { SportEvent } from "@/lib/sports";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
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
  worldcup: "#eab308",
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
  worldcup: "VM 2026",
};
type LucideComp = React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
const SPORT_ICON: Record<string, LucideComp> = {
  football: Trophy,
  f1: Flag,
  darts: Target,
  athletics: Timer,
  golf: Award,
  worldcup: Trophy,
};

const LEAGUE_CATS = new Set(["football_eli", "football_obos", "football_pl"]);

function SportEventRow({ ev, border = false }: { ev: SportEvent; border?: boolean }) {
  const col = SPORT_COLOR[ev.category] ?? "#6b7280";
  const Icon = SPORT_ICON[ev.category];
  const isViking = ev.category === "football";
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${border ? "border-t" : ""}`}
      style={{ borderColor: "rgba(255,255,255,0.07)", background: isViking ? `${col}12` : undefined }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${col}18` }}>
        {Icon && <Icon size={14} style={{ color: col }} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold truncate" style={{ color: "var(--ds-ink)" }}>{ev.name}</p>
        <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--ds-muted)" }}>
          {ev.competition}{ev.venue ? ` · ${ev.venue}` : ""}
        </p>
        {ev.category === "darts" && (
          <a href="https://www.flashscore.com/darts/" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-semibold mt-1 active:opacity-60" style={{ color: col }}>
            Dagens kamper
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-2.5 h-2.5">
              <path d="M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7M7 1h4v4M11 1 5.5 6.5"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        )}
      </div>
      {ev.time && <span className="font-display text-[11px] font-bold shrink-0 tabular-nums" style={{ color: col }}>{ev.time}</span>}
    </div>
  );
}

function LeagueSubsection({ cat, matches }: { cat: string; matches: SportEvent[] }) {
  const [open, setOpen] = useState(false);
  const col = SPORT_COLOR[cat] ?? "#6b7280";
  const label = SPORT_LABEL[cat] ?? cat;
  return (
    <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${col}18` }}>
          <Trophy size={14} style={{ color: col }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold" style={{ color: "var(--ds-ink)" }}>{label}</p>
          <p className="text-[10px]" style={{ color: "var(--ds-muted)" }}>
            {matches.length} {matches.length === 1 ? "kamp" : "kamper"}
          </p>
        </div>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          style={{ color: "rgba(255,255,255,0.25)" }}>
          <polyline points="4,6 8,10 12,6" />
        </svg>
      </button>
      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.25s ease" }}>
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            {matches.map((ev, i) => <SportEventRow key={ev.id} ev={ev} border={i > 0} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function SportDayCard({ date, allEvents }: { date: string; allEvents: SportEvent[] }) {
  const [open, setOpen] = useState(false);

  const dayEvts = allEvents.filter(e => e.date === date);
  const vikingEvts = dayEvts.filter(e => e.category === "football");
  const vikingNames = new Set(vikingEvts.map(e => e.name.toLowerCase()));
  const otherEvts = dayEvts.filter(e => e.category !== "football" && !LEAGUE_CATS.has(e.category));
  const eliEvts = dayEvts.filter(e => e.category === "football_eli" && !vikingNames.has(e.name.toLowerCase()));
  const obosEvts = dayEvts.filter(e => e.category === "football_obos");
  const plEvts = dayEvts.filter(e => e.category === "football_pl");

  const hasEvents = dayEvts.length > 0;
  const d = daysUntil(date);
  const dateObj = new Date(date + "T12:00:00");
  const dayName = d === 0 ? "I dag" : d === 1 ? "I morgen" :
    dateObj.toLocaleDateString("nb-NO", { weekday: "long" }).replace(/^\w/, c => c.toUpperCase());
  const dateNum = dateObj.toLocaleDateString("nb-NO", { day: "numeric", month: "long" });

  const dotCats = [...new Set(dayEvts.filter(e => !LEAGUE_CATS.has(e.category)).map(e => e.category))];
  const hasLeague = eliEvts.length > 0 || obosEvts.length > 0 || plEvts.length > 0;

  return (
    <div className={`rounded-2xl overflow-hidden ${d === 0 ? "" : "card"}`}
      style={d === 0 ? {
        background: "var(--ds-surface)",
        boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.06), 0 0 0 1px color-mix(in srgb, var(--ds-sport) 40%, transparent), 0 10px 30px -12px rgba(0,0,0,0.65), 0 0 26px -8px color-mix(in srgb, var(--ds-sport) 45%, transparent)",
      } : undefined}>
      {d === 0 && <div className="h-[2px]" style={{ background: "var(--ds-sport)" }} />}
      <button className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-75 active:scale-[0.99] transition-all duration-100"
        style={{ cursor: hasEvents ? "pointer" : "default" }}
        onClick={() => hasEvents && setOpen(v => !v)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-display text-[13px] font-semibold" style={{ color: d === 0 ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.90)" }}>{dayName}</p>
            {dotCats.map(cat => (
              <div key={cat} className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: SPORT_COLOR[cat] ?? "#9ca3af" }} />
            ))}
            {hasLeague && (
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#22c55e" }} />
            )}
          </div>
          <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{dateNum}</p>
        </div>
        {hasEvents ? (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
            className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            style={{ color: "rgba(255,255,255,0.25)" }}>
            <polyline points="4,6 8,10 12,6" />
          </svg>
        ) : (
          <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.18)" }}>–</span>
        )}
      </button>

      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.25s ease" }}>
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            {vikingEvts.map((ev, i) => <SportEventRow key={ev.id} ev={ev} border={i > 0} />)}
            {otherEvts.map((ev, i) => <SportEventRow key={ev.id} ev={ev} border={i > 0 || vikingEvts.length > 0} />)}
            {eliEvts.length > 0 && <LeagueSubsection cat="football_eli" matches={eliEvts} />}
            {obosEvts.length > 0 && <LeagueSubsection cat="football_obos" matches={obosEvts} />}
            {plEvts.length > 0 && <LeagueSubsection cat="football_pl" matches={plEvts} />}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SportSection({ events, loading }: { events: SportEvent[]; loading: boolean }) {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Sport");
  const [showWeek, setShowWeek] = useState(false);
  const today = todayStr();
  const todayEvents = events.filter(e => e.date === today);
  const restDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  }).filter(day => day !== today && events.some(e => e.date === day));

  return (
    <div className={`${CARD_SHELL} p-4`}>
      <CardHeader
        title="Sport"
        subtitle={todayEvents.length > 0 ? `${todayEvents.length} i dag` : "Ingen i dag"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {!collapsed && (
        loading && !events.length ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map(n => (
              <div key={n} className="h-12 rounded-xl bg-surface-2 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {todayEvents.length > 0 ? (
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--ds-surface-2)", boxShadow: "0 0 0 1px rgba(255,255,255,0.05)" }}>
                {todayEvents.map((ev, i) => <SportEventRow key={ev.id} ev={ev} border={i > 0} />)}
              </div>
            ) : (
              <p className="text-sm text-ink-3">Ingen kamper i dag.</p>
            )}
            {restDays.length > 0 && (
              <>
                {showWeek && (
                  <div className="mt-1 flex flex-col gap-2">
                    {restDays.map(day => (
                      <SportDayCard key={day} date={day} allEvents={events} />
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowWeek(v => !v)}
                  className="mt-1 text-left text-xs font-medium text-accent hover:text-accent/80"
                >
                  {showWeek ? "Vis mindre" : "Mer (resten av uken)"}
                </button>
              </>
            )}
          </div>
        )
      )}
    </div>
  );
}

function WorldCupDayCard({ date, matches, defaultOpen }: { date: string; matches: SportEvent[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const d = daysUntil(date);
  const dateObj = new Date(date + "T12:00:00");
  const isToday = d === 0;
  const dayName = isToday ? "I dag" : d === 1 ? "I morgen" :
    dateObj.toLocaleDateString("nb-NO", { weekday: "long" }).replace(/^\w/, c => c.toUpperCase());
  const dateNum = dateObj.toLocaleDateString("nb-NO", { day: "numeric", month: "long" });

  return (
    <div className={`rounded-2xl overflow-hidden ${isToday ? "" : "card"}`}
      style={isToday ? {
        background: "var(--ds-surface)",
        boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.06), 0 0 0 1px color-mix(in srgb, var(--ds-wc) 40%, transparent), 0 10px 30px -12px rgba(0,0,0,0.65), 0 0 26px -8px color-mix(in srgb, var(--ds-wc) 45%, transparent)",
      } : undefined}>
      {isToday && <div className="h-[2px]" style={{ background: "var(--ds-wc)" }} />}
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left active:opacity-75 active:scale-[0.99] transition-all duration-100"
        onClick={() => setOpen(v => !v)}>
        <div className="flex-1 min-w-0">
          <p className="font-display text-[13px] font-semibold" style={{ color: isToday ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.90)" }}>{dayName}</p>
          <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{dateNum}</p>
        </div>
        <span className="font-display text-[10px] tabular-nums font-medium" style={{ color: "var(--ds-faint)" }}>
          {matches.length} {matches.length === 1 ? "kamp" : "kamper"}
        </span>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          style={{ color: "rgba(255,255,255,0.25)" }}>
          <polyline points="4,6 8,10 12,6" />
        </svg>
      </button>
      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.28s ease" }}>
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            {matches.map((ev, i) => <SportEventRow key={ev.id} ev={ev} border={i > 0} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorldCupSection({ events }: { events: SportEvent[] }) {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("VM 2026");
  if (!events.length) return null;

  const byDay = new Map<string, SportEvent[]>();
  for (const e of events) {
    let displayDate = e.date;
    if (e.time && e.time < "11:00") {
      const d = new Date(e.date + "T12:00:00");
      d.setDate(d.getDate() - 1);
      displayDate = d.toISOString().slice(0, 10);
    }
    const arr = byDay.get(displayDate) ?? [];
    arr.push(e);
    byDay.set(displayDate, arr);
  }
  const days = [...byDay.keys()].sort();

  return (
    <div className={`${CARD_SHELL} p-4`}>
      <CardHeader
        title="VM 2026"
        subtitle={`${events.length} kamper`}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {!collapsed && (
        <div className="flex flex-col gap-2">
          {days.map((day, i) => (
            <WorldCupDayCard key={day} date={day} matches={byDay.get(day)!} defaultOpen={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}
