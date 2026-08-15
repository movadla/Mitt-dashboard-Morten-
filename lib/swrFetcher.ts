// Delt fetcher for useSWR — samme GET-endepunkt kalt fra flere komponenter
// (f.eks. TodaySummary + det fulle kortet) dedupes automatisk av SWR sin
// globale cache når de bruker samme nøkkel (URL) og denne fetcheren.
export const jsonFetcher = (url: string) => fetch(url).then((r) => r.json());
