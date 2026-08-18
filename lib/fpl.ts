import { getJSON, setJSON } from "./kv";

// Lagres i Redis (ikke modul-minne) slik at cachen overlever serverless
// cold starts på Vercel — et rent JS-objekt nullstilles ved hver kalde start.
const CACHE_KEY = "cache:fpl";
const CACHE_TTL_SECONDS = 60 * 60;

const TEAMS = [
  { key: "fisak" as const, id: 3798160 },
  { key: "boko"  as const, id: 1276183 },
];
export type TeamKey = "fisak" | "boko";

export interface FplLeague {
  id: number; name: string; rank: number; lastRank: number | null;
  targetRank?: number;
  gapToTarget?: number;
  topEntries?: { name: string; total: number; rank: number }[];
}
export interface FplTeam {
  teamKey: TeamKey; teamId: number; teamName: string;
  overallRank?: number; totalPoints?: number;
  currentGwPoints?: number; currentGw?: number;
  gwHistory?: { event: number; rank: number; points?: number }[];
  leagues: FplLeague[];
}
export interface FplData {
  active: boolean;
  gw?: { id?: number; name?: string; deadline?: string; average?: number | null } | null;
  teams?: FplTeam[];
  error?: boolean;
  fetchedAt?: number;
}

// Target rank per league (matched by name, case-insensitive)
const LEAGUE_TARGETS: [RegExp, number][] = [
  [/norgesmesterskapet\s*800/i, 39],
  [/norgesmesterskapet/i, 88],
  [/\bnorway\b/i, 5000],
];
function targetFor(name: string): number {
  for (const [pat, rank] of LEAGUE_TARGETS) {
    if (pat.test(name)) return rank;
  }
  return 1;
}

const UA = { headers: { "User-Agent": "mitt-private-dashboard/1.0" } };

async function fetchTeam(entry: EntryData, myPoints: number): Promise<Omit<FplTeam, "teamKey"> | null> {
  if (!entry) return null;

  const SKIP = ["Overall", "Second Chance"];
  const rawLeagues: RawLeague[] = (entry.leagues?.classic ?? [])
    .filter((l: RawLeague) => !SKIP.some(s => l.name.startsWith(s)))
    .slice(0, 7);

  const targeted = rawLeagues.map((l: RawLeague) => {
    const target = targetFor(l.name);
    return { league: l, targetRank: target, page: Math.ceil(target / 50) };
  });

  const standingsResults = await Promise.allSettled(
    targeted.map(({ league, page }) =>
      fetch(
        `https://fantasy.premierleague.com/api/leagues-classic/${league.id}/standings/?page_standings=${page}`,
        UA
      ).then(r => r.ok ? r.json() : null).catch(() => null)
    )
  );

  const leagues: FplLeague[] = targeted.map(({ league: l, targetRank }, i) => {
    const settled = standingsResults[i];
    const results: StandingEntry[] = settled.status === "fulfilled"
      ? (settled.value?.standings?.results ?? [])
      : [];

    const atTarget = results.find(e => e.rank === targetRank)
      ?? (results.length > 0
        ? results.reduce((best, e) =>
            Math.abs(e.rank - targetRank) < Math.abs(best.rank - targetRank) ? e : best)
        : undefined);

    const atTargetIdx = atTarget != null ? results.indexOf(atTarget) : -1;
    const topEntries = atTargetIdx >= 0
      ? results
          .slice(Math.max(0, atTargetIdx - 2), atTargetIdx + 1)
          .map(e => ({ name: e.entry_name, total: e.total, rank: e.rank }))
      : undefined;

    return {
      id: l.id,
      name: l.name,
      rank: l.entry_rank,
      lastRank: l.entry_last_rank ?? null,
      targetRank,
      gapToTarget: atTarget != null ? myPoints - atTarget.total : undefined,
      topEntries: (topEntries?.length ?? 0) > 0 ? topEntries : undefined,
    };
  });

  return {
    teamId: entry.id,
    teamName: entry.name,
    overallRank: entry.summary_overall_rank,
    totalPoints: entry.summary_overall_points,
    currentGwPoints: entry.summary_event_points,
    currentGw: entry.current_event,
    leagues,
  };
}

export async function getFplData(): Promise<FplData> {
  const cached = await getJSON<FplData>(CACHE_KEY);
  if (cached) return cached;

  try {
    const [bootstrapRes, ...entryAndHistResps] = await Promise.all([
      fetch("https://fantasy.premierleague.com/api/bootstrap-static/", UA),
      ...TEAMS.flatMap(t => [
        fetch(`https://fantasy.premierleague.com/api/entry/${t.id}/`, UA),
        fetch(`https://fantasy.premierleague.com/api/entry/${t.id}/history/`, UA),
      ]),
    ]);

    if (!bootstrapRes.ok) throw new Error("bootstrap failed");

    const [bootstrap, ...entryAndHistData] = await Promise.all([
      bootstrapRes.json(),
      ...entryAndHistResps.map(r => r.ok ? r.json() : null),
    ]);

    // Interleaved [entry0, history0, entry1, history1, ...]
    const rawEntries   = entryAndHistData.filter((_, i) => i % 2 === 0);
    const rawHistories = entryAndHistData.filter((_, i) => i % 2 === 1);

    const now = Date.now();
    const events = bootstrap.events as FplEvent[];
    const nextGw    = events.find(e => e.is_next || (!e.finished && new Date(e.deadline_time).getTime() > now));
    const currentGw = events.find(e => e.is_current) ?? events.filter(e => e.finished).at(-1);
    const gwAverage = currentGw?.average_entry_score ?? null;

    const teamResults = await Promise.all(
      TEAMS.map((t, i) => {
        const entry   = rawEntries[i]   as EntryData | null;
        const history = rawHistories[i] as HistoryData | null;
        const gwHistory = (history?.current ?? [])
          .map((h: GwHistoryEntry) => ({ event: h.event, rank: h.overall_rank, points: h.total_points }));
        const pts: number = entry?.summary_overall_points ?? 0;
        return fetchTeam(entry!, pts).then((team): FplTeam | null => {
          if (!team) return null;
          return { ...team, teamKey: t.key, gwHistory };
        });
      })
    );

    const teams = teamResults.filter((t): t is FplTeam => t !== null);

    const result: FplData = {
      active: !!nextGw,
      gw: nextGw
        ? { id: nextGw.id, name: nextGw.name, deadline: nextGw.deadline_time, average: gwAverage }
        : null,
      teams,
      fetchedAt: now,
    };

    await setJSON(CACHE_KEY, result, CACHE_TTL_SECONDS);
    return result;
  } catch {
    return { active: false, error: true, teams: [] };
  }
}

interface FplEvent {
  id: number; name: string; deadline_time: string;
  is_next: boolean; is_current: boolean; finished: boolean;
  average_entry_score?: number;
}
interface GwHistoryEntry { event: number; overall_rank: number; total_points: number; }
interface HistoryData { current: GwHistoryEntry[] }
interface RawLeague {
  id: number; name: string; entry_rank: number; entry_last_rank?: number;
}
interface StandingEntry {
  rank: number; entry_name: string; player_name: string; total: number; event_total: number;
}
interface EntryData {
  id: number; name: string;
  summary_overall_rank?: number; summary_overall_points?: number;
  summary_event_points?: number; current_event?: number;
  leagues?: { classic: RawLeague[] };
}
