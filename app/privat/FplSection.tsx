"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import Image from "next/image";
import TeamPitch from "./TeamPitch";
import type { FplData, FplTeam, TeamKey } from "@/lib/fpl";
import type { FplNote } from "@/lib/fplNotes";
import { CardHeader, ConfirmDialog, useConfirmDelete } from "../CardShell";
import { SECTION_ACCENT } from "./sectionAccents";
import { jsonFetcher } from "@/lib/swrFetcher";
import { timeAgo } from "@/lib/timeAgo";
import { Shirt, X } from "lucide-react";

// ─── Farger: alt gjennom tema-tokenene, ingen rå hex ────────────────────────
// Panelet var portert fra et rent mørkt oppsett og bygget på ~90 rå hex/rgba-
// verdier. De omgår --t-*/--color-*-indirektionen (se DESIGN.md sin dag/kveld-
// felle), så FPL-kortet ble stående som en mørk øy på et hvitt kort i dagmodus.
// Nå kommer hver flate, tekstfarge og hårstrek fra et token som bytter verdi
// med temaet, via tre hjelpere:
//
//   alpha(v, %)  gjennomsiktig variant av en tema-variabel. Erstatter det gamle
//                `accentM: "rgba(147,197,253,"` + `${accentM}0.4)`-trikset, som
//                låste fargen til én rå rgba og aldri kunne følge temaet.
//   sunk(%)      nedsenket underflate OG slør over bakgrunnsbildene (de gamle
//                rgba(0,0,0,0.2…0.6)). --ds-surface er mørk i kveld og hvit i
//                dag, så samme uttrykk mørkner i kveld og lysner i dag — det er
//                dette som holder teksten lesbar over foto i BEGGE temaer.
//   ink(%)       tekst/kant i blekkfargen når ingen av --ds-ink-trinnene passer.
function alpha(cssVar: string, pct: number): string {
  return `color-mix(in srgb, var(${cssVar}) ${pct}%, transparent)`;
}
const sunk = (pct: number) => alpha("--ds-surface", pct);
const ink = (pct: number) => alpha("--ds-ink", pct);

// Heroflaten har sin egen token siden ingen Tailwind-trinn eller --ds-*-flate treffer kuløren:
// dyp bane-grønn i kveld (#0c3d22), lys og tonet i dagmodus (#e4f1ec). Se --t-fpl-hero i
// globals.css - lagt inn 2026-09-07, erstattet en color-mix-tilnærming som ble litt for teal.
const HERO_BG = "var(--color-fpl-hero)";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

function RankSparkline({ history, colorVar }: { history: { event: number; rank: number }[]; colorVar: string }) {
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
  // emerald-400/red-400 er de samme kulørene som før, men går nå gjennom
  // --t-*-omdirigeringen i globals.css og blir mørkere i dagmodus.
  const lineColor = trend === "up"
    ? "var(--color-emerald-400)"
    : trend === "down" ? "var(--color-red-400)" : `var(${colorVar})`;

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

// Lagenes identitetsfarge som VARIABELNAVN, ikke ferdig fargeverdi — da kan
// samme kilde brukes både rent (`var(...)`) og med alpha (`alpha(...)`) uten
// at noen av dem faller ut av tema-systemet. Begge lag treffer nå sin
// opprinnelige kulør eksakt: blue-500/300 for Fisak, green-500/300 for Boko
// (de to grønne trinnene ble lagt inn i globals.css sin omdirigeringsliste
// 2026-09-07 nettopp for dette — emerald var en annen kulør).
const TEAM_THEME = {
  fisak: {
    barVar: "--color-blue-500",
    accentVar: "--color-blue-300",
    // TeamPitch tegner banen sin (gress+benk), som er fast mørk i BEGGE temaer - accentVar over
    // ER tema-styrt (blue-300 går mørk marineblå i dagmodus for kontrast mot hvite kort), og
    // ville derfor blitt nesten usynlig på det alltid-mørke gresset. pitchAccent peker i stedet
    // på et eget, ikke-tema-styrt tokenpar (--color-pitch-*, se globals.css) satt opp nettopp
    // for denne banen (2026-09-07).
    pitchAccent: "--color-pitch-blue",
  },
  boko: {
    barVar: "--color-green-500",
    accentVar: "--color-green-300",
    pitchAccent: "--color-pitch-green",
  },
} as const;

// Fritekstnotater for saker som dukker opp i løpet av sesongen og skal
// diskuteres på Boko Haramsdale sitt årsmøte — kun vist under Boko-panelet,
// ikke Fisak. Samme dato/tid-stemplet rediger/slett-mønster som AlfredFreeNote
// (app/privat/AlfredSection.tsx), men styrt med FPL-panelets egne
// grønn-tema-tokens i stedet for appens vanlige CardShell-tokens.
function BokoNotes() {
  const { data, mutate } = useSWR<{ notes: FplNote[] }>("/api/fpl/notes", jsonFetcher);
  const notes = data?.notes ?? [];
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const confirmDelete = useConfirmDelete<string>();
  const th = TEAM_THEME.boko;

  async function submitAdd() {
    if (!draft.trim()) return;
    const res = await fetch("/api/fpl/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: draft.trim() }),
    });
    if (res.ok) {
      const created: FplNote = await res.json();
      mutate((cur) => cur && { notes: [created, ...cur.notes] }, { revalidate: false });
      setDraft("");
      setAdding(false);
    }
  }

  async function submitEdit(id: string) {
    if (!editDraft.trim()) return;
    const res = await fetch(`/api/fpl/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: editDraft.trim() }),
    });
    if (res.ok) {
      const updated: FplNote = await res.json();
      mutate((cur) => cur && { notes: cur.notes.map((n) => (n.id === id ? updated : n)) }, { revalidate: false });
      setEditingId(null);
    }
  }

  async function remove(id: string) {
    mutate((cur) => cur && { notes: cur.notes.filter((n) => n.id !== id) }, { revalidate: false });
    await fetch(`/api/fpl/notes/${id}`, { method: "DELETE" });
  }

  return (
    <div className="px-3 pb-4" style={{ background: sunk(20), borderTop: "1px solid var(--ds-hairline)" }}>
      <p className="pb-2 pt-3 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(${th.accentVar})` }}>
        Notater til årsmøtet
      </p>
      {notes.length > 0 && (
        <div className="mb-2 flex flex-col gap-1.5">
          {notes.map((note) =>
            editingId === note.id ? (
              <div key={note.id} className="flex flex-col gap-1.5 rounded-lg p-2" style={{ background: sunk(30) }}>
                <textarea
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  rows={2}
                  className="rounded-md px-2 py-1.5 text-[12px] text-[color:var(--ds-ink)] outline-none"
                  style={{ background: ink(7) }}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-[10px] font-semibold uppercase"
                    style={{ color: "var(--ds-muted)" }}
                  >
                    Avbryt
                  </button>
                  <button
                    type="button"
                    onClick={() => submitEdit(note.id)}
                    disabled={!editDraft.trim()}
                    className="ml-auto rounded-md px-2.5 py-1 text-[10px] font-bold uppercase disabled:opacity-40"
                    // Tekst PÅ aksentflaten: --ds-surface er mørk i kveld og hvit
                    // i dag, altså alltid motsatt av den mettede knappefargen.
                    style={{ background: `var(${th.barVar})`, color: "var(--ds-surface)" }}
                  >
                    Lagre
                  </button>
                </div>
              </div>
            ) : (
              <div key={note.id} className="flex items-start gap-2 rounded-lg p-2" style={{ background: sunk(30) }}>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(note.id);
                    setEditDraft(note.text);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="whitespace-pre-line text-[12px] text-[color:var(--ds-ink)]">{note.text}</p>
                  <p className="mt-0.5 text-[10px]" style={{ color: "var(--ds-muted)" }}>
                    {formatDateTime(note.updatedAt ?? note.createdAt)}
                    {note.updatedAt ? " (redigert)" : ""}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => confirmDelete.request(note.id)}
                  aria-label="Slett notat"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
                  style={{ color: "var(--ds-muted)" }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ),
          )}
        </div>
      )}
      {adding ? (
        <div className="flex flex-col gap-1.5 rounded-lg p-2" style={{ background: sunk(30) }}>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Skriv notat..."
            className="rounded-md px-2 py-1.5 text-[12px] text-[color:var(--ds-ink)] placeholder-[color:var(--ds-muted)] outline-none"
            style={{ background: ink(7) }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-[10px] font-semibold uppercase"
              style={{ color: "var(--ds-muted)" }}
            >
              Avbryt
            </button>
            <button
              type="button"
              onClick={submitAdd}
              disabled={!draft.trim()}
              className="ml-auto rounded-md px-2.5 py-1 text-[10px] font-bold uppercase disabled:opacity-40"
              style={{ background: `var(${th.barVar})`, color: "var(--ds-surface)" }}
            >
              Lagre
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px]"
          style={{ border: `1px dashed ${ink(20)}`, color: "var(--ds-muted)" }}
        >
          <span className="text-sm leading-none">+</span> Nytt notat
        </button>
      )}
      {notes.length === 0 && !adding && (
        <p className="mt-2 text-[11px]" style={{ color: "var(--ds-muted)" }}>
          Ingen notater ennå. Det du legger inn her blir liggende til årsmøtet.
        </p>
      )}
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message="Slette dette notatet?"
        onCancel={confirmDelete.cancel}
        onConfirm={() => {
          if (confirmDelete.pending) remove(confirmDelete.pending);
          confirmDelete.cancel();
        }}
      />
    </div>
  );
}

const CHIP_LABEL: Record<string, string> = {
  wildcard: "Wildcard",
  bboost: "Benkeboost",
  "3xc": "Trippelkaptein",
  freehit: "Freehit",
  manager: "Assistenttrener",
};

// Enkelt søyle-diagram over poeng per runde — samme "ingen chart-bibliotek
// nødvendig"-mønster som resten av appen (se f.eks. ProgressChart i
// TreningSection.tsx), tilpasset FPL-panelets egne inline-styles i stedet for
// CardShell/Tailwind-tokens.
function GwPointsChart({ history, accentVar }: { history: { event: number; gwPoints: number }[]; accentVar: string }) {
  if (history.length < 2) return null;
  const W = 280, H = 64, pad = 3;
  const barW = (W - pad * 2) / history.length;
  const max = Math.max(...history.map((h) => h.gwPoints), 1);
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="block">
      {history.map((h, i) => {
        const barH = Math.max(1, (h.gwPoints / max) * (H - pad * 2));
        const x = pad + i * barW;
        return (
          <rect
            key={h.event}
            x={x + barW * 0.15}
            y={H - pad - barH}
            width={Math.max(1, barW * 0.7)}
            height={barH}
            rx="1.5"
            fill={`var(${accentVar})`}
            opacity={0.75}
          />
        );
      })}
    </svg>
  );
}

function StatTile({ label, value, accentVar }: { label: string; value: number | string; accentVar: string }) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: sunk(30) }}>
      {/* Mikro-etikettene ligger nå på 70 % av aksenten, ikke 35 % som før: den
          gamle verdien var 35 % HVIT på mørk bunn. Samme brøk på en MØRK aksent
          over et hvitt kort i dagmodus falt under 3:1. Samme grep er gjort på
          alle 9–11px-etikettene i panelet. */}
      <p className="truncate text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: alpha(accentVar, 70) }}>
        {label}
      </p>
      <p className="text-[15px] font-black tabular-nums" style={{ color: `var(${accentVar})` }}>
        {value}
      </p>
    </div>
  );
}

// Sesongstatistikk bygget fra FPL-historikk-dataen appen allerede henter
// (lib/fpl.ts sin gwHistory/chips) — ikke en lenke til et eksternt prosjekt
// (slik Boko sin "sesongstatistikk" er, se lenken lenger ned), men en ekte
// seksjon i selve dashboardet. Kun vist under Rumpehåland/fisak-panelet.
function SeasonStats({ team, accentVar }: { team: FplTeam; accentVar: string }) {
  const gws = (team.gwHistory ?? []).filter(
    (h): h is typeof h & { gwPoints: number } => h.gwPoints != null,
  );
  if (gws.length === 0) return null;

  const best = gws.reduce((a, b) => (b.gwPoints > a.gwPoints ? b : a));
  const worst = gws.reduce((a, b) => (b.gwPoints < a.gwPoints ? b : a));
  const totalGwPoints = gws.reduce((sum, h) => sum + h.gwPoints, 0);
  const avg = Math.round((totalGwPoints / gws.length) * 10) / 10;
  const totalBench = gws.reduce((sum, h) => sum + (h.benchPoints ?? 0), 0);
  const totalTransferCost = gws.reduce((sum, h) => sum + (h.transferCost ?? 0), 0);
  const chips = team.chips ?? [];

  return (
    <div className="px-3 pb-4" style={{ background: sunk(20), borderTop: "1px solid var(--ds-hairline)" }}>
      <p className="pb-2 pt-3 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(${accentVar})` }}>
        Sesongstatistikk
      </p>
      <div className="mb-2 rounded-xl p-2.5" style={{ background: sunk(30) }}>
        <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: alpha(accentVar, 70) }}>
          Poeng per runde
        </p>
        <GwPointsChart history={gws} accentVar={accentVar} />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <StatTile label="Snitt/runde" value={avg} accentVar={accentVar} />
        <StatTile label="Totalt" value={(team.totalPoints ?? totalGwPoints).toLocaleString("nb-NO")} accentVar={accentVar} />
        <StatTile label={`Beste (GW${best.event})`} value={best.gwPoints} accentVar={accentVar} />
        <StatTile label={`Svakeste (GW${worst.event})`} value={worst.gwPoints} accentVar={accentVar} />
      </div>
      {(totalBench > 0 || totalTransferCost > 0) && (
        <p className="mt-2 text-[10px]" style={{ color: alpha(accentVar, 70) }}>
          {totalBench > 0 && `${totalBench}p på benken totalt`}
          {totalBench > 0 && totalTransferCost > 0 && " · "}
          {totalTransferCost > 0 && `-${totalTransferCost}p i bytte-trekk`}
        </p>
      )}
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={`${c.name}-${c.event}`}
              className="rounded-full px-2 py-1 text-[10px] font-semibold"
              style={{ background: alpha(accentVar, 14), color: `var(${accentVar})` }}
            >
              {CHIP_LABEL[c.name] ?? c.name} · GW{c.event}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniLeaderboard({
  entries, myRank, myTotal, teamName, accentVar,
}: {
  entries: { name: string; total: number; rank: number }[];
  myRank: number; myTotal?: number; teamName: string;
  accentVar: string;
}) {
  const myInTop = entries.some(e => e.rank === myRank);
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: sunk(30) }}>
      {entries.map((e, i) => {
        const isMe = e.rank === myRank;
        return (
          <div key={i}
            className={`flex items-center gap-2.5 px-3 py-2 ${i > 0 ? "border-t" : ""}`}
            style={{ borderColor: "var(--ds-hairline)", background: isMe ? alpha(accentVar, 12) : undefined }}>
            <span className="text-[10px] font-black tabular-nums w-6 text-right shrink-0"
              style={{ color: isMe ? `var(${accentVar})` : "var(--ds-faint)" }}>
              {e.rank}
            </span>
            <span className="flex-1 text-[11px] truncate"
              style={{ color: isMe ? `var(${accentVar})` : "var(--ds-ink-2)", fontWeight: isMe ? 700 : 400 }}>
              {e.name}
            </span>
            <span className="text-[11px] font-bold tabular-nums shrink-0"
              style={{ color: isMe ? `var(${accentVar})` : "var(--ds-muted)" }}>
              {e.total.toLocaleString("nb-NO")}
            </span>
          </div>
        );
      })}
      {!myInTop && myTotal != null && (
        <>
          <div className="flex items-center justify-center py-0.5 border-t"
            style={{ borderColor: "var(--ds-hairline)" }}>
            <span style={{ color: "var(--ds-faint)", fontSize: 11, letterSpacing: 2 }}>· · ·</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-2 border-t"
            style={{ borderColor: "var(--ds-hairline)", background: alpha(accentVar, 12) }}>
            <span className="text-[10px] font-black tabular-nums w-6 text-right shrink-0"
              style={{ color: `var(${accentVar})` }}>
              {myRank.toLocaleString("nb-NO")}
            </span>
            <span className="flex-1 text-[11px] truncate font-bold" style={{ color: `var(${accentVar})` }}>
              {teamName}
            </span>
            <span className="text-[11px] font-bold tabular-nums shrink-0" style={{ color: `var(${accentVar})` }}>
              {myTotal.toLocaleString("nb-NO")}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function ForwardCalc({ gap, currentGw, accentVar }: {
  gap: number; currentGw: number; accentVar: string;
}) {
  const remaining = 38 - currentGw;
  if (remaining <= 0) return null;
  const perGw = Math.ceil(gap / remaining);
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
      style={{ background: sunk(24) }}>
      <div className="shrink-0 text-center" style={{ minWidth: 48 }}>
        <p className="text-[26px] font-black tabular-nums leading-none"
          style={{ color: alpha(accentVar, 80) }}>{perGw}</p>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] mt-0.5"
          style={{ color: alpha(accentVar, 70) }}>p/runde</p>
      </div>
      <div>
        <p className="text-[10px] leading-snug" style={{ color: "var(--ds-muted)" }}>
          for å nå målet på{" "}
          <span style={{ color: alpha(accentVar, 80), fontWeight: 700 }}>
            {remaining} gjenværende {remaining === 1 ? "runde" : "runder"}
          </span>
        </p>
        <p className="text-[10px] mt-1 tabular-nums" style={{ color: "var(--ds-faint)" }}>
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
    <div className="border-l-[3px]" style={{ borderLeftColor: `var(${th.barVar})` }}>
      <div className="flex items-center gap-3 px-4 py-2.5 border-b"
        style={{ background: alpha(th.barVar, 8), borderColor: alpha(th.barVar, 20) }}>
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: `var(${th.barVar})` }} />
        <p className="text-[10px] font-black uppercase tracking-[0.16em] flex-1" style={{ color: `var(${th.accentVar})` }}>
          {team.teamName}
        </p>
        {team.gwHistory && team.gwHistory.length >= 2 && (
          <RankSparkline history={team.gwHistory} colorVar={th.accentVar} />
        )}
        {teamKey === "boko" && (
          <a href="https://boko-haramsdale.vercel.app" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] ml-1"
            style={{ color: alpha(th.accentVar, 75) }}>
            Boko
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-2.5 h-2.5">
              <path d="M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7M7 1h4v4M11 1 5.5 6.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        )}
        <a href={teamUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] ml-1"
          style={{ color: alpha(th.accentVar, 75) }}>
          FPL
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-2.5 h-2.5">
            <path d="M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7M7 1h4v4M11 1 5.5 6.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>

      <div className="flex items-center px-3 pt-2 pb-1">
        <p className="flex-1 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: alpha(th.accentVar, 70) }}>Liga</p>
        <p className="w-16 text-right text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: alpha(th.accentVar, 70) }}>Nå</p>
        <p className="w-10 text-right text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: alpha(th.accentVar, 70) }}>Forrige</p>
        <div className="w-5" />
      </div>

      <div className="pb-2">
        {team.leagues.length === 0 && (
          <p className="px-3 pb-2 text-[11px]" style={{ color: "var(--ds-muted)" }}>
            Ingen ligaer registrert på laget. De dukker opp så snart laget er meldt inn i en liga.
          </p>
        )}
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
              style={i > 0 ? { borderColor: alpha(th.barVar, 12) } : undefined}>

              <button
                onClick={() => setExpandedLeagueId(isExpanded ? null : league.id)}
                aria-expanded={isExpanded}
                className="w-full flex items-center px-3 py-2 text-left">
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-[11px] text-[color:var(--ds-ink-2)] truncate leading-tight">{league.name}</p>
                </div>
                <div className="w-16 flex items-center justify-end gap-1 shrink-0">
                  {delta && (
                    <svg viewBox="0 0 10 10" fill="currentColor" role="img"
                      aria-label={delta === "up" ? "Rangering opp" : "Rangering ned"}
                      className={`w-1.5 h-1.5 shrink-0 ${delta === "up" ? "text-emerald-400" : "text-red-400"} ${delta === "down" ? "rotate-180" : ""}`}>
                      <polygon points="5,1 9,9 1,9" />
                    </svg>
                  )}
                  <p className="text-[13px] font-black tabular-nums" style={{ color: `var(${th.accentVar})` }}>
                    {displayRank.toLocaleString("nb-NO")}
                  </p>
                </div>
                <p className="w-10 text-right text-[11px] tabular-nums shrink-0"
                  style={{ color: alpha(th.accentVar, 75) }}>
                  {prevRank != null ? prevRank.toLocaleString("nb-NO") : "–"}
                </p>
                <div className="w-5 flex items-center justify-end shrink-0">
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"
                    className={`w-3 h-3 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`}
                    style={{ color: alpha(th.accentVar, 50) }}>
                    <polyline points="2,4 6,8 10,4" />
                  </svg>
                </div>
              </button>

              {isExpanded && (
                <div className="px-3 pb-4 border-t" style={{ borderColor: alpha(th.barVar, 12), background: sunk(20) }}>
                  {gap !== undefined && (
                    <div className="pt-2.5 pb-3">
                      <div className="inline-flex items-center px-3 py-1.5 rounded-xl text-[12px] font-black"
                        style={{
                          background: inTarget ? alpha("--color-emerald-400", 14) : alpha("--color-amber-400", 12),
                          color: inTarget ? "var(--color-emerald-400)" : "var(--color-amber-400)",
                          border: `1px solid ${inTarget ? alpha("--color-emerald-400", 24) : alpha("--color-amber-400", 22)}`,
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
                      accentVar={th.accentVar}
                    />
                  )}
                  {!league.topEntries && gap !== undefined && !inTarget && team.currentGw != null && (
                    <ForwardCalc
                      gap={Math.abs(gap)}
                      currentGw={team.currentGw}
                      accentVar={th.accentVar}
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
  // Sløret over lagbildet: sterkt til venstre der teksten står, svakt til
  // høyre. sunk() gjør det mørkt i kveld og lyst i dag, så teksten leser mot
  // fotoet i begge temaer (før: fast rgba(0,0,0,...), som bare virket mørkt).
  const photoScrim = `linear-gradient(to right, ${sunk(72)} 0%, ${sunk(30)} 100%)`;
  return (
    <button type="button"
      className="flex-1 relative overflow-hidden flex flex-col rounded-xl cursor-pointer select-none text-left"
      style={{ border: `2px solid var(${th.barVar})` }}
      onClick={onToggle}
      aria-expanded={isExpanded}>
      <div className="h-[3px] shrink-0" style={{ background: `var(${th.barVar})` }} />
      <div className="flex-1 relative px-4 py-4" style={{ background: alpha(th.barVar, 6) }}>
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
            <div className="absolute inset-0" style={{ background: photoScrim }} />
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
            <div className="absolute inset-0" style={{ background: photoScrim }} />
          </div>
        )}
        <div className="relative">
          <p className="font-display text-[15px] font-bold text-[color:var(--ds-ink)] leading-tight truncate mb-3"
            style={{ letterSpacing: "-0.01em" }}>
            {team?.teamName ?? "—"}
          </p>
          <div className="flex items-start gap-4 mt-1">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{ color: alpha(th.accentVar, 70) }}>Totalt</p>
              <p className="font-display text-[15px] font-semibold tabular-nums leading-tight" style={{ color: "var(--ds-ink-2)" }}>
                {team?.totalPoints?.toLocaleString("nb-NO") ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{ color: alpha(th.accentVar, 70) }}>GW{team?.currentGw ?? picks?.gw}</p>
              {(() => {
                const gwPts = picks != null ? picks.liveGwPoints : (team?.currentGwPoints ?? null);
                const above = gwAverage != null && gwPts != null && gwPts > gwAverage;
                const below = gwAverage != null && gwPts != null && gwPts < gwAverage;
                return (
                  <p className="font-display text-[15px] font-semibold tabular-nums leading-tight"
                    style={{ color: above ? "var(--color-emerald-400)" : below ? "var(--color-red-400)" : "var(--ds-ink-2)" }}>
                    {gwPts ?? "—"}
                    {gwAverage != null && gwPts != null && (
                      <span className="text-[10px] font-semibold ml-0.5"
                        style={{ color: alpha(th.accentVar, 70) }}>
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
              style={{ color: alpha(th.accentVar, 70) }}>Verdensrang</p>
            <p className="font-display text-[12px] font-semibold tabular-nums leading-tight" style={{ color: "var(--ds-muted)" }}>
              {((picks?.overallRank) ?? team?.overallRank)?.toLocaleString("nb-NO") ?? "—"}
            </p>
            {picks?.gwRank != null && (
              <p className="text-[10px] tabular-nums leading-none mt-0.5"
                style={{ color: alpha(th.accentVar, 75) }}>
                GW {picks.gwRank.toLocaleString("nb-NO")}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center py-1.5"
        style={{ borderTop: `1px solid ${alpha(th.accentVar, 16)}`, background: alpha(th.accentVar, 6) }}>
        <svg viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="2"
          className={`w-3 h-2 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`}
          style={{ color: alpha(th.accentVar, 50) }}>
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
    // Skyggen er appens egne dybde-tokens (--elev-*) i stedet for en egen
    // håndskrevet stabel — de bytter selv fra lyskant (kveld) til myk skygge
    // (dag). Midterste laget er FPL-kantlyset, tonet fra --ds-fpl.
    <div className="rounded-2xl overflow-hidden relative"
      style={{
        background: HERO_BG,
        boxShadow: `var(--elev-top-light), 0 0 0 1px ${alpha("--ds-fpl", 22)}, var(--elev-2)`,
      }}>

      <Image src="/Topplogofpl.webp" alt="" fill sizes="(max-width: 768px) 100vw, 640px"
        className="object-cover pointer-events-none select-none"
        style={{ objectPosition: "left top", opacity: 0.35, zIndex: 0 }} />
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `linear-gradient(to right, ${sunk(10)} 0%, ${sunk(60)} 60%, ${sunk(84)} 100%)`, zIndex: 0 }} />
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `linear-gradient(to bottom, transparent 25%, ${sunk(64)} 100%)`, zIndex: 0 }} />

      {isPulsing && (
        <div className="absolute inset-0 rounded-[20px] pointer-events-none animate-pulse"
          style={{
            boxShadow: `inset 0 0 0 2px ${alpha("--color-status-danger", 60)}, 0 0 16px ${alpha("--color-status-danger", 18)}`,
            zIndex: 20,
          }} />
      )}

      <div className="relative flex items-center justify-between border-b px-5 py-3"
        style={{ borderColor: "var(--ds-hairline)", zIndex: 1 }}>
        {currentGwId && (
          <span className="font-display text-[10px] font-bold tracking-[0.1em] uppercase px-2.5 py-1 rounded-lg border"
            style={{ color: "var(--color-emerald-400)", borderColor: alpha("--color-emerald-400", 40), background: sunk(35) }}>
            GW{currentGwId}
          </span>
        )}
        {anyLive && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg border ml-auto"
            style={{ borderColor: alpha("--color-status-danger", 50), background: sunk(40) }}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--color-status-danger)" }} />
            <span className="text-[10px] font-black tracking-[0.1em] uppercase" style={{ color: "var(--color-red-400)" }}>Live</span>
          </div>
        )}
      </div>

      <div className="flex relative px-3 pt-3 pb-3 gap-2.5 border-b"
        style={{ borderColor: "var(--ds-hairline)", zIndex: 1 }}>
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
        <div className="relative" style={{ borderTop: `2px solid var(${TEAM_THEME[expandedTeam].barVar})`, zIndex: 1 }}>
          <LeaguesPanel
            team={expandedTeamData}
            teamKey={expandedTeam}
            liveRanks={picks[expandedTeam]?.leagueRanks}
          />
          <div className="px-3 pb-4" style={{ background: sunk(20), borderTop: "1px solid var(--ds-hairline)" }}>
            <TeamPitch
              managerId={expandedTeamData.teamId}
              accentVar={TEAM_THEME[expandedTeam].pitchAccent}
            />
          </div>
          {expandedTeam === "fisak" && (
            <SeasonStats team={expandedTeamData} accentVar={TEAM_THEME.fisak.accentVar} />
          )}
          {expandedTeam === "boko" && <BokoNotes />}
        </div>
      )}
    </div>
  );
}

// Nedtellingen sto tidligere som "02:14:37" — tre tall uten etikett og uten
// enhet. Nå vises den som kortets `stat` (stort/tynt nøkkeltall med egen
// etikett), fordi fristen er det ENE tallet i FPL-kortet som krever handling
// før det går ut; rundepoengene står allerede for hvert lag inne i heroen, og
// er dessuten tvetydige på et kort med to lag.
function fplCountdownValue(deadline: string): string {
  const { d, h, m } = fplParts(deadline);
  if (d > 0) return `${d} d ${h} t`;
  if (h > 0) return `${h} t ${m} m`;
  if (m > 0) return `${m} m`;
  return "Nå";
}

export function FplBox({ fpl }: { fpl: FplData }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const deadline = fpl.gw?.deadline;

  // border-t-lime-400/60 må være en literal klasse (Tailwind kan ikke bygge
  // klassenavn fra en runtime-verdi) — men fargen skal alltid være den samme
  // som SECTION_ACCENT.fpl i ./sectionAccents.ts. Endres én, endres begge.
  const rootClass = "border-t-2 border-t-lime-400/60 p-4";

  // Utenfor sesong (og ved feilet henting) returnerte kortet `null`. Da forsvant
  // hele seksjonen sporløst, og brukeren kunne ikke skille "ingen data nå" fra
  // "denne funksjonen finnes ikke lenger". Nå står kortet igjen med en rolig
  // tomtilstand i appens vanlige form (`text-sm text-ink-3`, samme som
  // Kalender/Prosjekter/Sport), og forteller hva kortet er og hva som skal til
  // for at det fyller seg selv igjen.
  if (!fpl.active || !deadline) {
    const lastKnown = (fpl.teams ?? []).filter((t) => t.totalPoints != null);
    return (
      <div className={rootClass}>
        <CardHeader
          title="Fantasy Premier League"
          icon={Shirt}
          iconColorClass={SECTION_ACCENT.fpl}
        />
        <p className="text-sm text-ink-3">
          {fpl.error
            ? "Fikk ikke kontakt med Fantasy Premier League. Kortet fyller seg selv når neste henting går gjennom."
            : "Rundene til Rumpehåland og Boko Haramsdale følges her. Sesongen er ikke i gang, så kortet står tomt til neste runde har fått frist."}
        </p>
        {lastKnown.length > 0 && (
          <p className="mt-1.5 text-2xs text-ink-4">
            Sist registrert:{" "}
            {lastKnown
              .map((t) => `${t.teamName} ${t.totalPoints!.toLocaleString("nb-NO")} p`)
              .join(" · ")}
          </p>
        )}
        {fpl.fetchedAt && <p className="mt-2 text-2xs text-ink-4">Oppdatert {timeAgo(fpl.fetchedAt)}</p>}
      </div>
    );
  }

  return (
    <div className={rootClass}>
      <CardHeader
        title="Fantasy Premier League"
        // Kortet er ikke kollapsbart (ingen `collapsed`/`onToggleCollapse` sendt inn), og
        // CardShell.tsx:244 lar `stat` overta subtitle-plassen UANSETT `alwaysShowSubtitle` når
        // kortet ikke er kollapset - en tidligere `subtitle`-setningsform her kunne derfor aldri
        // vises i praksis (2026-09-07). Fjernet i stedet for å bygge full kollaps-støtte bare for
        // denne ene teksten; `stat` sier allerede det samme, kortere.
        stat={{ value: fplCountdownValue(deadline), label: "Til frist" }}
        icon={Shirt}
        iconColorClass={SECTION_ACCENT.fpl}
      />
      <FplHero fpl={fpl} />
      {fpl.fetchedAt && <p className="mt-2 text-2xs text-ink-4">Oppdatert {timeAgo(fpl.fetchedAt)}</p>}
    </div>
  );
}
