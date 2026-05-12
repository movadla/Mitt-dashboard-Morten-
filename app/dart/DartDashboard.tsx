"use client";

import { useState, useMemo } from "react";
import type { ScoliaData, SessionSnap } from "@/lib/scolia";

// ── Board geometry ─────────────────────────────────────────────────────────
const CX = 200, CY = 200, SCALE = 190 / 170;
const R = { bullIn: 7, bullOut: 18, triIn: 111, triOut: 120, dblIn: 181, dblOut: 190 };
const SECTORS = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
const SECTOR_IDX: Record<number, number> = Object.fromEntries(SECTORS.map((n, i) => [n, i]));

function polar(deg: number, r: number): [number, number] {
  const a = (deg - 90) * Math.PI / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}
function sectorArc(r1: number, r2: number, si: number): string {
  const s = si * 18 - 9, e = si * 18 + 9;
  const [x1,y1] = polar(s,r2); const [x2,y2] = polar(e,r2);
  const [x3,y3] = polar(e,r1); const [x4,y4] = polar(s,r1);
  const n = (v: number) => v.toFixed(2);
  return `M${n(x1)},${n(y1)} A${r2},${r2} 0 0,1 ${n(x2)},${n(y2)} L${n(x3)},${n(y3)} A${r1},${r1} 0 0,0 ${n(x4)},${n(y4)}Z`;
}

// ── Realistic throw generator (seeded, deterministic) ─────────────────────
function seededRng(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}
function randn(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng(); while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function aimThrow(rng: () => number, sectorNum: number, aimR: number, sigR: number, sigDeg: number): [number, number] {
  const angle = SECTOR_IDX[sectorNum] * 18;
  const r     = Math.max(5, aimR + randn(rng) * sigR);
  const deg   = angle + randn(rng) * sigDeg;
  const rad   = deg * Math.PI / 180;
  return [r * Math.sin(rad), r * Math.cos(rad)];
}

function generateThrows(): [number, number][] {
  const rng = seededRng(42);
  const throws: [number, number][] = [];
  for (let i = 0; i < 110; i++) throws.push(aimThrow(rng, 20, 115, 22, 14)); // T20 cluster
  for (let i = 0; i < 28;  i++) throws.push(aimThrow(rng, 19, 115, 20, 14)); // T19
  for (let i = 0; i < 22;  i++) throws.push(aimThrow(rng, 20, 186,  8,  6)); // D20 checkout
  for (let i = 0; i < 18;  i++) {                                              // Bull
    const r = Math.abs(randn(rng)) * 11 + 3, a = rng() * 360;
    throws.push([r * Math.sin(a * Math.PI/180), r * Math.cos(a * Math.PI/180)]);
  }
  for (let i = 0; i < 16;  i++) throws.push(aimThrow(rng, 16, 186, 10,  8)); // D16 checkout
  for (let i = 0; i < 14;  i++) throws.push(aimThrow(rng, 18, 115, 20, 14)); // T18
  return throws;
}

// ── Checkout table ─────────────────────────────────────────────────────────
const CHECKOUT: Record<number, string> = {
  170:"T20 T20 Bull",167:"T20 T19 Bull",164:"T20 T18 Bull",161:"T20 T17 Bull",
  160:"T20 T20 D20",158:"T20 T20 D19",157:"T20 T19 D20",156:"T20 T20 D18",
  155:"T20 T19 D19",154:"T20 T18 D20",153:"T20 T19 D18",152:"T20 T20 D16",
  151:"T20 T17 D20",150:"T20 T18 D18",149:"T20 T19 D16",148:"T20 T16 D20",
  147:"T20 T17 D18",146:"T20 T18 D16",145:"T20 T19 D14",144:"T20 T20 D12",
  143:"T20 T17 D16",142:"T20 T14 D20",141:"T20 T15 D18",140:"T20 T16 D16",
  139:"T20 T13 D20",138:"T20 T14 D18",137:"T20 T15 D16",136:"T20 T20 D8",
  135:"T20 T17 D12",134:"T20 T14 D16",133:"T20 T19 D8", 132:"T20 T16 D12",
  131:"T20 T13 D16",130:"T20 T18 D8", 129:"T20 T19 D6", 128:"T20 T16 D10",
  127:"T20 T17 D8", 126:"T20 T18 D6", 125:"T20 T19 D4", 124:"T20 T16 D8",
  123:"T20 T13 D12",122:"T18 T18 D7", 121:"T20 T11 D14",120:"T20 20 D20",
  119:"T19 T12 D13",118:"T20 18 D20", 117:"T20 17 D20", 116:"T20 16 D20",
  115:"T20 15 D20", 114:"T20 14 D20", 113:"T20 13 D20", 112:"T20 12 D20",
  111:"T20 11 D20", 110:"T20 10 D20", 109:"T20 9 D20",  108:"T20 8 D20",
  107:"T19 10 D20", 106:"T20 6 D20",  105:"T20 5 D20",  104:"T18 10 D20",
  103:"T19 6 D20",  102:"T20 2 D20",  101:"T17 10 D20",
  100:"T20 D20",  99:"T19 10 D16", 98:"T20 D19",  97:"T19 D20",
  96:"T20 D18",  95:"T19 D19",    94:"T18 D20",  93:"T19 D18",
  92:"T20 D16",  91:"T17 D20",    90:"T18 D18",  89:"T19 D16",
  88:"T20 D14",  87:"T17 D18",    86:"T18 D16",  85:"T15 D20",
  84:"T20 D12",  83:"T17 D16",    82:"T14 D20",  81:"T19 D12",
  80:"T20 D10",  79:"T13 D20",    78:"T18 D12",  77:"T19 D10",
  76:"T20 D8",   75:"T17 D12",    74:"T14 D16",  73:"T19 D8",
  72:"T16 D12",  71:"T13 D16",    70:"T18 D8",   69:"T19 D6",
  68:"T20 D4",   67:"T17 D8",     66:"T10 D18",  65:"T19 D4",
  64:"T16 D8",   63:"T13 D12",    62:"T10 D16",  61:"T15 D8",
  60:"20 D20",   59:"19 D20",     58:"18 D20",   57:"17 D20",
  56:"16 D20",   55:"15 D20",     54:"14 D20",   53:"13 D20",
  52:"12 D20",   51:"11 D20",     50:"Bull",
  49:"9 D20",    48:"16 D16",     47:"15 D16",   46:"6 D20",
  45:"5 D20",    44:"4 D20",      43:"3 D20",    42:"10 D16",
  41:"9 D16",    40:"D20",        39:"7 D16",    38:"D19",
  37:"5 D16",    36:"D18",        35:"3 D16",    34:"D17",
  33:"1 D16",    32:"D16",        31:"7 D12",    30:"D15",
  29:"7 D11",    28:"D14",        27:"7 D10",    26:"D13",
  25:"5 D10",    24:"D12",        23:"7 D8",     22:"D11",
  21:"5 D8",     20:"D10",        19:"3 D8",     18:"D9",
  17:"1 D8",     16:"D8",         15:"7 D4",     14:"D7",
  13:"5 D4",     12:"D6",         11:"3 D4",     10:"D5",
  9:"1 D4",       8:"D4",          7:"3 D2",      6:"D3",
  5:"1 D2",        4:"D2",          3:"1 D1",      2:"D1",
};
const IMPOSSIBLE = new Set([163, 166, 168, 169]);

// ── Level system ───────────────────────────────────────────────────────────
const LEVELS = [
  { min:  0, max: 40, label: "Nybegynner",  color: "#6b7280" },
  { min: 40, max: 50, label: "Hobbist",     color: "#3b82f6" },
  { min: 50, max: 55, label: "Amatør",      color: "#10b981" },
  { min: 55, max: 60, label: "Mellomnivå",  color: "#34d399" },
  { min: 60, max: 65, label: "Avansert",    color: "#f59e0b" },
  { min: 65, max: 70, label: "Halvproff",   color: "#f97316" },
  { min: 70, max: 999,"label":"Proff/Elite",color: "#ef4444" },
];
function getLevel(avg: number) {
  return LEVELS.find(l => avg >= l.min && avg < l.max) ?? LEVELS[LEVELS.length - 1];
}

// ── Utilities ──────────────────────────────────────────────────────────────
function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m  = Math.floor(ms / 60000);
  if (m < 60) return `${m}m siden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}t siden`;
  return `${Math.floor(h / 24)}d siden`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("no", { day: "numeric", month: "short" });
}
function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("no", { month: "short" });
}

// ── Expand/collapse ────────────────────────────────────────────────────────
function useExpanded(defaults: Record<string, boolean> = {}) {
  const [state, setState] = useState<Record<string, boolean>>(defaults);
  const toggle = (k: string) => setState(p => ({ ...p, [k]: !p[k] }));
  const isOpen = (k: string) => state[k] ?? false;
  return { toggle, isOpen };
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      className={`text-zinc-600 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

interface SectionProps {
  id: string; title: string; summary: React.ReactNode;
  isOpen: boolean; onToggle: () => void; children: React.ReactNode;
}
function Section({ title, summary, isOpen, onToggle, children }: SectionProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden mb-3">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 gap-3">
        <p className="text-zinc-500 text-xs uppercase tracking-widest shrink-0">{title}</p>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-zinc-400 text-xs truncate">{summary}</span>
          <Chevron open={isOpen} />
        </div>
      </button>
      {isOpen && <div className="px-4 pb-4 border-t border-white/5 pt-3">{children}</div>}
    </div>
  );
}

// ── Board status ───────────────────────────────────────────────────────────
function BoardStatus({ online, lastOnlineDate }: { online: boolean; lastOnlineDate: string | null }) {
  if (online) return (
    <span className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"
        style={{ boxShadow: "0 0 5px #10b981" }} />
      <span className="text-emerald-400 text-xs">Online</span>
    </span>
  );
  const ago = lastOnlineDate ? timeSince(lastOnlineDate) : null;
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
      <span className="text-zinc-600 text-xs">{ago ? `Sist sett ${ago}` : "Offline"}</span>
    </span>
  );
}

// ── Level indicator ────────────────────────────────────────────────────────
function LevelIndicator({ avg }: { avg: number }) {
  const curr  = getLevel(avg);
  const next  = LEVELS.find(l => l.min > curr.min);
  const pct   = next ? Math.min(100, ((avg - curr.min) / (next.min - curr.min)) * 100) : 100;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-zinc-500 text-xs uppercase tracking-widest">Nivå</span>
        <span className="font-semibold text-sm" style={{ color: curr.color }}>{curr.label}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-1.5">
        <div className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: curr.color }} />
      </div>
      <div className="flex justify-between">
        <span className="text-zinc-600 text-xs font-mono">{avg.toFixed(1)}</span>
        {next && (
          <span className="text-zinc-600 text-xs">
            {(next.min - avg).toFixed(1)} snitt til {next.label}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Sessions chart ─────────────────────────────────────────────────────────
function SessionsChart({ sessions, careerAvg }: { sessions: SessionSnap[]; careerAvg: number }) {
  const recent = sessions.slice(-14);
  if (recent.length < 2) return <p className="text-zinc-600 text-xs">Ikke nok data</p>;
  const W = 300, H = 72, gap = 2;
  const barW  = (W - gap * (recent.length - 1)) / recent.length;
  const avgs  = recent.map(s => s.avg);
  const minV  = Math.min(...avgs, careerAvg - 5, 25);
  const maxV  = Math.max(...avgs, careerAvg + 5);
  const range = maxV - minV || 1;
  const toY   = (v: number) => H - ((v - minV) / range) * (H - 14) - 2;
  const avgY  = toY(careerAvg);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" style={{ height: H + 18 }}>
        <line x1={0} y1={avgY} x2={W} y2={avgY} stroke="#3f3f46" strokeWidth="0.5" strokeDasharray="3,3" />
        <text x={W - 1} y={avgY - 3} textAnchor="end" fontSize="6.5" fill="#52525b" fontFamily="monospace">
          snitt {careerAvg.toFixed(1)}
        </text>
        {recent.map((s, i) => {
          const x    = i * (barW + gap);
          const barH = Math.max(3, toY(minV) - toY(s.avg));
          const y    = toY(s.avg);
          const up   = s.avg >= careerAvg;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH}
                fill={up ? "rgba(16,185,129,0.55)" : "rgba(239,68,68,0.45)"} rx="1.5" />
              <text x={x + barW/2} y={y - 2} textAnchor="middle" fontSize="6"
                fill={up ? "#10b981" : "#ef4444"} fontFamily="monospace">{s.avg.toFixed(1)}</text>
              {i % 3 === 0 && (
                <text x={x + barW/2} y={H + 14} textAnchor="middle" fontSize="6"
                  fill="#52525b" fontFamily="monospace">{fmtDate(s.date)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {recent.some(s => s.checkoutPct !== null) && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <p className="text-zinc-600 text-xs mb-1">Checkout % per sesjon</p>
          <CheckoutLine sessions={recent} />
        </div>
      )}
    </div>
  );
}

function CheckoutLine({ sessions }: { sessions: SessionSnap[] }) {
  const vals = sessions.map(s => s.checkoutPct ?? 0);
  const maxV = Math.max(...vals, 20);
  const W = 300, H = 28, step = W / (sessions.length - 1);
  const pts = vals.map((v, i) => ({ x: i * step, y: H - (v / maxV) * (H - 4) - 2 }));
  const line = pts.map((p, i) => `${i?"L":"M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
      <path d={line} fill="none" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => sessions[i].checkoutPct !== null &&
        <circle key={i} cx={p.x} cy={p.y} r="2" fill="#38bdf8" />)}
    </svg>
  );
}

// ── Monthly comparison ─────────────────────────────────────────────────────
function MonthlyChart({ sessions, careerAvg }: { sessions: SessionSnap[]; careerAvg: number }) {
  const monthly = useMemo(() => {
    const map: Record<string, { scoreSum: number; visits: number }> = {};
    for (const s of sessions) {
      const key = s.date.slice(0, 7);
      if (!map[key]) map[key] = { scoreSum: 0, visits: 0 };
      map[key].visits   += s.throws;
      map[key].scoreSum += (s.avg / 3) * s.throws;
    }
    return Object.entries(map)
      .map(([month, { visits, scoreSum }]) => ({
        month,
        avg:    visits > 0 ? (scoreSum / visits) * 3 : 0,
        visits,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6);
  }, [sessions]);

  if (monthly.length < 2) return <p className="text-zinc-600 text-xs">Ikke nok data</p>;

  const W = 300, H = 80, gap = 6;
  const barW  = (W - gap * (monthly.length - 1)) / monthly.length;
  const avgs  = monthly.map(m => m.avg);
  const minV  = Math.min(...avgs, careerAvg - 5);
  const maxV  = Math.max(...avgs, careerAvg + 3);
  const range = maxV - minV || 1;
  const toY   = (v: number) => H - ((v - minV) / range) * (H - 16) - 2;
  const avgY  = toY(careerAvg);
  const curr  = monthly.at(-1);
  const prev  = monthly.at(-2);
  const delta = curr && prev ? curr.avg - prev.avg : 0;

  return (
    <div>
      <div className="flex justify-between mb-3">
        <span className="text-zinc-400 text-xs">
          {curr?.avg.toFixed(1)} denne måneden
        </span>
        <span className={`text-xs font-mono ${delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {delta >= 0 ? "+" : ""}{delta.toFixed(1)} vs forrige
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" style={{ height: H + 18 }}>
        <line x1={0} y1={avgY} x2={W} y2={avgY} stroke="#3f3f46" strokeWidth="0.5" strokeDasharray="3,3" />
        {monthly.map((m, i) => {
          const x    = i * (barW + gap);
          const barH = Math.max(3, toY(minV) - toY(m.avg));
          const y    = toY(m.avg);
          const up   = m.avg >= careerAvg;
          const isLast = i === monthly.length - 1;
          return (
            <g key={m.month}>
              <rect x={x} y={y} width={barW} height={barH}
                fill={up ? "rgba(16,185,129,0.55)" : "rgba(239,68,68,0.45)"}
                rx="2" stroke={isLast ? (up ? "#10b981" : "#ef4444") : "none"} strokeWidth={isLast ? 0.8 : 0} />
              <text x={x + barW/2} y={y - 3} textAnchor="middle" fontSize="7"
                fill={up ? "#10b981" : "#ef4444"} fontFamily="monospace">{m.avg.toFixed(1)}</text>
              <text x={x + barW/2} y={H + 14} textAnchor="middle" fontSize="7"
                fill={isLast ? "#a1a1aa" : "#52525b"} fontFamily="monospace">{fmtMonth(m.month)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Personal records ───────────────────────────────────────────────────────
function PersonalRecords({ sessions, careerAvg }: { sessions: SessionSnap[]; careerAvg: number }) {
  if (sessions.length === 0) return <p className="text-zinc-600 text-xs">Ingen sesjonsdata</p>;
  const best     = sessions.reduce((a, b) => a.avg > b.avg ? a : b);
  const worst    = sessions.reduce((a, b) => a.avg < b.avg ? a : b);
  const biggest  = sessions.reduce((a, b) => a.throws > b.throws ? a : b);
  const bestCo   = sessions.filter(s => s.checkoutPct !== null)
                           .reduce<SessionSnap | null>((a, b) => !a || b.checkoutPct! > a.checkoutPct! ? b : a, null);
  const aboveAvg = sessions.filter(s => s.avg >= careerAvg).length;

  // Current streak above avg (from end)
  let streak = 0;
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].avg >= careerAvg) streak++;
    else break;
  }

  const rows = [
    { label: "Beste sesjon",    value: best.avg.toFixed(1),       sub: fmtDate(best.date),    color: "text-emerald-400" },
    { label: "Svakeste sesjon", value: worst.avg.toFixed(1),      sub: fmtDate(worst.date),   color: "text-red-400" },
    { label: "Flest kast",      value: biggest.throws.toLocaleString("no"), sub: fmtDate(biggest.date), color: "text-zinc-300" },
    ...(bestCo ? [{ label: "Beste checkout", value: `${bestCo.checkoutPct!.toFixed(1)}%`, sub: fmtDate(bestCo.date), color: "text-sky-400" }] : []),
    { label: "Over karrieresnitt", value: `${aboveAvg}/${sessions.length}`, sub: "sesjoner", color: "text-violet-400" },
    ...(streak > 1 ? [{ label: "Nåværende streak", value: `${streak}`, sub: "sesjoner over snitt", color: "text-amber-400" }] : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      {rows.map(({ label, value, sub, color }) => (
        <div key={label} className="flex items-center justify-between">
          <span className="text-zinc-500 text-xs">{label}</span>
          <div className="text-right">
            <span className={`${color} font-mono font-semibold text-sm`}>{value}</span>
            <span className="text-zinc-600 text-xs ml-2">{sub}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Checkout calculator ────────────────────────────────────────────────────
function CheckoutCalc() {
  const [input, setInput] = useState("");
  const score   = parseInt(input, 10);
  const valid   = !isNaN(score) && score >= 2 && score <= 170;
  const path    = valid && !IMPOSSIBLE.has(score) ? CHECKOUT[score] ?? null : null;
  const darts   = path ? path.split(" ") : [];

  function dartColor(d: string): string {
    if (d.startsWith("T"))  return "#f97316"; // triple — orange
    if (d.startsWith("D"))  return "#38bdf8"; // double  — blue
    if (d === "Bull")       return "#ef4444"; // bull    — red
    return "#a1a1aa";                          // single  — grey
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input
          type="number" min={2} max={170} value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Skriv inn score (2–170)"
          className="flex-1 bg-white/10 border border-white/20 rounded-xl px-3 py-2
            text-zinc-200 text-sm placeholder:text-zinc-600
            focus:outline-none focus:border-emerald-500/60 font-mono"
        />
      </div>
      {input && (
        <div className="flex flex-col items-center gap-3 py-2">
          {IMPOSSIBLE.has(score) && (
            <p className="text-red-400 text-sm">Ikke mulig checkout</p>
          )}
          {valid && !IMPOSSIBLE.has(score) && !path && (
            <p className="text-zinc-500 text-sm">Ingen rute funnet</p>
          )}
          {path && (
            <>
              <div className="flex gap-3 justify-center flex-wrap">
                {darts.map((d, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className="rounded-xl border px-3 py-2 text-base font-mono font-bold"
                      style={{ borderColor: dartColor(d) + "60", color: dartColor(d),
                               background: dartColor(d) + "15" }}>
                      {d}
                    </div>
                    <span className="text-zinc-600 text-xs">pil {i+1}</span>
                  </div>
                ))}
              </div>
              <p className="text-zinc-600 text-xs">{darts.length} pil{darts.length > 1 ? "er" : ""} · {score} igjen</p>
            </>
          )}
        </div>
      )}
      <div className="flex gap-3 flex-wrap mt-3 pt-3 border-t border-white/5">
        {[170,160,121,100,81,40].map(n => (
          <button key={n}
            onClick={() => setInput(String(n))}
            className="text-zinc-500 text-xs font-mono hover:text-zinc-300 transition-colors px-2 py-1
              rounded-lg bg-white/5 border border-white/10">
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Hit-rate donut ─────────────────────────────────────────────────────────
function HitDonut({ pct }: { pct: number }) {
  const r = 22, cx = 28, cy = 28, stroke = 5;
  const circ = 2 * Math.PI * r;
  const dash  = (pct / 100) * circ;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#10b981" strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        fontSize="10" fontFamily="monospace" fill="#10b981" fontWeight="600">{Math.round(pct)}%</text>
    </svg>
  );
}

// ── Game completion bar ────────────────────────────────────────────────────
function CompletionBar({ finished, aborted, forsaken }: { finished: number; aborted: number; forsaken: number }) {
  const total = finished + aborted + forsaken || 1;
  const fPct  = (finished / total) * 100;
  const aPct  = (aborted  / total) * 100;
  const foPct = (forsaken / total) * 100;
  return (
    <div>
      <div className="h-1.5 rounded-full overflow-hidden flex mb-2" style={{ gap: 1 }}>
        <div style={{ width: `${fPct}%`,  background: "#10b981" }} />
        <div style={{ width: `${aPct}%`,  background: "rgba(239,68,68,0.6)" }} />
        <div style={{ width: `${foPct}%`, background: "rgba(113,113,122,0.4)" }} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span className="text-emerald-400">{finished.toLocaleString("no")} fullførte ({Math.round(fPct)}%)</span>
        <span className="text-red-400/70">{aborted.toLocaleString("no")} avbrutt</span>
        <span className="text-zinc-700">{forsaken.toLocaleString("no")} forlatt</span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function DartDashboard({ data }: { data: ScoliaData | null }) {
  const { toggle, isOpen } = useExpanded({ sessions: true });
  const s = data?.stats;

  const avg      = s?.avg3dart    ?? 0;
  const avgStr   = avg ? avg.toFixed(1)          : "—";
  const first9   = s ? s.first9avg.toFixed(1)    : "—";
  const checkout = s ? s.checkoutPct.toFixed(1)  : "—";
  const high180  = s ? String(s.high180s)         : "—";
  const hitRate  = s ? s.hitRate.toFixed(1)       : "—";

  const tr = s?.trebles ?? {};
  const totalVisits = (tr.zero??0)+(tr.one??0)+(tr.two??0)+(tr.three??0);
  const treblePct   = totalVisits > 0
    ? Math.round(((tr.one??0)+(tr.two??0)+(tr.three??0)) / totalVisits * 100) : 0;

  const ranges    = s?.ranges ?? {};
  const rangeTotal= Object.values(ranges as Record<string,number>).reduce((a,b)=>a+b,0);
  const RANGES    = [
    { key:"range_0_40",    label:"0–40",    color:"#6b7280" },
    { key:"range_41_60",   label:"41–60",   color:"#10b981" },
    { key:"range_61_80",   label:"61–80",   color:"#34d399" },
    { key:"range_81_100",  label:"81–100",  color:"#6ee7b7" },
    { key:"range_101_140", label:"101–140", color:"#f59e0b" },
    { key:"range_141_180", label:"141–180", color:"#f97316" },
  ];
  const topRange = rangeTotal > 0
    ? RANGES.reduce((a,b) =>
        ((ranges as Record<string,number>)[a.key]??0)>=((ranges as Record<string,number>)[b.key]??0)?a:b)
    : null;

  const nth        = s?.nthDart;
  const nthMax     = nth ? Math.max(nth.first.average, nth.second.average, nth.third.average) : 1;
  const nthSummary = nth
    ? `1: ${nth.first.average.toFixed(1)} · 2: ${nth.second.average.toFixed(1)} · 3: ${nth.third.average.toFixed(1)}`
    : null;

  const trend    = data?.trend    ?? [];
  const sessions = data?.sessions ?? [];
  const lastSession = sessions.at(-1);

  return (
    <>
      {/* Dartskive */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-3">
        <div className="flex justify-between items-center mb-3">
          <p className="text-zinc-500 text-xs uppercase tracking-widest">Kastekart</p>
          <div className="flex items-center gap-3">
            {data && <BoardStatus online={data.boardOnline} lastOnlineDate={data.lastOnlineDate} />}
            <p className="text-zinc-700 text-xs">Modelldist.</p>
          </div>
        </div>
        <DartBoard />
      </div>

      {/* Nivå */}
      {avg > 0 && <LevelIndicator avg={avg} />}

      {/* Stats rad 1 */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <StatCard label="3-pil snitt" value={avgStr}  sub="karriere"     accent="text-emerald-400" />
        <StatCard label="First 9"     value={first9}  sub="snitt"        accent="text-emerald-400" />
      </div>
      {/* Stats rad 2 */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <StatCard label="Checkout" value={`${checkout}%`} sub="double-out"    accent="text-sky-400" />
        <StatCard label="180-ere"  value={high180}         sub="totalt"        accent="text-amber-400" />
        <StatCard label="Hit-rate" value={`${hitRate}%`}   sub="treffprosent"  accent="text-violet-400" />
      </div>

      {/* Siste sesjoner */}
      {sessions.length >= 2 && (
        <Section id="sessions" title="Siste sesjoner"
          summary={lastSession ? `sist: ${lastSession.avg.toFixed(1)} · ${fmtDate(lastSession.date)}` : ""}
          isOpen={isOpen("sessions")} onToggle={() => toggle("sessions")}>
          <SessionsChart sessions={sessions} careerAvg={avg} />
          <p className="text-zinc-600 text-xs mt-3 pt-3 border-t border-white/5">
            {sessions.length} sesjoner registrert
          </p>
        </Section>
      )}

      {/* Månedlig sammenligning */}
      {sessions.length >= 4 && (
        <Section id="monthly" title="Månedlig snitt"
          summary={`siste 6 måneder`}
          isOpen={isOpen("monthly")} onToggle={() => toggle("monthly")}>
          <MonthlyChart sessions={sessions} careerAvg={avg} />
        </Section>
      )}

      {/* Personlige rekorder */}
      {sessions.length >= 3 && (
        <Section id="records" title="Personlige rekorder"
          summary={`best: ${sessions.length > 0 ? Math.max(...sessions.map(s=>s.avg)).toFixed(1) : "—"}`}
          isOpen={isOpen("records")} onToggle={() => toggle("records")}>
          <PersonalRecords sessions={sessions} careerAvg={avg} />
        </Section>
      )}

      {/* Checkout-kalkulator */}
      <Section id="checkout-calc" title="Checkout-kalkulator"
        summary="finn beste vei ut"
        isOpen={isOpen("checkout-calc")} onToggle={() => toggle("checkout-calc")}>
        <CheckoutCalc />
      </Section>

      {/* Pil for pil */}
      {nth && (
        <Section id="nth" title="Snittscore per pil"
          summary={nthSummary}
          isOpen={isOpen("nth")} onToggle={() => toggle("nth")}>
          <div className="flex flex-col gap-3">
            {[
              { label:"1. pil", val:nth.first,  color:"#10b981" },
              { label:"2. pil", val:nth.second, color:"#34d399" },
              { label:"3. pil", val:nth.third,  color:"#6ee7b7" },
            ].map(({ label, val, color }) => (
              <div key={label}>
                <div className="flex justify-between mb-1">
                  <span className="text-zinc-300 text-sm">{label}</span>
                  <span className="text-zinc-200 text-sm font-mono font-semibold">{val.average.toFixed(2)}</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{ width:`${(val.average/(nthMax*1.1))*100}%`, background:color }} />
                </div>
                <p className="text-zinc-600 text-xs mt-1">
                  {val.throwCount.toLocaleString("no")} kast · {val.totalScore.toLocaleString("no")} poeng
                </p>
              </div>
            ))}
            <p className="text-zinc-600 text-xs pt-1 border-t border-white/5">
              {nth.third.average > nth.first.average
                ? `3. pil sterkeste (${nth.third.average.toFixed(2)}) — god justeringsevne`
                : `1. pil sterkeste (${nth.first.average.toFixed(2)}) — starter sterkt`}
            </p>
          </div>
        </Section>
      )}

      {/* Treff & miss */}
      {s && s.hitRate > 0 && (
        <Section id="hitrate" title="Treff & miss"
          summary={`${s.hitRate.toFixed(1)}% treffer`}
          isOpen={isOpen("hitrate")} onToggle={() => toggle("hitrate")}>
          <div className="flex items-center gap-4">
            <HitDonut pct={s.hitRate} />
            <div className="flex-1 flex flex-col gap-2">
              {[
                { label:"Treffer",  pct:s.hitRate,       color:"#10b981" },
                { label:"Bom/bust", pct:100-s.hitRate,   color:"#ef4444" },
              ].map(({ label, pct, color }) => (
                <div key={label}>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-zinc-400 text-xs">{label}</span>
                    <span className="text-zinc-300 text-xs font-mono">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width:`${pct}%`, background:color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* Triple-treffrate */}
      {totalVisits > 0 && (
        <Section id="trebles" title="Triple-treffrate"
          summary={`${treblePct}% treffer triple`}
          isOpen={isOpen("trebles")} onToggle={() => toggle("trebles")}>
          <div className="flex flex-col gap-2.5">
            {[
              { label:"Ingen triple", val:tr.zero??0,  color:"bg-zinc-600/60" },
              { label:"1 triple",     val:tr.one??0,   color:"bg-emerald-500/70" },
              { label:"2 triples",    val:tr.two??0,   color:"bg-amber-400/70" },
              { label:"3 triples",    val:tr.three??0, color:"bg-orange-400/70" },
            ].map(({ label, val, color }) => {
              const pct = Math.round(val / totalVisits * 100);
              return (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-zinc-400 text-xs w-24 shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className={`h-full rounded-full ${color}`} style={{ width:`${pct}%` }} />
                  </div>
                  <span className="text-zinc-500 text-xs w-12 text-right font-mono">
                    {pct}% ({val.toLocaleString("no")})
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-zinc-600 text-xs mt-3 pt-3 border-t border-white/5">
            Basert på {totalVisits.toLocaleString("no")} 3-pilsbesøk
          </p>
        </Section>
      )}

      {/* Poengfordeling */}
      {rangeTotal > 0 && (
        <Section id="ranges" title="Poengfordeling"
          summary={topRange ? `${topRange.label} pts er vanligst` : ""}
          isOpen={isOpen("ranges")} onToggle={() => toggle("ranges")}>
          <div className="flex flex-col gap-2">
            {RANGES.map(({ key, label, color }) => {
              const count = (ranges as Record<string,number>)[key] ?? 0;
              const pct   = Math.round(count / rangeTotal * 100);
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-zinc-400 text-xs w-14 text-right font-mono shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width:`${pct}%`, background:color }} />
                  </div>
                  <span className="text-zinc-500 text-xs w-16 text-right font-mono">
                    {pct}% ({count.toLocaleString("no")})
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-zinc-600 text-xs mt-3 pt-3 border-t border-white/5">
            {rangeTotal.toLocaleString("no")} 3-pilsbesøk totalt
          </p>
        </Section>
      )}

      {/* Snitt over tid */}
      {trend.length >= 2 && (
        <Section id="trend" title="Snitt over tid"
          summary={`${trend.at(-1)?.toFixed(1)} nå · best ${Math.max(...trend).toFixed(1)}`}
          isOpen={isOpen("trend")} onToggle={() => toggle("trend")}>
          <Sparkline data={trend} />
          <div className="flex justify-between mt-1">
            <span className="text-zinc-700 text-xs">90 dager siden</span>
            <span className="text-zinc-700 text-xs">Nå</span>
          </div>
          <div className="flex justify-between mt-3 pt-3 border-t border-white/5">
            <div><p className="text-zinc-600 text-xs">Laveste</p>
              <p className="text-zinc-400 text-sm font-mono">{Math.min(...trend).toFixed(1)}</p></div>
            <div className="text-center"><p className="text-zinc-600 text-xs">Snitt</p>
              <p className="text-zinc-400 text-sm font-mono">{(trend.reduce((a,b)=>a+b,0)/trend.length).toFixed(1)}</p></div>
            <div className="text-right"><p className="text-zinc-600 text-xs">Beste</p>
              <p className="text-emerald-400 text-sm font-mono">{Math.max(...trend).toFixed(1)}</p></div>
          </div>
        </Section>
      )}

      {/* Kast & spill */}
      {(data?.totalThrows ?? 0) > 0 && (
        <Section id="games" title="Kast & spill"
          summary={`${(data?.totalThrows ?? 0).toLocaleString("no")} kast totalt`}
          isOpen={isOpen("games")} onToggle={() => toggle("games")}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div><p className="text-zinc-600 text-xs">Kast totalt</p>
              <p className="text-zinc-200 text-base font-mono font-semibold">
                {(data?.totalThrows ?? 0).toLocaleString("no")}</p></div>
            <div><p className="text-zinc-600 text-xs">Spill totalt</p>
              <p className="text-zinc-200 text-base font-mono font-semibold">
                {(data?.boardGames ?? 0).toLocaleString("no")}</p></div>
            <div><p className="text-zinc-600 text-xs">Bounce-outs</p>
              <p className="text-zinc-400 text-base font-mono font-semibold">
                {(data?.bounceOuts ?? 0).toLocaleString("no")}</p></div>
          </div>
          <p className="text-zinc-600 text-xs mb-2">Fullføringsprosent</p>
          <CompletionBar
            finished={data?.finishedGames ?? 0}
            aborted={data?.abortedGames   ?? 0}
            forsaken={(data?.boardGames ?? 0) - (data?.finishedGames ?? 0) - (data?.abortedGames ?? 0)}
          />
        </Section>
      )}
    </>
  );
}

// ── Dartboard SVG ──────────────────────────────────────────────────────────
const THROWS = generateThrows();

function DartBoard() {
  return (
    <svg viewBox="-15 -15 430 435" className="w-full" style={{ maxHeight: 340 }}>
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-sm">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle cx={CX} cy={CY} r={R.dblOut + 6} fill="#0d0d0d" />

      {SECTORS.map((num, i) => {
        const ev     = i % 2 === 0;
        const single = ev ? "#1a1a1a" : "#c8b47a";
        const band   = ev ? (num === 20 ? "#22844a" : "#1d6b3a") : "#8b1a1a";
        const w      = { stroke:"#111", strokeWidth:"0.8" };
        return (
          <g key={num}>
            <path d={sectorArc(R.dblIn,  R.dblOut, i)} fill={band}   {...w} />
            <path d={sectorArc(R.triOut, R.dblIn,  i)} fill={single} {...w} />
            <path d={sectorArc(R.triIn,  R.triOut, i)} fill={band}   {...w} />
            <path d={sectorArc(R.bullOut,R.triIn,  i)} fill={single} {...w} />
          </g>
        );
      })}
      <circle cx={CX} cy={CY} r={R.bullOut} fill="#1d6b3a" />
      <circle cx={CX} cy={CY} r={R.bullIn}  fill="#8b1a1a" />

      {/* throw dots */}
      {THROWS.map(([x, y], idx) => (
        <circle key={idx}
          cx={(CX + x * SCALE).toFixed(2)} cy={(CY - y * SCALE).toFixed(2)}
          r="2.8" fill="rgba(16,185,129,0.35)" filter="url(#glow-sm)" />
      ))}

      {/* numbers */}
      {SECTORS.map((num, i) => {
        const [lx,ly] = polar(i * 18, R.dblOut + 14);
        return (
          <text key={num} x={lx.toFixed(1)} y={ly.toFixed(1)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={num===20?"13":"11"} fontFamily="monospace"
            fill={num===20?"#f0fdf4":"#6b7280"} fontWeight={num===20?"700":"400"}>
            {num}
          </text>
        );
      })}
    </svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: { label:string; value:string; sub:string; accent:string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col gap-0.5">
      <p className="text-zinc-600 text-xs uppercase tracking-wider">{label}</p>
      <p className={`${accent} text-xl font-semibold font-mono leading-tight`}>{value}</p>
      <p className="text-zinc-700 text-xs">{sub}</p>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const W = 300, H = 56, step = W / (data.length - 1);
  const pts = data.map((v, i) => ({ x:i*step, y:H-((v-min)/range)*(H-4)-2 }));
  const line = pts.map((p,i)=>`${i?"L":"M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length-1].x},${H} L0,${H}Z`;
  const maxIdx = data.indexOf(max), minIdx = data.indexOf(min);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height:56 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#10b981" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sg)" />
      <path d={line} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[maxIdx].x} cy={pts[maxIdx].y} r="3" fill="#10b981" />
      <text x={Math.min(pts[maxIdx].x+4,W-28)} y={pts[maxIdx].y-4}
        fontSize="7" fill="#10b981" fontFamily="monospace">{max.toFixed(1)}</text>
      <circle cx={pts[minIdx].x} cy={pts[minIdx].y} r="3" fill="#ef4444" fillOpacity="0.7" />
      <text x={Math.min(pts[minIdx].x+4,W-28)} y={pts[minIdx].y+10}
        fontSize="7" fill="#ef4444" fontFamily="monospace" fillOpacity="0.7">{min.toFixed(1)}</text>
    </svg>
  );
}
