import { hgetJSON, hsetJSON } from "./kv";

// v17 (2026-09-07, "gjør som en inntektskontroller"-gjennomgangen): et enkelt kjørehistorikk-
// spor for kjernetallet i prognosen (bokført + gjenstår + manuelle linjer - IKKE de mykere
// tilleggene reforhandling/potensial/ledige lokaler, som er Mortens egne, når-som-helst-endrede
// anslag og derfor ikke sier noe om at "modellen" beveget seg). Uten dette var det umulig å se om
// prognosen gikk opp eller ned siden sist - hvert snapshot overskrev det forrige uten spor.
//
// Ett punkt pr. KALENDERDAG (dedupliseres ved skriving - samme dag overskriver, ikke dupliserer),
// registrert fra klienten første gang siden noen faktisk ser på siden den dagen (se
// IncomeForecastSection.tsx). Enkelt, ikke en cron-jobb - passer en personlig-bruk-dashboard uten
// bakgrunnsjobb-infrastruktur. Kappet til de siste 180 punktene (~6 måneder ved daglig bruk).
export interface HistoryPoint {
  dato: string; // "YYYY-MM-DD"
  kjerneTotal: number; // rollup.totalt: bokført + gjenstår + manuelle linjer
}

const HASH_KEY = "jobb:inntektsprognose-historikk";
const FIELD = "punkter";
const MAKS_PUNKTER = 180;

export async function getHistory(): Promise<HistoryPoint[]> {
  const punkter = await hgetJSON<HistoryPoint[]>(HASH_KEY, FIELD);
  return punkter ?? [];
}

export async function recordHistoryPoint(point: HistoryPoint): Promise<HistoryPoint[]> {
  const punkter = await getHistory();
  const utenDagensDato = punkter.filter((p) => p.dato !== point.dato);
  const neste = [...utenDagensDato, point].sort((a, b) => a.dato.localeCompare(b.dato)).slice(-MAKS_PUNKTER);
  await hsetJSON(HASH_KEY, FIELD, neste);
  return neste;
}
