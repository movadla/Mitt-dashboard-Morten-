// Henter Mortens dart-statistikk direkte fra Supabase-databasen som Mikke Mus-appen
// (C:\Users\md88\Documents\mikke-mus) skriver til. Mikke Mus selv kjører kun lokalt
// (ingen stabil URL), men Supabase er alltid oppe — så vi går rett dit i stedet for
// å prøve å nå Mikke Mus-serveren. Nøkkelen under er en "publishable" anon-nøkkel
// (samme som brukes klientsidig i Mikke Mus selv) — ikke en hemmelighet, trygg å
// ha i kildekoden slik Mikke Mus selv gjør med NEXT_PUBLIC_SUPABASE_ANON_KEY.
const SUPABASE_URL = "https://hpwkkikowrowinqkwmsr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_a8iUOmoeFyG_UAmg8o6xTA_OB9Y35A0";
const PLAYER_ID = "morten";

export interface DartsMatch {
  date: string;
  won: boolean;
  dartsUsed: number;
  hitPct: number;
}

export interface DartsStats {
  matchesPlayed: number;
  matchesWon: number;
  hitPct: number;
  avgDartsPerWin: number | null;
  bestDartsToFinish: number | null;
  recentMatches: DartsMatch[];
}

let cache: { data: DartsStats | null; expires: number; fetchedAt: number } | null = null;

interface PlayerRow {
  matches_played: number;
  matches_won: number;
  darts_in_wins: number;
  overall_hits: number;
  overall_misses: number;
  best_darts_to_finish: number | null;
  match_history: DartsMatch[] | null;
}

export async function getDartsStats(): Promise<DartsStats | null> {
  if (cache && cache.expires > Date.now()) return cache.data;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/players?id=eq.${PLAYER_ID}&select=matches_played,matches_won,darts_in_wins,overall_hits,overall_misses,best_darts_to_finish,match_history`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
    );
    if (!res.ok) throw new Error("Supabase-forespørsel feilet");
    const rows = (await res.json()) as PlayerRow[];
    const row = rows[0];
    if (!row) {
      cache = { data: null, expires: Date.now() + 30 * 60 * 1000, fetchedAt: Date.now() };
      return null;
    }

    const hits = row.overall_hits ?? 0;
    const misses = row.overall_misses ?? 0;
    const history = row.match_history ?? [];

    const data: DartsStats = {
      matchesPlayed: row.matches_played ?? 0,
      matchesWon: row.matches_won ?? 0,
      hitPct: hits + misses > 0 ? Math.round((hits / (hits + misses)) * 100) : 0,
      avgDartsPerWin: row.matches_won > 0 ? Math.round(row.darts_in_wins / row.matches_won) : null,
      bestDartsToFinish: row.best_darts_to_finish ?? null,
      recentMatches: [...history].reverse().slice(0, 5),
    };

    cache = { data, expires: Date.now() + 30 * 60 * 1000, fetchedAt: Date.now() };
    return data;
  } catch {
    return null;
  }
}

export function getDartsFetchedAt(): number | null {
  return cache?.fetchedAt ?? null;
}
