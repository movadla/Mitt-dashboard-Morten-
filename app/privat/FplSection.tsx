"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import Image from "next/image";
import TeamPitch from "./TeamPitch";
import type { FplData, FplTeam, TeamKey } from "@/lib/fpl";
import { CardHeader } from "../CardShell";
import { jsonFetcher } from "@/lib/swrFetcher";
import { timeAgo } from "@/lib/timeAgo";
import { Shirt } from "lucide-react";

export type { FplData } from "@/lib/fpl";

interface PicksResult {
  gw: number; hasLivePlayers: boolean;
  liveGwPoints: number; playingCount: number;
  overallRank: number | null; gwRank: number | null;
  gwAverage?: number | null;
  leagueRanks?: { id: number; rank: number }[];
  error?: string;
}

export function fplParts(deadline: string) {
  const diff = Math.max(0, new Date(deadline).getTime() - Date.now());
  return {
    d: Math.floor(diff / 86_400_000),
    h: Math.floor((diff % 86_400_000) / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1_000),
  };
}

function RankSparkline({ history, color }: { history: { event: number; rank: number }[]; color: string }) {
  if (history.length < 2) return null;
  const ranks = history.map(h => h.rank);
  const min = Math.min(...ranks);
  const max = Math.max(...ranks);
  const range = max - min || 1;
  const W = 64, H = 20, pad = 2;

  const coords = history.map((h, i) => ({
    x: pad + (i / (history.length - 1)) * (W - pad * 2),
    y: pad + ((h.rank - min) / range) * (H - pad * 2),
  }));
  const pts = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  const trend = ranks[ranks.length - 1] < ranks[ranks.length - 2] ? "up" : ranks[ranks.length - 1] > ranks[ranks.length - 2] ? "down" : "flat";
  const lineColor = trend === "up" ? "#34d399" : trend === "down" ? "#f87171" : color;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 opacity-80">
      <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x.toFixed(1)} cy={last.y.toFixed(1)} r="2" fill={lineColor} />
    </svg>
  );
}

function rankDelta(rank: number, last: number | null) {
  if (!last || last === rank) return null;
  return last > rank ? "up" : "down";
}

// Delt SWR-nøkkel med TeamPitch.tsx (samme URL-format) — når begge
// komponenter henter picks for samme managerId dedupliserer SWR sin
// globale cache kallet i stedet for at det gjøres to ganger.
export function usePicksForTeam(managerId: number | undefined): PicksResult | null {
  const { data } = useSWR<PicksResult>(
    managerId ? `/api/fpl/picks?managerId=${managerId}` : null,
    jsonFetcher,
    { refreshInterval: 2 * 60 * 1000 },
  );
  return data && !data.error ? data : null;
}

const TEAM_THEME = {
  fisak: {
    label: "Fisak",
    topBar: "#3b82f6",
    panelBg: "rgba(59,130,246,0.05)",
    glow: "none",
    accent: "#93c5fd",
    accentM: "rgba(147,197,253,",
    leagueHeaderBg: "rgba(59,130,246,0.07)",
    leagueBorder: "rgba(59,130,246,0.18)",
    leagueRowBorder: "rgba(59,130,246,0.09)",
    leagueSubBg: "rgba(0,0,0,0.20)",
    rankColor: "#93c5fd",
    panelLeftBorder: "#3b82f6",
  },
  boko: {
    label: "Boko",
    topBar: "#22c55e",
    panelBg: "rgba(34,197,94,0.05)",
    glow: "none",
    accent: "#86efac",
    accentM: "rgba(134,239,172,",
    leagueHeaderBg: "rgba(34,197,94,0.07)",
    leagueBorder: "rgba(34,197,94,0.18)",
    leagueRowBorder: "rgba(34,197,94,0.09)",
    leagueSubBg: "rgba(0,0,0,0.20)",
    rankColor: "#86efac",
    panelLeftBorder: "#22c55e",
  },
} as const;

function MiniLeaderboard({
  entries, myRank, myTotal, teamName, accent, accentM,
}: {
  entries: { name: string; total: number; rank: number }[];
  myRank: number; myTotal?: number; teamName: string;
  accent: string; accentM: string;
}) {
  const myInTop = entries.some(e => e.rank === myRank);
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "rgba(0,0,0,0.28)" }}>
      {entries.map((e, i) => {
        const isMe = e.rank === myRank;
        return (
          <div key={i}
            className={`flex items-center gap-2.5 px-3 py-2 ${i > 0 ? "border-t" : ""}`}
            style={{ borderColor: "rgba(255,255,255,0.05)", background: isMe ? `${accentM}0.09)` : undefined }}>
            <span className="text-[10px] font-black tabular-nums w-6 text-right shrink-0"
              style={{ color: isMe ? accent : "rgba(255,255,255,0.22)" }}>
              {e.rank}
            </span>
            <span className="flex-1 text-[11px] truncate"
              style={{ color: isMe ? accent : "rgba(255,255,255,0.55)", fontWeight: isMe ? 700 : 400 }}>
              {e.name}
            </span>
            <span className="text-[11px] font-bold tabular-nums shrink-0"
              style={{ color: isMe ? accent : "rgba(255,255,255,0.38)" }}>
              {e.total.toLocaleString("nb-NO")}
            </span>
          </div>
        );
      })}
      {!myInTop && myTotal != null && (
        <>
          <div className="flex items-center justify-center py-0.5 border-t"
            style={{ borderColor: "rgba(255,255,255,0.05)" }}>
            <span style={{ color: "rgba(255,255,255,0.12)", fontSize: 11, letterSpacing: 2 }}>· · ·</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-2 border-t"
            style={{ borderColor: "rgba(255,255,255,0.05)", background: `${accentM}0.09)` }}>
            <span className="text-[10px] font-black tabular-nums w-6 text-right shrink-0"
              style={{ color: accent }}>
              {myRank.toLocaleString("nb-NO")}
            </span>
            <span className="flex-1 text-[11px] truncate font-bold" style={{ color: accent }}>
              {teamName}
            </span>
            <span className="text-[11px] font-bold tabular-nums shrink-0" style={{ color: accent }}>
              {myTotal.toLocaleString("nb-NO")}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function ForwardCalc({ gap, currentGw, accentM }: {
  gap: number; currentGw: number; accentM: string;
}) {
  const remaining = 38 - currentGw;
  if (remaining <= 0) return null;
  const perGw = Math.ceil(gap / remaining);
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
      style={{ background: "rgba(0,0,0,0.22)" }}>
      <div className="shrink-0 text-center" style={{ minWidth: 48 }}>
        <p className="text-[26px] font-black tabular-nums leading-none"
          style={{ color: `${accentM}0.75)` }}>{perGw}</p>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] mt-0.5"
          style={{ color: `${accentM}0.32)` }}>p/runde</p>
      </div>
      <div>
        <p className="text-[10px] leading-snug" style={{ color: "rgba(255,255,255,0.40)" }}>
          for å nå målet på{" "}
          <span style={{ color: `${accentM}0.65)`, fontWeight: 700 }}>
            {remaining} gjenværende {remaining === 1 ? "runde" : "runder"}
          </span>
        </p>
        <p className="text-[10px] mt-1 tabular-nums" style={{ color: "rgba(255,255,255,0.22)" }}>
          {gap}p mangler totalt
        </p>
      </div>
    </div>
  );
}

function LeaguesPanel({
  team, teamKey, liveRanks,
}: {
  team: FplTeam; teamKey: TeamKey;
  liveRanks?: { id: number; rank: number }[];
}) {
  const [expandedLeagueId, setExpandedLeagueId] = useState<number | null>(null);
  const th = TEAM_THEME[teamKey];
  const teamUrl = team.currentGw
    ? `https://fantasy.premierleague.com/entry/${team.teamId}/event/${team.currentGw}`
    : `https://fantasy.premierleague.com/entry/${team.teamId}/history`;

  return (
    <div className="border-l-[3px]" style={{ borderLeftColor: th.topBar }}>
      <div className="flex items-center gap-3 px-4 py-2.5 border-b"
        style={{ background: th.leagueHeaderBg, borderColor: th.leagueBorder }}>
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: th.topBar }} />
        <p className="text-[10px] font-black uppercase tracking-[0.16em] flex-1" style={{ color: th.accent }}>
          {team.teamName}
        </p>
        {team.gwHistory && team.gwHistory.length >= 2 && (
          <RankSparkline history={team.gwHistory} color={th.accent} />
        )}
        {teamKey === "boko" && (
          <a href="https://boko-haramsdale.vercel.app" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] ml-1"
            style={{ color: `${th.accentM}0.4)` }}>
            Boko
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-2.5 h-2.5">
              <path d="M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7M7 1h4v4M11 1 5.5 6.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        )}
        <a href={teamUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] ml-1"
          style={{ color: `${th.accentM}0.4)` }}>
          FPL
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-2.5 h-2.5">
            <path d="M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7M7 1h4v4M11 1 5.5 6.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>

      <div className="flex items-center px-3 pt-2 pb-1">
        <p className="flex-1 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `${th.accentM}0.3)` }}>Liga</p>
        <p className="w-16 text-right text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: `${th.accentM}0.3)` }}>Nå</p>
        <p className="w-10 text-right text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: `${th.accentM}0.3)` }}>Forrige</p>
        <div className="w-5" />
      </div>

      <div className="pb-2">
        {team.leagues.map((league, i) => {
          const liveRank = liveRanks?.find(r => r.id === league.id)?.rank;
          const displayRank = liveRank ?? league.rank;
          const prevRank = liveRank != null ? league.rank : league.lastRank;
          const delta = rankDelta(displayRank, prevRank);
          const isExpanded = expandedLeagueId === league.id;
          const gap = league.gapToTarget;
          const target = league.targetRank ?? 1;
          const inTarget = gap !== undefined && gap >= 0;

          return (
            <div key={league.id}
              className={i > 0 ? "border-t" : ""}
              style={i > 0 ? { borderColor: th.leagueRowBorder } : undefined}>

              <button
                onClick={() => setExpandedLeagueId(isExpanded ? null : league.id)}
                aria-expanded={isExpanded}
                className="w-full flex items-center px-3 py-2 text-left">
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-[11px] text-white/65 truncate leading-tight">{league.name}</p>
                </div>
                <div className="w-16 flex items-center justify-end gap-1 shrink-0">
                  {delta && (
                    <svg viewBox="0 0 10 10" fill="currentColor" role="img"
                      aria-label={delta === "up" ? "Rangering opp" : "Rangering ned"}
                      className={`w-1.5 h-1.5 shrink-0 ${delta === "up" ? "text-emerald-400" : "text-red-400"} ${delta === "down" ? "rotate-180" : ""}`}>
                      <polygon points="5,1 9,9 1,9" />
                    </svg>
                  )}
                  <p className="text-[13px] font-black tabular-nums" style={{ color: th.rankColor }}>
                    {displayRank.toLocaleString("nb-NO")}
                  </p>
                </div>
                <p className="w-10 text-right text-[11px] tabular-nums shrink-0"
                  style={{ color: `${th.accentM}0.3)` }}>
                  {prevRank != null ? prevRank.toLocaleString("nb-NO") : "–"}
                </p>
                <div className="w-5 flex items-center justify-end shrink-0">
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"
                    className={`w-3 h-3 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`}
                    style={{ color: `${th.accentM}0.28)` }}>
                    <polyline points="2,4 6,8 10,4" />
                  </svg>
                </div>
              </button>

              {isExpanded && (
                <div className="px-3 pb-4 border-t" style={{ borderColor: th.leagueRowBorder, background: th.leagueSubBg }}>
                  {gap !== undefined && (
                    <div className="pt-2.5 pb-3">
                      <div className="inline-flex items-center px-3 py-1.5 rounded-xl text-[12px] font-black"
                        style={{
                          background: inTarget ? "rgba(52,211,153,0.12)" : "rgba(251,191,36,0.10)",
                          color: inTarget ? "#34d399" : "#fbbf24",
                          border: `1px solid ${inTarget ? "rgba(52,211,153,0.22)" : "rgba(251,191,36,0.20)"}`,
                        }}>
                        {inTarget
                          ? (target === 1 ? "Leder ligaen" : `+${gap}p over mål (topp ${target})`)
                          : `${Math.abs(gap)}p til topp ${target}`}
                      </div>
                    </div>
                  )}
                  {league.topEntries && league.topEntries.length > 0 && (
                    <MiniLeaderboard
                      entries={league.topEntries}
                      myRank={displayRank}
                      myTotal={team.totalPoints}
                      teamName={team.teamName}
                      accent={th.accent}
                      accentM={th.accentM}
                    />
                  )}
                  {!league.topEntries && gap !== undefined && !inTarget && team.currentGw != null && (
                    <ForwardCalc
                      gap={Math.abs(gap)}
                      currentGw={team.currentGw}
                      accentM={th.accentM}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamPanel({
  team, teamKey, isExpanded, onToggle, picks, gwAverage,
}: {
  team: FplTeam | undefined; teamKey: TeamKey; isExpanded: boolean; onToggle: () => void;
  picks?: PicksResult | null; gwAverage?: number | null;
}) {
  const th = TEAM_THEME[teamKey];
  return (
    <button type="button"
      className="flex-1 relative overflow-hidden flex flex-col rounded-xl cursor-pointer select-none text-left"
      style={{ border: `2px solid ${th.topBar}` }}
      onClick={onToggle}
      aria-expanded={isExpanded}>
      <div className="h-[3px] shrink-0" style={{ background: th.topBar }} />
      <div className="flex-1 relative px-4 py-4" style={{ background: th.panelBg }}>
        {teamKey === "boko" && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <Image
              src="/haramsdale.jpg.png"
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 400px"
              className="object-cover object-center"
              style={{ opacity: 0.22 }}
            />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 100%)" }} />
          </div>
        )}
        {teamKey === "fisak" && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <Image
              src="/Isakfpl.jpg"
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 400px"
              className="object-cover object-center"
              style={{ opacity: 0.22 }}
            />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 100%)" }} />
          </div>
        )}
        <div className="absolute inset-0 pointer-events-none" style={{ background: th.glow }} />
        <div className="relative">
          <p className="font-display text-[15px] font-bold text-white leading-tight truncate mb-3"
            style={{ letterSpacing: "-0.01em" }}>
            {team?.teamName ?? "—"}
          </p>
          <div className="flex items-start gap-4 mt-1">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{ color: `${th.accentM}0.4)` }}>Totalt</p>
              <p className="font-display text-[15px] font-semibold tabular-nums leading-tight" style={{ color: "rgba(255,255,255,0.7)" }}>
                {team?.totalPoints?.toLocaleString("nb-NO") ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{ color: `${th.accentM}0.4)` }}>GW{team?.currentGw ?? picks?.gw}</p>
              {(() => {
                const gwPts = picks != null ? picks.liveGwPoints : (team?.currentGwPoints ?? null);
                const above = gwAverage != null && gwPts != null && gwPts > gwAverage;
                const below = gwAverage != null && gwPts != null && gwPts < gwAverage;
                return (
                  <p className="font-display text-[15px] font-semibold tabular-nums leading-tight"
                    style={{ color: above ? "#34d399" : below ? "#f87171" : "rgba(255,255,255,0.7)" }}>
                    {gwPts ?? "—"}
                    {gwAverage != null && gwPts != null && (
                      <span className="text-[10px] font-semibold ml-0.5"
                        style={{ color: `${th.accentM}0.35)` }}>
                        ({gwAverage})
                      </span>
                    )}
                  </p>
                );
              })()}
            </div>
          </div>

          <div className="mt-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ color: `${th.accentM}0.35)` }}>Verdensrang</p>
            <p className="font-display text-[12px] font-semibold tabular-nums leading-tight" style={{ color: "rgba(255,255,255,0.55)" }}>
              {((picks?.overallRank) ?? team?.overallRank)?.toLocaleString("nb-NO") ?? "—"}
            </p>
            {picks?.gwRank != null && (
              <p className="text-[10px] tabular-nums leading-none mt-0.5"
                style={{ color: `${th.accentM}0.4)` }}>
                GW {picks.gwRank.toLocaleString("nb-NO")}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center py-1.5"
        style={{ borderTop: `1px solid ${th.accentM}0.12)`, background: `${th.accentM}0.04)` }}>
        <svg viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="2"
          className={`w-3 h-2 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`}
          style={{ color: `${th.accentM}0.32)` }}>
          <polyline points="1,1 6,7 11,1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </button>
  );
}

// Ticker for nedtelling til deadline (fplParts) leves av foreldrekomponenten
// FplBox alene — FplHero brukes aldri utenfor FplBox, så en egen
// setInterval her ville bare vært en duplisert klokke som tvinger samme
// re-render FplBox allerede gir den via props/re-render fra sin egen ticker.
export function FplHero({ fpl }: { fpl: FplData }) {
  const [expandedTeam, setExpandedTeam] = useState<TeamKey | null>(null);

  const fisak = fpl.teams?.find(t => t.teamKey === "fisak");
  const boko = fpl.teams?.find(t => t.teamKey === "boko");
  const fisakPicks = usePicksForTeam(fisak?.teamId);
  const bokoPicks = usePicksForTeam(boko?.teamId);
  const picks: Record<TeamKey, PicksResult | null> = { fisak: fisakPicks, boko: bokoPicks };

  if (!fpl.active || !fpl.gw?.deadline) return null;
  const { d } = fplParts(fpl.gw.deadline);
  const isPulsing = d === 0;

  const currentGwId = fisak?.currentGw ?? boko?.currentGw;
  const expandedTeamData = expandedTeam ? fpl.teams?.find(t => t.teamKey === expandedTeam) : undefined;
  const anyLive = Object.values(picks).some(p => p?.hasLivePlayers);
  const gwAverage = picks.fisak?.gwAverage ?? picks.boko?.gwAverage ?? fpl.gw.average ?? null;

  return (
    <div className="rounded-2xl overflow-hidden relative"
      style={{ background: "#0c3d22", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.08), 0 0 0 1px color-mix(in srgb, var(--ds-fpl) 18%, transparent), 0 10px 26px -14px rgba(0,0,0,0.65)" }}>

      <Image src="/Topplogofpl.webp" alt="" fill sizes="(max-width: 768px) 100vw, 640px"
        className="object-cover pointer-events-none select-none"
        style={{ objectPosition: "left top", opacity: 0.35, zIndex: 0 }} />
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(to right, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.80) 100%)", zIndex: 0 }} />
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, transparent 25%, rgba(0,0,0,0.60) 100%)", zIndex: 0 }} />

      {isPulsing && (
        <div className="absolute inset-0 rounded-[20px] pointer-events-none animate-pulse"
          style={{ boxShadow: "inset 0 0 0 2px rgba(239,68,68,0.55), 0 0 16px rgba(239,68,68,0.15)", zIndex: 20 }} />
      )}

      <div className="relative flex items-center justify-between border-b px-5 py-3"
        style={{ borderColor: "rgba(255,255,255,0.08)", zIndex: 1 }}>
        {currentGwId && (
          <span className="font-display text-[10px] font-bold tracking-[0.1em] uppercase px-2.5 py-1 rounded-lg border"
            style={{ color: "#34d399", borderColor: "rgba(52,211,153,0.35)", background: "rgba(0,0,0,0.30)" }}>
            GW{currentGwId}
          </span>
        )}
        {anyLive && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg border ml-auto"
            style={{ borderColor: "rgba(239,68,68,0.45)", background: "rgba(0,0,0,0.35)" }}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#ef4444" }} />
            <span className="text-[10px] font-black tracking-[0.1em] uppercase" style={{ color: "#f87171" }}>Live</span>
          </div>
        )}
      </div>

      <div className="flex relative px-3 pt-3 pb-3 gap-2.5 border-b"
        style={{ borderColor: "rgba(255,255,255,0.08)", zIndex: 1 }}>
        <TeamPanel
          team={fisak} teamKey="fisak"
          picks={picks.fisak} gwAverage={gwAverage}
          isExpanded={expandedTeam === "fisak"}
          onToggle={() => setExpandedTeam(expandedTeam === "fisak" ? null : "fisak")}
        />
        <TeamPanel
          team={boko} teamKey="boko"
          picks={picks.boko} gwAverage={gwAverage}
          isExpanded={expandedTeam === "boko"}
          onToggle={() => setExpandedTeam(expandedTeam === "boko" ? null : "boko")}
        />
      </div>

      {expandedTeamData && expandedTeam && (
        <div className="relative" style={{ borderTop: `2px solid ${TEAM_THEME[expandedTeam].topBar}`, zIndex: 1 }}>
          <LeaguesPanel
            team={expandedTeamData}
            teamKey={expandedTeam}
            liveRanks={picks[expandedTeam]?.leagueRanks}
          />
          <div className="px-3 pb-4" style={{ background: "rgba(0,0,0,0.20)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <TeamPitch
              managerId={expandedTeamData.teamId}
              accent={TEAM_THEME[expandedTeam].accent}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function fplCountdownText(deadline: string): string {
  const { d, h, m } = fplParts(deadline);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d)}:${pad(h)}:${pad(m)}`;
}

export function FplBox({ fpl }: { fpl: FplData }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!fpl.active || !fpl.gw?.deadline) return null;

  return (
    <div className="border-t-2 border-t-lime-400/60 p-4">
      <CardHeader
        title="Fantasy Premier League"
        subtitle={fplCountdownText(fpl.gw.deadline)}
        icon={Shirt}
        iconColorClass="text-lime-400"
      />
      <FplHero fpl={fpl} />
      {fpl.fetchedAt && <p className="mt-2 text-2xs text-ink-4">Oppdatert {timeAgo(fpl.fetchedAt)}</p>}
    </div>
  );
}
