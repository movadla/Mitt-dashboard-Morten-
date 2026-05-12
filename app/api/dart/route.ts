import { NextResponse } from "next/server";

const BASE = "https://game.scoliadarts.com/api";
const BOARD_ID = process.env.SCOLIA_BOARD_ID!;

function headers() {
  return { Authorization: `Bearer ${process.env.SCOLIA_JWT}` };
}

export async function GET() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 90);
  const toStr   = to.toISOString();
  const fromStr = from.toISOString();

  const [scoringRes, timelineRes, boardRes] = await Promise.all([
    fetch(`${BASE}/advanced-statistics/scoring-analysis?from=${fromStr}&to=${toStr}`, { headers: headers() }),
    fetch(`${BASE}/advanced-statistics/timeline-analysis/X01?from=${fromStr}&to=${toStr}&granularity=daily`, { headers: headers() }),
    fetch(`${BASE}/boards/${BOARD_ID}/statistics`, { headers: headers() }),
  ]);

  if (!scoringRes.ok || !timelineRes.ok || !boardRes.ok) {
    return NextResponse.json({ error: "Scolia API feil" }, { status: 502 });
  }

  const [scoring, timeline, board] = await Promise.all([
    scoringRes.json(),
    timelineRes.json(),
    boardRes.json(),
  ]);

  // Latest snapshot (last entry)
  const snap = scoring.scoringAnalysis?.at(-1)?.scoring ?? null;

  const stats = snap ? {
    avg3dart:    snap.average,
    first9avg:   snap.average, // overridden below from timeline
    checkoutPct: snap.hitsAndMisses
      ? 0  // not in scoringAnalysis, use timeline
      : 0,
    high180s:    snap.ranges?.range_141_180 ?? 0,
    ranges:      snap.ranges ?? {},
    trebles:     snap.treblesPerVisits ?? {},
    throwCount:  snap.throwCount ?? 0,
  } : null;

  // Pull first9 and checkout from timeline
  const tSnap = timeline.timelineAnalysis?.at(-1)?.aggregatedStats ?? null;
  if (stats && tSnap) {
    stats.first9avg   = tSnap.first9Average?.count
      ? (tSnap.first9Average.sum / tSnap.first9Average.count) * 3
      : stats.avg3dart;
    stats.checkoutPct = tSnap.checkout?.double?.throws
      ? (tSnap.checkout.double.hits / tSnap.checkout.double.throws) * 100
      : 0;
    stats.high180s    = tSnap.highScore180 ?? 0;
  }

  // Build trend: average per snapshot (cumulative, so use scoring.sum/count*3)
  const trend = (timeline.timelineAnalysis ?? []).map((e: Record<string, unknown>) => {
    const s = (e.aggregatedStats as Record<string, unknown>)?.scoring as Record<string, number> | undefined;
    return s?.count ? Math.round((s.sum / s.count) * 3 * 10) / 10 : null;
  }).filter(Boolean);

  return NextResponse.json({
    stats,
    trend,
    boardGames:    board.gamesCount?.total ?? 0,
    boardThrows:   board.throwsCount?.total ?? 0,
    lastOnline:    null,
    fetchedAt:     new Date().toISOString(),
  });
}
