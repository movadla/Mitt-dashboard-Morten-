// Unified sports aggregator.
// Add a new sport by appending an entry to SOURCES — nothing else to change.

const UA   = { headers: { "User-Agent": "mitt-private-dashboard/1.0" } };
const TSDB = "https://www.thesportsdb.com/api/v1/json/3";

let cache: { data: SportEvent[]; expires: number; fetchedAt: number } | null = null;

export interface SportEvent {
  id: string;
  category: string;
  name: string;
  venue?: string;
  date: string;        // YYYY-MM-DD, Norway local
  time?: string;       // HH:MM, Norway local
  competition: string;
}

// ── Time helpers ─────────────────────────────────────────────────────────────
function toNorway(ts: number): { date: string; time: string } {
  const dt = new Date(ts);
  const month = dt.getUTCMonth() + 1;
  const offset = month >= 4 && month <= 10 ? 2 : 1;   // CEST/CET
  const local = new Date(dt.getTime() + offset * 3_600_000);
  return {
    date: local.toISOString().slice(0, 10),
    time: local.toISOString().slice(11, 16),
  };
}

function norwayTime(dateStr: string, utcTime: string): string | undefined {
  const clean = utcTime.replace(/\+.*$/, "").replace(/Z$/, "").slice(0, 8);
  if (!clean || clean === "00:00:00") return undefined;
  const dt = new Date(`${dateStr}T${clean}Z`);
  if (isNaN(dt.getTime())) return undefined;
  const { time } = toNorway(dt.getTime());
  return time;
}

// ── F1 via Jolpica/Ergast ────────────────────────────────────────────────────
async function fetchF1(): Promise<SportEvent[]> {
  const year = new Date().getFullYear();
  const res = await fetch(`https://api.jolpi.ca/ergast/f1/${year}/races.json`, UA);
  if (!res.ok) return [];
  const json = await res.json();
  const today = new Date().toISOString().slice(0, 10);
  return (json.MRData?.RaceTable?.Races ?? [])
    .filter((r: F1Race) => r.date >= today)
    .slice(0, 6)
    .map((r: F1Race) => ({
      id:          `f1-${r.season}-${r.round}`,
      category:    "f1",
      name:        r.raceName,
      venue:       `${r.Circuit.Location.locality}, ${r.Circuit.Location.country}`,
      date:        r.date,
      time:        r.time ? norwayTime(r.date, r.time) : undefined,
      competition: "Formula 1",
    }));
}

// ── Football via ESPN (no API key required) ──────────────────────────────────
async function fetchESPN(
  leagueSlug: string,
  category: string,
  competition: string,
  teamFilter: string | null = null,
  limit = 10
): Promise<SportEvent[]> {
  const ESPN = `http://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}`;

  const todayBoard = await fetch(`${ESPN}/scoreboard`, UA).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!todayBoard) return [];

  const todayStr     = new Date().toISOString().slice(0, 10);
  const todayCompact = todayStr.replace(/-/g, "");

  const upcomingDates: string[] = (todayBoard.leagues?.[0]?.calendar ?? [] as string[])
    .map((d: string) => d.slice(0, 10).replace(/-/g, ""))
    .filter((d: string) => d > todayCompact)
    .slice(0, teamFilter ? 10 : 7);   // narrower window for full-league fetches

  const boards = await Promise.allSettled([
    Promise.resolve(todayBoard),
    ...upcomingDates.map(d =>
      fetch(`${ESPN}/scoreboard?dates=${d}`, UA).then(r => r.ok ? r.json() : null).catch(() => null)
    ),
  ]);

  const needle = teamFilter?.toLowerCase() ?? null;
  const events: SportEvent[] = [];

  for (const r of boards) {
    if (r.status !== "fulfilled" || !r.value) continue;
    for (const ev of (r.value.events ?? []) as EspnEvent[]) {
      if (needle && !ev.name?.toLowerCase().includes(needle)) continue;
      const comp = ev.competitions?.[0];
      if (!comp || comp.status?.type?.state === "post") continue;

      const { date, time } = toNorway(new Date(ev.date).getTime());
      if (date < todayStr) continue;

      events.push({
        id:          `${category}-espn-${ev.id}`,
        category,
        name:        (() => {
          const parts = ev.name.split(/ at /i);
          if (parts.length === 2) return `${parts[1].trim()} – ${parts[0].trim()}`;
          return ev.name.replace(/ vs\.? /i, " – ");
        })(),
        venue:       comp.venue?.displayName ?? comp.venue?.address?.city,
        date,
        time,
        competition,
      });
    }
  }

  return events
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))
    .slice(0, limit);
}

// ── TheSportsDB: next events for a league ────────────────────────────────────
async function fetchTsdbLeague(
  sport: string,
  leagueMatch: string,
  category: string,
  limit = 5
): Promise<SportEvent[]> {
  const sRes = await fetch(
    `${TSDB}/search_all_leagues.php?s=${encodeURIComponent(sport)}`, UA
  );
  if (!sRes.ok) return [];
  const sJson = await sRes.json();
  const leagues: TsdbLeague[] = sJson.countries ?? [];
  const league = leagues.find(l =>
    l.strLeague?.toLowerCase().includes(leagueMatch.toLowerCase())
  );
  if (!league) return [];

  const eRes = await fetch(`${TSDB}/eventsnextleague.php?id=${league.idLeague}`, UA);
  if (!eRes.ok) return [];
  const eJson = await eRes.json();
  const today = new Date().toISOString().slice(0, 10);
  return ((eJson.events ?? []) as TsdbEvent[])
    .filter(e => e.dateEvent >= today)
    .slice(0, limit)
    .map(e => ({
      id:          `${category}-${e.idEvent}`,
      category,
      name:        e.strEvent,
      venue:       e.strVenue || undefined,
      date:        e.dateEvent,
      time:        e.strTime ? norwayTime(e.dateEvent, e.strTime) : undefined,
      competition: e.strLeague ?? league.strLeague,
    }));
}

// ── Golf majors (static calendar) ────────────────────────────────────────────
function getGolfMajors(): SportEvent[] {
  const today  = new Date().toISOString().slice(0, 10);
  const rounds = ["Runde 1", "Runde 2", "Runde 3", "Final"];
  const majors: { name: string; venue: string; dates: string[] }[] = [
    { name: "PGA Championship",      venue: "Quail Hollow Club, Charlotte",
      dates: ["2026-05-14","2026-05-15","2026-05-16","2026-05-17"] },
    { name: "US Open",               venue: "Oakmont Country Club, Pennsylvania",
      dates: ["2026-06-18","2026-06-19","2026-06-20","2026-06-21"] },
    { name: "The Open Championship", venue: "Royal Portrush",
      dates: ["2026-07-16","2026-07-17","2026-07-18","2026-07-19"] },
  ];
  return majors.flatMap(m =>
    m.dates
      .map((date, i) => ({ date, round: rounds[i] }))
      .filter(({ date }) => date >= today)
      .map(({ date, round }) => ({
        id: `golf-${date}`, category: "golf",
        name: `${m.name} — ${round}`, venue: m.venue, date, competition: "Golf Major",
      }))
  );
}

// ── Friidrett (manuell kalender — TheSportsDB/ESPN har ikke Diamond League
//    eller utendørs-EM, så datoene må oppdateres for hånd hver sesong) ────────
function getAthleticsCalendar(): SportEvent[] {
  const today = new Date().toISOString().slice(0, 10);
  const events: SportEvent[] = [];

  const diamondLeague: { city: string; date: string }[] = [
    { city: "Lausanne",         date: "2026-08-21" },
    { city: "Silesia",          date: "2026-08-23" },
    { city: "Zürich",           date: "2026-08-27" },
    { city: "Brussel (finale)", date: "2026-09-04" },
  ];
  for (const m of diamondLeague) {
    if (m.date < today) continue;
    events.push({
      id: `athletics-dl-${m.date}`,
      category: "athletics",
      name: `Diamond League — ${m.city}`,
      date: m.date,
      competition: "Diamond League",
    });
  }

  // EM friidrett 2026, Birmingham — 10.–16. august
  for (let d = new Date("2026-08-10T00:00:00"); d.toISOString().slice(0, 10) <= "2026-08-16"; d.setDate(d.getDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    if (date < today) continue;
    events.push({
      id: `athletics-em-${date}`,
      category: "athletics",
      name: "EM friidrett — Birmingham",
      venue: "Alexander Stadium, Birmingham",
      date,
      competition: "European Athletics Championships",
    });
  }

  return events;
}

// ── Source list — add new sports here ───────────────────────────────────────
const SOURCES: Array<() => Promise<SportEvent[]>> = [
  fetchF1,
  () => fetchESPN("nor.1", "football",      "Eliteserien",    "Viking", 10),
  () => fetchESPN("nor.1", "football_eli",  "Eliteserien",    null,     60),
  () => fetchESPN("nor.2", "football_obos", "Obosligaen",     null,     40),
  () => fetchESPN("eng.1", "football_pl",   "Premier League", null,     60),
  () => fetchTsdbLeague("Darts", "PDC", "darts", 10),
  () => Promise.resolve(getAthleticsCalendar()),
  () => Promise.resolve(getGolfMajors()),
];

export async function getSportEvents(): Promise<SportEvent[]> {
  if (cache && cache.expires > Date.now()) return cache.data;

  const results = await Promise.allSettled(SOURCES.map(fn => fn()));

  const raw: SportEvent[] = results
    .flatMap(r => r.status === "fulfilled" ? r.value : [])
    .filter(e => e.date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));

  // Fjern league-duplikater: hvis et Viking-spill (football) finnes i Eliteserien (football_eli), behold kun football-versjonen
  const featuredKeys = new Set(
    raw.filter(e => e.category === "football").map(e => `${e.date}|${e.name.toLowerCase()}`)
  );
  const events = raw.filter(e =>
    e.category !== "football_eli" || !featuredKeys.has(`${e.date}|${e.name.toLowerCase()}`)
  );

  cache = { data: events, expires: Date.now() + 3 * 60 * 60 * 1000, fetchedAt: Date.now() };
  return events;
}

export function getSportsFetchedAt(): number | null {
  return cache?.fetchedAt ?? null;
}

// ── Types ────────────────────────────────────────────────────────────────────
interface F1Race {
  season: string; round: string; raceName: string; date: string; time?: string;
  Circuit: { Location: { locality: string; country: string } };
}
interface EspnEvent {
  id: string; name: string; date: string;
  competitions?: Array<{
    status?: { type?: { state?: string } };
    venue?: { displayName?: string; address?: { city?: string } };
  }>;
}
interface TsdbLeague { idLeague: string; strLeague: string }
interface TsdbEvent {
  idEvent: string; strEvent: string; dateEvent: string;
  strTime?: string; strVenue?: string; strLeague?: string;
}
