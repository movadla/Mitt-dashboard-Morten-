"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { CardHeader, MutationError, SkeletonRows } from "../CardShell";
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
  // v2 (2026-09-28, Morten): var rå useEffect+fetch - en feilet henting så identisk ut som "ingen
  // kamper spilt ennå" (begge ga stats: null), og kortet forsvant stille i stedet for å vise en
  // feilmelding. Samme buggklasse SportSection allerede fikset for /api/sports. `error`-feltet i
  // svaret skiller nå de to tilfellene (se lib/darts.ts sin lastFetchFailed).
  const { data, error: swrError, isLoading } = useSWR<{ stats: DartsStats | null; fetchedAt: number | null; error?: boolean }>(
    "/api/darts",
    jsonFetcher,
  );
  const stats = data?.stats ?? null;
  const fetchedAt = data?.fetchedAt ?? null;
  const failed = !!swrError || !!data?.error;

  // Legitimt tomt (ingen kamper spilt ennå) og ingen feil - skjul kortet helt, som før.
  if (!isLoading && !stats && !failed) return null;

  return (
    <div className="border-t-2 border-t-sky-400/60 p-4">
      <CardHeader
        title="Darts"
        // Nøkkeltallet (treffprosent) løftet fra subtitle til stat — samme
        // systematiske sveip som resten av kortene denne runden (2026-09-07).
        stat={stats ? { value: `${stats.hitPct}%`, label: "treff" } : undefined}
        icon={Target}
        iconColorClass="text-sky-400"
      />
      {isLoading ? (
          <SkeletonRows count={1} className="h-16" />
        ) : failed && !stats ? (
          <MutationError message="Kunne ikke hente dart-statistikk — prøv å laste siden på nytt." />
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
    </div>
  );
}
