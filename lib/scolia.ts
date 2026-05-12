const BASE = "https://game.scoliadarts.com/api";

function authHeaders() {
  return { Authorization: `Bearer ${process.env.SCOLIA_JWT}` };
}

export interface DartAvg {
  average:    number;
  throwCount: number;
  totalScore: number;
}

export interface SessionSnap {
  date:        string;
  avg:         number;
  throws:      number;
  checkoutPct: number | null;
}

export interface ScoliaStats {
  avg3dart:    number;
  first9avg:   number;
  checkoutPct: number;
  high180s:    number;
  hitRate:     number;
  ranges:      Record<string, number>;
  trebles:     Record<string, number>;
  nthDart:     { first: DartAvg; second: DartAvg; third: DartAvg } | null;
}

export interface ScoliaData {
  stats:          ScoliaStats | null;
  trend:          number[];
  sessions:       SessionSnap[];
  boardGames:     number;
  finishedGames:  number;
  abortedGames:   number;
  totalThrows:    number;
  bounceOuts:     number;
  boardOnline:    boolean;
  lastOnlineDate: string | null;
  fetchedAt:      string;
}

type TEntry = {
  time: string;
  aggregatedStats?: {
    scoring?:  { count: number; sum: number };
    checkout?: { double?: { hits: number; throws: number } };
  };
};

export async function getScoliaData(): Promise<ScoliaData | null> {
  try {
    const to   = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 90);
    const toStr   = to.toISOString();
    const fromStr = from.toISOString();
    const boardId = process.env.SCOLIA_BOARD_ID;

    const [scoringRes, timelineRes, boardStatsRes, boardStateRes] = await Promise.all([
      fetch(`${BASE}/advanced-statistics/scoring-analysis?from=${fromStr}&to=${toStr}`,
        { headers: authHeaders(), next: { revalidate: 3600 } }),
      fetch(`${BASE}/advanced-statistics/timeline-analysis/X01?from=${fromStr}&to=${toStr}&granularity=daily`,
        { headers: authHeaders(), next: { revalidate: 3600 } }),
      fetch(`${BASE}/boards/${boardId}/statistics`,
        { headers: authHeaders(), next: { revalidate: 3600 } }),
      fetch(`${BASE}/boards/${boardId}/currentState`,
        { headers: authHeaders(), next: { revalidate: 30 } }),
    ]);

    if (!scoringRes.ok || !timelineRes.ok) return null;

    const [scoring, timeline] = await Promise.all([scoringRes.json(), timelineRes.json()]);
    const boardStats = boardStatsRes.ok ? await boardStatsRes.json() : null;
    const boardState = boardStateRes.ok ? await boardStateRes.json() : null;

    const snap  = scoring.scoringAnalysis?.at(-1)?.scoring ?? null;
    const tSnap = timeline.timelineAnalysis?.at(-1)?.aggregatedStats ?? null;

    const stats: ScoliaStats | null = snap ? {
      avg3dart:    snap.average,
      first9avg:   tSnap?.first9Average?.count
        ? (tSnap.first9Average.sum / tSnap.first9Average.count) * 3
        : snap.average,
      checkoutPct: tSnap?.checkout?.double?.throws
        ? (tSnap.checkout.double.hits / tSnap.checkout.double.throws) * 100
        : 0,
      high180s:    tSnap?.highScore180 ?? snap.ranges?.range_141_180 ?? 0,
      hitRate:     snap.hitsAndMisses?.total > 0
        ? (snap.hitsAndMisses.hits / snap.hitsAndMisses.total) * 100
        : 0,
      ranges:      snap.ranges ?? {},
      trebles:     snap.treblesPerVisits ?? {},
      nthDart:     snap.nthDartsAverage ?? null,
    } : null;

    const trend: number[] = (timeline.timelineAnalysis ?? [])
      .map((e: TEntry) => {
        const s = e.aggregatedStats?.scoring;
        return s?.count ? Math.round((s.sum / s.count) * 3 * 10) / 10 : null;
      })
      .filter((v: number | null): v is number => v !== null);

    // Per-session deltas from cumulative timeline
    const rawTimeline: TEntry[] = timeline.timelineAnalysis ?? [];
    const sessions: SessionSnap[] = rawTimeline
      .map((entry, i) => {
        const curr = entry.aggregatedStats;
        const prev = i > 0 ? rawTimeline[i - 1].aggregatedStats : undefined;
        const currCount = curr?.scoring?.count ?? 0;
        const prevCount = prev?.scoring?.count ?? 0;
        const throws = currCount - prevCount;
        if (throws < 15) return null;
        const avg = Math.round(
          ((curr?.scoring?.sum ?? 0) - (prev?.scoring?.sum ?? 0)) / throws * 3 * 10
        ) / 10;
        const ct = (curr?.checkout?.double?.throws ?? 0) - (prev?.checkout?.double?.throws ?? 0);
        const checkoutPct = ct > 0
          ? Math.round(
              ((curr?.checkout?.double?.hits ?? 0) - (prev?.checkout?.double?.hits ?? 0)) / ct * 1000
            ) / 10
          : null;
        return { date: entry.time, avg, throws, checkoutPct } satisfies SessionSnap;
      })
      .filter((s): s is SessionSnap => s !== null)
      .slice(-20);

    return {
      stats,
      trend,
      sessions,
      boardGames:     boardStats?.gamesCount?.total      ?? 0,
      finishedGames:  boardStats?.gamesCount?.finished   ?? 0,
      abortedGames:   boardStats?.gamesCount?.aborted    ?? 0,
      totalThrows:    boardStats?.throwsCount?.total     ?? 0,
      bounceOuts:     boardStats?.throwsCount?.bounceOut ?? 0,
      boardOnline:    boardState?.state === "Online",
      lastOnlineDate: boardState?.lastOnlineDate ?? null,
      fetchedAt:      new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
