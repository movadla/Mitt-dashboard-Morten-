"use client";

import { useState, useEffect } from "react";

interface PickPlayer {
  id: number; webName: string; elementType: number;
  teamCode: number; photoId: string | null;
  isCaptain: boolean; isViceCaptain: boolean;
  multiplier: number; livePoints: number; rawPoints: number; minutes: number; bonus?: number;
  inStarting: boolean; position: number; isPlaying?: boolean;
}
interface PicksData {
  gw?: number; managerId?: string; players?: PickPlayer[];
  error?: string;
}

function PlayerCard({ p, accent }: { p: PickPlayer; accent: string }) {
  const [shirtFailed, setShirtFailed] = useState(false);
  const isGk = p.elementType === 1;
  const shirtUrl = `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${p.teamCode}${isGk ? "_1" : ""}-66.png`;

  // Dim only if the match is not live and player hasn't registered any action
  const inactive = p.inStarting && !p.isPlaying && p.minutes === 0 && p.rawPoints === 0;

  const isOnBench   = !p.inStarting;
  const displayPts  = isOnBench ? p.rawPoints : p.livePoints;
  const hasBonus    = (p.bonus ?? 0) > 0;

  const pointsColor = isOnBench
    ? (p.rawPoints > 0 ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.2)")
    : (p.livePoints > 0 ? accent : "rgba(255,255,255,0.3)");
  const pointsBg    = isOnBench
    ? "rgba(255,255,255,0.06)"
    : (p.livePoints > 0 ? `${accent}22` : "rgba(0,0,0,0.5)");

  return (
    <div className="flex flex-col items-center gap-0.5" style={{ opacity: inactive ? 0.4 : 1 }}>
      {/* Jersey + badges */}
      <div className="relative flex items-center justify-center" style={{ width: 40, height: 44 }}>
        {!shirtFailed ? (
          <img
            src={shirtUrl}
            alt=""
            className="w-full h-full object-contain"
            onError={() => setShirtFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[8px] font-black rounded"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)" }}>
            {p.webName.slice(0, 2).toUpperCase()}
          </div>
        )}

        {/* Bonus badge */}
        {hasBonus && (
          <div className="absolute -top-1 -left-1 flex items-center justify-center rounded-full font-black leading-none shadow-md"
            style={{ width: 14, height: 14, background: "#f59e0b", color: "#000", fontSize: 7 }}>
            +{p.bonus}
          </div>
        )}

        {/* Captain badge */}
        {p.isCaptain && (
          <div className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-[8px] font-black leading-none shadow-md"
            style={{ width: 16, height: 16, background: "#fbbf24", color: "#000" }}>
            C
          </div>
        )}
        {!p.isCaptain && p.isViceCaptain && (
          <div className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-[7px] font-black leading-none"
            style={{ width: 14, height: 14, background: "#64748b", color: "#fff" }}>
            V
          </div>
        )}

        {/* Live pulse for playing players */}
        {p.isPlaying && (
          <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: "#ef4444" }} />
        )}
      </div>

      {/* Name */}
      <p className="text-[7.5px] font-semibold truncate text-center leading-none"
        style={{ maxWidth: 54, color: p.isCaptain ? "#fbbf24" : "rgba(255,255,255,0.72)" }}>
        {p.webName}
      </p>

      {/* Points */}
      <div className="px-2 py-0.5 rounded-md text-[10px] font-black tabular-nums leading-none text-center min-w-[22px]"
        style={{
          background: pointsBg,
          color: pointsColor,
          border: p.isCaptain ? `1px solid ${accent}44` : "1px solid transparent",
          opacity: isOnBench ? 0.75 : 1,
        }}>
        {displayPts}
      </div>
    </div>
  );
}

function PitchBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-xl">
      {/* Base grass gradient */}
      <div className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, #0e2b16 0%, #133219 40%, #0f2913 100%)" }} />

      {/* Grass stripe pattern */}
      <div className="absolute inset-0" style={{
        backgroundImage: "repeating-linear-gradient(180deg, transparent, transparent 28px, rgba(0,0,0,0.08) 28px, rgba(0,0,0,0.08) 56px)",
      }} />

      {/* Pitch markings SVG */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 480" fill="none"
        stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" preserveAspectRatio="none">
        {/* Outer border */}
        <rect x="8" y="8" width="284" height="464" />
        {/* Centre line */}
        <line x1="8" y1="240" x2="292" y2="240" />
        {/* Centre circle */}
        <circle cx="150" cy="240" r="40" />
        <circle cx="150" cy="240" r="2" fill="rgba(255,255,255,0.25)" stroke="none" />
        {/* Top penalty area */}
        <rect x="75" y="8" width="150" height="60" />
        {/* Top 6-yard box */}
        <rect x="110" y="8" width="80" height="22" />
        {/* Top goal */}
        <rect x="120" y="4" width="60" height="8" strokeWidth="1" stroke="rgba(255,255,255,0.25)" />
        {/* Bottom penalty area */}
        <rect x="75" y="412" width="150" height="60" />
        {/* Bottom 6-yard box */}
        <rect x="110" y="450" width="80" height="22" />
        {/* Bottom goal */}
        <rect x="120" y="468" width="60" height="8" strokeWidth="1" stroke="rgba(255,255,255,0.25)" />
      </svg>
    </div>
  );
}

export default function TeamPitch({ managerId, accent }: { managerId?: number; accent: string }) {
  const [data, setData] = useState<PicksData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!managerId) return;
    setLoading(true);
    setData(null);
    fetch(`/api/fpl/picks?managerId=${managerId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setData({ error: "fetch_failed" }); setLoading(false); });
  }, [managerId]);

  if (!managerId) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: `${accent}66`, borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!data || data.error || !data.players?.length) {
    return (
      <div className="flex items-center justify-center h-20">
        <p className="text-[10px] text-white/25">Ingen lagdata tilgjengelig</p>
      </div>
    );
  }

  const starters = data.players.filter(p => p.inStarting).sort((a, b) => a.position - b.position);
  const bench = data.players.filter(p => !p.inStarting).sort((a, b) => a.position - b.position);

  const POS_LABEL: Record<number, string> = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };

  // Group starters by elementType: GK(1), DEF(2), MID(3), FWD(4)
  const rows: PickPlayer[][] = [
    starters.filter(p => p.elementType === 1),
    starters.filter(p => p.elementType === 2),
    starters.filter(p => p.elementType === 3),
    starters.filter(p => p.elementType === 4),
  ].filter(r => r.length > 0);

  return (
    <div className="rounded-xl overflow-hidden">
      {/* Pitch with players */}
      <div className="relative px-2 py-4" style={{ minHeight: 320 }}>
        <PitchBackground />
        <div className="relative flex flex-col justify-around gap-2" style={{ minHeight: 300 }}>
          {rows.map((row, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <p className="text-[7px] font-black uppercase tracking-[0.22em] self-center leading-none"
                style={{ color: "rgba(255,255,255,0.22)" }}>
                {POS_LABEL[row[0]?.elementType]}
              </p>
              <div className="flex justify-around items-center w-full px-1">
                {row.map(p => <PlayerCard key={p.id} p={p} accent={accent} />)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bench */}
      <div className="px-3 pt-2 pb-3"
        style={{ background: "rgba(0,0,0,0.35)", borderTop: `1px solid rgba(255,255,255,0.06)` }}>
        <p className="text-[7px] font-black uppercase tracking-[0.22em] mb-2"
          style={{ color: "rgba(255,255,255,0.2)" }}>Benk</p>
        <div className="flex justify-around">
          {bench.map(p => <PlayerCard key={p.id} p={p} accent={accent} />)}
        </div>
      </div>
    </div>
  );
}
