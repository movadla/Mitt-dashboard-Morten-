// Delt mellom server (lib/sports.ts) og klient (SportSection.tsx/TodaySummary.tsx)
// — egen fil UTEN "server-only", slik at klientkomponenter kan importere disse
// konstantene uten å dra med seg hele den server-only fetch-/Redis-modulen
// (samme mønster som lib/sportsCache.ts bruker for å unngå sirkulær import).

// Kategorier som alltid vises som enkeltkamper (fremhevet), aldri gruppert i
// en liga-runde — Viking, Man Utd (uansett hvilken turnering de spiller i) og
// Norges landslag.
export const HIGHLIGHT_CATEGORIES = new Set(["football", "football_manu", "football_norway"]);

// Fulle liga-/turnerings-runder — mange kamper samme dag, skal grupperes bak
// en "X-runde"-samlelinje man kan drille ned i, ikke listes ut enkeltvis.
export const LEAGUE_ROUND_CATEGORIES = new Set([
  "football_eli",
  "football_obos",
  "football_pl",
  "football_facup",
  "football_ucl",
]);
export const LEAGUE_ROUND_LABELS: Record<string, string> = {
  football_eli: "Eliteserien",
  football_obos: "Obosligaen",
  football_pl: "Premier League",
  football_facup: "FA Cup",
  football_ucl: "Champions League",
};
