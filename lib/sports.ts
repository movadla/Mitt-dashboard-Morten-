// Unified sports aggregator.
// Add a new sport by appending an entry to SOURCES — nothing else to change.

import { getJSON, setJSON } from "./kv";
import { addDaysIso, localDateString } from "./payday";
import { getCustomSportEvents } from "./customSports";
import { SPORTS_CACHE_KEY } from "./sportsCache";
import { HIGHLIGHT_CATEGORIES, LEAGUE_ROUND_CATEGORIES, LEAGUE_ROUND_LABELS } from "./sportsCategories";

export { HIGHLIGHT_CATEGORIES, LEAGUE_ROUND_CATEGORIES, LEAGUE_ROUND_LABELS };

const UA   = { headers: { "User-Agent": "mitt-private-dashboard/1.0" } };
const TSDB = "https://www.thesportsdb.com/api/v1/json/3";

// Lagres i Redis (ikke modul-minne) slik at cachen overlever serverless
// cold starts på Vercel — et rent JS-objekt nullstilles ved hver kalde start.
const CACHE_KEY = SPORTS_CACHE_KEY;
const CACHE_TTL_SECONDS = 3 * 60 * 60;
let lastFetchedAt: number | null = null;

export interface SportEvent {
  id: string;
  category: string;
  name: string;
  venue?: string;
  date: string;        // YYYY-MM-DD, Norway local
  time?: string;       // HH:MM, Norway local
  competition: string;
  highlight?: boolean; // kun relevant for category "personal" — styrer visning i "I dag"
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
  const today = localDateString();
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

  const todayStr     = localDateString();
  const todayCompact = todayStr.replace(/-/g, "");
  // Full-liga-runder (ingen teamFilter) trengte tidligere kun 7 dager frem fordi
  // UI-et var hardkodet til én ukes vindu — nå som SportSection kan vise flere
  // uker (se "Vis flere uker"), må dette vinduet strekke seg like langt, ellers
  // blir de nye dagkortene tomme selv om ligaen faktisk spiller runder lenger frem.
  const vinduDager = teamFilter ? 10 : 21;

  // ESPN svarer med TO HELT ULIKE former på `calendar` (2026-09-08):
  //
  //   Ligaer (eng.1, nor.1):  ["2026-08-21T07:00Z", "2026-08-22T07:00Z", ...]
  //   Cuper  (uefa.champions, eng.fa):
  //       [{ label: "UEFA Champions League", entries: [{ label: "League Phase",
  //          startDate, endDate }, ...] }]
  //
  // Den gamle koden antok den flate formen og kalte d.slice(0, 10) rett på
  // elementet. For cupene er elementet et objekt, så det kastet TypeError — og
  // fordi getSportEvents samler kildene med Promise.allSettled ble hele
  // turneringen borte i stillhet, inkludert kampene som ALLEREDE lå i
  // dagens tavle. Det er derfor Champions League og FA Cup aldri har vist noe,
  // mens Premier League og Eliteserien har fungert hele tiden.
  //
  // Cup-formen har ingen liste over enkeltdatoer å hente ut — bare
  // fase-intervaller — så der spørres det i stedet med ett dato-INTERVALL
  // (?dates=20260908-20260929), som ESPN godtar og som dekker vinduet i ett kall.
  const rawCalendar: unknown = todayBoard.leagues?.[0]?.calendar;
  const flatDates: string[] = Array.isArray(rawCalendar) ? rawCalendar.filter((d): d is string => typeof d === "string") : [];

  const dateQueries: string[] =
    flatDates.length > 0
      ? flatDates
          .map((d) => d.slice(0, 10).replace(/-/g, ""))
          .filter((d) => d > todayCompact)
          .slice(0, vinduDager)
      : [`${todayCompact}-${addDaysIso(todayStr, vinduDager).replace(/-/g, "")}`];

  const boards = await Promise.allSettled([
    Promise.resolve(todayBoard),
    ...dateQueries.map(d =>
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

  // Dedupe FØR slice: intervall-spørringen over dekker også dagens dato, så de
  // samme kampene kommer inn både fra dagens tavle og fra intervallet. Uten dette
  // spiste duplikatene av `limit`, og getSportEvents sin globale dedupe kommer
  // for sent — den kjører etter at dette kuttet allerede er gjort.
  return [...new Map(events.map((e) => [e.id, e])).values()]
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

  const today = localDateString();

  // TheSportsDB flipper en flerdagers-turnering sin PÅGÅENDE dag over til
  // "past" (og dermed ut av eventsnextleague) straks datoen er nådd, siden
  // slike oppføringer ikke har noe reelt klokkeslett (strTime "00:00:00" —
  // en midnatt-plassholder, ikke faktisk kampstart). Uten dette forsvant
  // f.eks. "World Series of Darts Finals Day 1" fra lista på selve dagen
  // den startet, og appen så ut til å hevde at turneringen ikke begynte før
  // "Day 2" i morgen (2026-09-17, meldt av bruker). Hentes derfor fra BEGGE
  // endepunkt og slås sammen — past bidrar kun med dagens egne oppføringer.
  const [nextRes, pastRes] = await Promise.all([
    fetch(`${TSDB}/eventsnextleague.php?id=${league.idLeague}`, UA),
    fetch(`${TSDB}/eventspastleague.php?id=${league.idLeague}`, UA),
  ]);
  const nextJson = nextRes.ok ? await nextRes.json() : { events: [] };
  const pastJson = pastRes.ok ? await pastRes.json() : { events: [] };
  const merged = [
    ...((nextJson.events ?? []) as TsdbEvent[]),
    ...((pastJson.events ?? []) as TsdbEvent[]).filter(e => e.dateEvent === today),
  ];

  return [...new Map(merged.map(e => [e.idEvent, e])).values()]
    .filter(e => e.dateEvent >= today)
    .sort((a, b) => a.dateEvent.localeCompare(b.dateEvent))
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

// ── TheSportsDB: neste kamper for et enkelt lag, uansett turnering ──────────
// Brukt for Norges landslag — de bytter mellom Nations League/kvalik/
// vennskapskamper gjennom sesongen, og et lag-basert oppslag fanger opp neste
// kamp uansett hvilken turnering den tilhører, i stedet for å måtte holde
// styr på hvilket ESPN-slug som er aktivt akkurat nå.
async function fetchTsdbTeam(teamName: string, category: string, limit = 5): Promise<SportEvent[]> {
  const sRes = await fetch(`${TSDB}/searchteams.php?t=${encodeURIComponent(teamName)}`, UA);
  if (!sRes.ok) return [];
  const sJson = await sRes.json();
  const team: TsdbTeam | undefined = (sJson.teams ?? []).find((t: TsdbTeam) => t.strSport === "Soccer");
  if (!team) return [];

  const eRes = await fetch(`${TSDB}/eventsnext.php?id=${team.idTeam}`, UA);
  if (!eRes.ok) return [];
  const eJson = await eRes.json();
  const today = localDateString();
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
      competition: e.strLeague ?? teamName,
    }));
}

// ── TheSportsDB: neste UEFA-cupkamp for et enkelt lag ────────────────────────
// Samme lag-baserte oppslag som fetchTsdbTeam, men filtrert til kun Champions
// League/Europa League/Conference League — et lags "neste kamper uansett
// turnering" vil for det meste være vanlige seriekamper (som allerede dekkes
// av football_eli), så disse må filtreres bort her for å unngå duplikater.
const UEFA_CUP_PATTERN = /UEFA|Champions League|Europa League|Conference League/i;

// TheSportsDBs gratis-tier svarer av og til med en feil eller tom respons under
// samtidig last (7 klubber × 2 kall samtidig via Promise.allSettled i SOURCES) —
// ett nytt forsøk etter en kort pause løser de fleste av disse i praksis.
async function fetchTsdbWithRetry(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, UA);
      if (res.ok) return res;
    } catch {
      // nettverksfeil — prøv igjen under
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 400));
  }
  return null;
}

async function fetchTsdbTeamEuropean(teamName: string, category: string, limit = 5): Promise<SportEvent[]> {
  const sRes = await fetchTsdbWithRetry(`${TSDB}/searchteams.php?t=${encodeURIComponent(teamName)}`);
  if (!sRes) return [];
  const sJson = await sRes.json();
  const team: TsdbTeam | undefined = (sJson.teams ?? []).find((t: TsdbTeam) => t.strSport === "Soccer");
  if (!team) return [];

  const eRes = await fetchTsdbWithRetry(`${TSDB}/eventsnext.php?id=${team.idTeam}`);
  if (!eRes) return [];
  const eJson = await eRes.json();
  const today = localDateString();
  return ((eJson.events ?? []) as TsdbEvent[])
    .filter(e => e.dateEvent >= today && e.strLeague && UEFA_CUP_PATTERN.test(e.strLeague))
    .slice(0, limit)
    .map(e => ({
      id:          `${category}-${e.idEvent}`,
      category,
      name:        e.strEvent,
      venue:       e.strVenue || undefined,
      date:        e.dateEvent,
      time:        e.strTime ? norwayTime(e.dateEvent, e.strTime) : undefined,
      competition: e.strLeague ?? "UEFA",
    }));
}

// ── TheSportsDB: neste HJEMMEkamper for et enkelt lag ────────────────────────
// Samme lag-baserte oppslag som fetchTsdbTeamEuropean, men filtrert til KUN
// hjemmekamper (Morten 2026-09-07: Lyn spiller i nabolaget hans - han trenger
// bare vite når de spiller hjemme, uansett hvilken divisjon de ligger i akkurat
// denne sesongen). Lag-basert oppslag (ikke en ESPN-liga-slug) fordi ESPN ikke
// dekker de norske lavere divisjonene Lyn beveger seg mellom.
async function fetchTsdbTeamHome(teamName: string, category: string, limit = 5): Promise<SportEvent[]> {
  const sRes = await fetchTsdbWithRetry(`${TSDB}/searchteams.php?t=${encodeURIComponent(teamName)}`);
  if (!sRes) return [];
  const sJson = await sRes.json();
  const team: TsdbTeam | undefined = (sJson.teams ?? []).find((t: TsdbTeam) => t.strSport === "Soccer");
  if (!team) return [];

  const eRes = await fetchTsdbWithRetry(`${TSDB}/eventsnext.php?id=${team.idTeam}`);
  if (!eRes) return [];
  const eJson = await eRes.json();
  const today = localDateString();
  const teamNameLower = team.strTeam?.toLowerCase();
  return ((eJson.events ?? []) as TsdbEvent[])
    .filter(e => e.dateEvent >= today && !!teamNameLower && e.strHomeTeam?.toLowerCase() === teamNameLower)
    .slice(0, limit)
    .map(e => ({
      id:          `${category}-${e.idEvent}`,
      category,
      name:        e.strEvent,
      venue:       e.strVenue || undefined,
      date:        e.dateEvent,
      time:        e.strTime ? norwayTime(e.dateEvent, e.strTime) : undefined,
      competition: e.strLeague ?? teamName,
    }));
}

// Klubber som jevnlig kvalifiserer til europeisk klubbfotball — løs liste,
// kan trenge justering fra sesong til sesong (se Morten). Viking har alltid
// prioritet i visningen (se HIGHLIGHT_CATEGORIES/splitDayEvents i
// SportSection.tsx) selv når flere av disse spiller samme dag.
const NORWEGIAN_EUROPEAN_CLUBS = ["Viking", "Bodø/Glimt", "Molde", "Rosenborg", "Brann", "Tromsø", "Lillestrøm"];

// ── Golf majors (static calendar) ────────────────────────────────────────────
function getGolfMajors(): SportEvent[] {
  const today  = localDateString();
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
  const today = localDateString();
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

// ── Egne kamper (brukeren legger selv til, typisk via chatboten) ────────────
async function fetchCustomEvents(): Promise<SportEvent[]> {
  const custom = await getCustomSportEvents();
  return custom.map((e) => ({
    id: `personal-${e.id}`,
    category: "personal",
    name: e.name,
    venue: e.venue,
    date: e.date,
    time: e.time,
    competition: e.competition ?? "Egen kamp",
    highlight: e.highlight,
  }));
}

// ── Source list — add new sports here ───────────────────────────────────────
const SOURCES: Array<() => Promise<SportEvent[]>> = [
  fetchF1,
  () => fetchESPN("nor.1", "football",      "Eliteserien",    "Viking", 10),
  () => fetchESPN("nor.1", "football_eli",  "Eliteserien",    null,     60),
  () => fetchESPN("nor.2", "football_obos", "Obosligaen",     null,     40),
  () => fetchESPN("eng.1", "football_pl",   "Premier League", null,     60),
  () => fetchESPN("eng.1", "football_manu", "Premier League", "Manchester United", 10),
  () => fetchESPN("eng.fa", "football_facup", "FA Cup",       null,     60),
  () => fetchESPN("eng.fa", "football_manu",  "FA Cup",       "Manchester United", 10),
  () => fetchESPN("uefa.champions", "football_ucl",  "Champions League", null,                60),
  () => fetchESPN("uefa.champions", "football_manu", "Champions League", "Manchester United", 10),
  () => fetchTsdbTeam("Norway", "football_norway", 5),
  ...NORWEGIAN_EUROPEAN_CLUBS.map(name => () => fetchTsdbTeamEuropean(name, "football_no_uefa", 5)),
  () => fetchTsdbTeamHome("Lyn", "football_lyn", 5),
  () => fetchTsdbLeague("Darts", "PDC", "darts", 10),
  () => Promise.resolve(getAthleticsCalendar()),
  () => Promise.resolve(getGolfMajors()),
  fetchCustomEvents,
];

export async function getSportEvents(): Promise<SportEvent[]> {
  const cached = await getJSON<{ data: SportEvent[]; fetchedAt: number }>(CACHE_KEY);
  if (cached) {
    lastFetchedAt = cached.fetchedAt;
    return cached.data;
  }

  const results = await Promise.allSettled(SOURCES.map(fn => fn()));

  const fetched = results.flatMap(r => r.status === "fulfilled" ? r.value : []);
  // ESPN sine dato-inndelte scoreboard-kall overlapper av og til (samme kamp
  // dukker opp i både "i dag"-tavlen og en senere spesifikk-dato-tavle) — dedupe
  // på id før videre filtrering, ellers får React duplikate list-keys når man
  // blar frem i "I dag"-boksen og treffer den datoen.
  const deduped = [...new Map(fetched.map(e => [e.id, e])).values()];

  const raw: SportEvent[] = deduped
    .filter(e => e.date >= localDateString())
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));

  // Fjern league-duplikater: hvis en fremhevet kamp (Viking/Man Utd/Norge)
  // finnes i sin fulle liga-runde (Eliteserien/PL/FA Cup/Champions League),
  // behold kun den fremhevede versjonen.
  const featuredKeys = new Set(
    raw.filter(e => HIGHLIGHT_CATEGORIES.has(e.category)).map(e => `${e.date}|${e.name.toLowerCase()}`)
  );
  const events = raw.filter(e =>
    !LEAGUE_ROUND_CATEGORIES.has(e.category) || !featuredKeys.has(`${e.date}|${e.name.toLowerCase()}`)
  );

  lastFetchedAt = Date.now();
  await setJSON(CACHE_KEY, { data: events, fetchedAt: lastFetchedAt }, CACHE_TTL_SECONDS);
  return events;
}

export function getSportsFetchedAt(): number | null {
  return lastFetchedAt;
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
interface TsdbTeam { idTeam: string; strTeam?: string; strSport?: string }
interface TsdbEvent {
  idEvent: string; strEvent: string; dateEvent: string;
  strTime?: string; strVenue?: string; strLeague?: string; strHomeTeam?: string;
}
