import { NextRequest } from "next/server";

// Bootstrap 1h, live/fixtures 1-2min, manager entry 2min for live rank
let bootstrapCache: { data: BootstrapData; expires: number } | null = null;
const liveCache     = new Map<number,  { data: LiveData;       expires: number }>();
const fixtureCache  = new Map<number,  { data: FplFixture[];   expires: number }>();
const managerCache  = new Map<string,  { data: ManagerEntry;   expires: number }>();

const UA = { headers: { "User-Agent": "mitt-private-dashboard/1.0" } };

async function getBootstrap(): Promise<BootstrapData> {
  if (bootstrapCache && bootstrapCache.expires > Date.now()) return bootstrapCache.data;
  const res = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", UA);
  if (!res.ok) throw new Error("bootstrap failed");
  const data = await res.json() as BootstrapData;
  bootstrapCache = { data, expires: Date.now() + 5 * 60 * 1000 };
  return data;
}

export async function GET(req: NextRequest) {
  const managerId = req.nextUrl.searchParams.get("managerId");
  if (!managerId) return Response.json({ error: "no_manager" }, { status: 400 });

  try {
    const bootstrap = await getBootstrap();
    const now = Date.now();

    const currentGwEvent = bootstrap.events.find(e => e.is_current)
      ?? bootstrap.events.filter(e => e.finished).at(-1);
    if (!currentGwEvent) return Response.json({ error: "no_gw" });
    const gw = currentGwEvent.id;

    // Live points — 2min cache
    let liveData: LiveData;
    const liveCached = liveCache.get(gw);
    if (liveCached && liveCached.expires > Date.now()) {
      liveData = liveCached.data;
    } else {
      const liveRes = await fetch(`https://fantasy.premierleague.com/api/event/${gw}/live/`, UA);
      liveData = liveRes.ok ? await liveRes.json() as LiveData : { elements: [] };
      liveCache.set(gw, { data: liveData, expires: now + 2 * 60 * 1000 });
    }

    // Fixtures — 1min cache to detect which matches are currently live
    let fixtureData: FplFixture[];
    const fixtureCached = fixtureCache.get(gw);
    if (fixtureCached && fixtureCached.expires > Date.now()) {
      fixtureData = fixtureCached.data;
    } else {
      const fixRes = await fetch(`https://fantasy.premierleague.com/api/fixtures/?event=${gw}`, UA);
      fixtureData = fixRes.ok ? await fixRes.json() as FplFixture[] : [];
      fixtureCache.set(gw, { data: fixtureData, expires: now + 60 * 1000 });
    }

    // Team IDs currently in a live match (started but not provisionally finished)
    const liveTeamIds = new Set<number>();
    for (const f of fixtureData) {
      if (f.started && !f.finished_provisional) {
        liveTeamIds.add(f.team_h);
        liveTeamIds.add(f.team_a);
      }
    }

    const picksRes = await fetch(
      `https://fantasy.premierleague.com/api/entry/${managerId}/event/${gw}/picks/`,
      UA
    );
    if (!picksRes.ok) throw new Error(`picks ${picksRes.status}`);
    const picksJson = await picksRes.json() as PicksData;

    const elementMap = new Map<number, BootstrapElement>();
    for (const el of bootstrap.elements) elementMap.set(el.id, el);

    const teamMap = new Map<number, BootstrapTeam>();
    for (const t of bootstrap.teams) teamMap.set(t.id, t);

    const players: PickPlayer[] = picksJson.picks.map(pick => {
      const el = elementMap.get(pick.element);
      if (!el) return null;
      const team = teamMap.get(el.team);
      const live = liveData.elements.find(e => e.id === pick.element);
      const rawPoints = live?.stats?.total_points ?? 0;
      const minutes   = live?.stats?.minutes ?? 0;
      const bonus     = live?.stats?.bonus ?? 0;

      return {
        id:           pick.element,
        webName:      el.web_name,
        elementType:  el.element_type,
        teamCode:     team?.code ?? 0,
        photoId:      el.photo ? el.photo.replace(".jpg", "") : null,
        isCaptain:    pick.is_captain,
        isViceCaptain:pick.is_vice_captain,
        multiplier:   pick.multiplier,
        livePoints:   rawPoints * pick.multiplier,
        rawPoints,
        minutes,
        bonus,
        inStarting:   pick.position <= 11,
        position:     pick.position,
        isPlaying:    liveTeamIds.has(el.team),
      };
    }).filter((p): p is PickPlayer => p !== null);

    const startingXI     = players.filter(p => p.inStarting);
    const hasLivePlayers = startingXI.some(p => p.isPlaying);
    const liveGwPoints   = startingXI.reduce((s, p) => s + p.livePoints, 0);
    const playingCount   = startingXI.filter(p => p.isPlaying).length;

    // Live rank — from manager entry endpoint (updates during GW)
    let entryData: ManagerEntry | null = null;
    const entryCached = managerCache.get(managerId);
    if (entryCached && entryCached.expires > Date.now()) {
      entryData = entryCached.data;
    } else {
      const entryRes = await fetch(`https://fantasy.premierleague.com/api/entry/${managerId}/`, UA);
      if (entryRes.ok) {
        entryData = await entryRes.json() as ManagerEntry;
        managerCache.set(managerId, { data: entryData, expires: now + 2 * 60 * 1000 });
      }
    }

    const gwAverage = bootstrap.events.find(e => e.id === gw)?.average_entry_score ?? null;
    const leagueRanks = entryData?.leagues?.classic?.map(l => ({ id: l.id, rank: l.entry_rank })) ?? [];

    return Response.json({
      gw, managerId, players, hasLivePlayers, liveGwPoints, playingCount,
      overallRank: entryData?.summary_overall_rank ?? null,
      gwRank:      entryData?.summary_event_rank   ?? null,
      gwAverage,
      leagueRanks,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return Response.json({ error: "fetch_failed", detail: msg });
  }
}

interface BootstrapData {
  events: { id: number; is_current: boolean; finished: boolean; average_entry_score?: number }[];
  elements: BootstrapElement[];
  teams: BootstrapTeam[];
}
interface BootstrapElement {
  id: number; web_name: string; element_type: number;
  team: number; photo: string;
}
interface BootstrapTeam { id: number; code: number; name: string; }
interface LiveData {
  elements: { id: number; stats: { total_points: number; minutes: number; bonus: number } }[];
}
interface FplFixture {
  id: number; event: number;
  team_h: number; team_a: number;
  started: boolean; finished: boolean; finished_provisional: boolean;
}
interface PicksData {
  picks: { element: number; position: number; multiplier: number; is_captain: boolean; is_vice_captain: boolean }[];
}
interface PickPlayer {
  id: number; webName: string; elementType: number;
  teamCode: number; photoId: string | null;
  isCaptain: boolean; isViceCaptain: boolean;
  multiplier: number; livePoints: number; rawPoints: number; minutes: number; bonus: number;
  inStarting: boolean; position: number; isPlaying: boolean;
}
interface ManagerEntry {
  summary_overall_rank: number | null;
  summary_event_rank:   number | null;
  summary_event_points: number;
  leagues?: { classic: { id: number; entry_rank: number }[] };
}
