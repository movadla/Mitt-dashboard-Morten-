"use client";

import { useEffect, useState } from "react";
import { CARD_SHELL, CardHeader, CollapsibleBody, SkeletonRows, usePersistedCollapse } from "../CardShell";
import { timeAgo } from "@/lib/timeAgo";
import { Target } from "lucide-react";
import type { DartsMatch, DartsStats } from "@/lib/darts";

function formatDMY(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-center">
      <p className="text-lg font-semibold tabular-nums text-ink-1">{value}</p>
      <p className="mt-0.5 text-2xs text-ink-4">{label}</p>
    </div>
  );
}

function MatchRow({ match }: { match: DartsMatch }) {
  return (
    <li className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2">
      <span className={`text-sm font-medium ${match.won ? "text-status-positive" : "text-ink-3"}`}>
        {match.won ? "Seier" : "Tap"}
      </span>
      <span className="text-2xs text-ink-4">
        {formatDMY(match.date)} · {match.dartsUsed} piler · {match.hitPct}% treff
      </span>
    </li>
  );
}

export default function DartsBox() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Darts", true);
  const [stats, setStats] = useState<DartsStats | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/darts")
      .then((r) => r.json())
      .then((d) => {
        setStats(d.stats ?? null);
        setFetchedAt(d.fetchedAt ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  if (!loading && !stats) return null;

  return (
    <div className={`${CARD_SHELL} !border-t-2 !border-t-sky-400/60 p-4`}>
      <CardHeader
        title="Darts"
        subtitle={stats ? `${stats.hitPct}% treff` : undefined}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={Target}
        iconColorClass="text-sky-400"
      />
      <CollapsibleBody collapsed={collapsed}>
        {loading ? (
          <SkeletonRows count={1} className="h-16" />
        ) : (
          stats && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Kamper vunnet" value={`${stats.matchesWon}/${stats.matchesPlayed}`} />
                <Stat label="Treff totalt" value={`${stats.hitPct}%`} />
                <Stat label="Piler/seier" value={stats.avgDartsPerWin != null ? String(stats.avgDartsPerWin) : "—"} />
              </div>
              {stats.recentMatches.length > 0 && (
                <div>
                  <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-4">Siste kamper</p>
                  <ul className="flex flex-col gap-1.5">
                    {stats.recentMatches.map((m, i) => (
                      <MatchRow key={i} match={m} />
                    ))}
                  </ul>
                </div>
              )}
              {fetchedAt && (
                <p className="text-2xs text-ink-4">Oppdatert {timeAgo(fetchedAt)} · fra Mikke Mus</p>
              )}
            </div>
          )
        )}
      </CollapsibleBody>
    </div>
  );
}
