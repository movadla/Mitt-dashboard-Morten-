import { hdel, hgetallJSON, hsetJSON } from "./kv";
import { markKey, type ReviewMark, type ReviewMarkStatus } from "./incomeForecastReviewMarkTypes";

// Morten sine egne vurderinger av leieforholdene i "Leieforhold til gjennomgang" (v35,
// 2026-09-11). Bakgrunn: lista er en arbeidsliste på ~80 rader, og når han har tatt stilling til
// en rad finnes det i dag ingen måte å registrere det på - den blir liggende og støye ved hver
// gjennomgang, og neste kjøring av pipelinen vet ingenting om vurderingen.
//
// To statuser, fordi de to sakene hans er motsatte:
//  - "avklart": vurdert og i orden, skal UT av arbeidslista (Lyreco: kontrakten fornyes, punktum).
//    Beløpet i prognosen er uendret - dette er kun en kvittering på at raden er sett.
//  - "usikker": beløpet BEHOLDES i prognosen, men er merket som usikkert (Rema 1000: "godt mulig
//    det ikke blir noe av inntekter der i år"). Raden blir liggende i arbeidslista, og merket
//    følger leietakeren inn i Leieinntekter-tabellen slik at man ser det der pengene står.
//
// Egen Redis-hash, IKKE en del av snapshotet: scripts/build-remaining-summary.js bygger det
// snapshotet på nytt ved hver kjøring og ville ha slettet vurderingene. Samme mønster som
// lib/tenantForecastComments.ts. Det betyr også at innholdet kun finnes i Redis - det er med i
// /api/income-forecast/backup nettopp derfor.
export type { ReviewMark, ReviewMarkStatus } from "./incomeForecastReviewMarkTypes";

const HASH_KEY = "jobb:inntektsprognose-vurderinger";

export async function getReviewMarks(): Promise<ReviewMark[]> {
  const stored = await hgetallJSON<ReviewMark>(HASH_KEY);
  return Object.values(stored);
}

export async function setReviewMark(
  leietaker: string,
  bygg: string,
  status: ReviewMarkStatus,
  notat: string,
  skjulFraGjennomgang?: boolean,
): Promise<ReviewMark> {
  const l = leietaker.trim();
  if (!l) throw new Error("Mangler leietakernavn");
  if (!["avklart", "usikker", "mangler-fakturering", "ma-sjekkes"].includes(status)) throw new Error(`Ukjent status: ${status}`);
  const entry: ReviewMark = {
    leietaker: l,
    bygg: bygg.trim(),
    status,
    // "avklart" betyr pr. definisjon ferdigbehandlet, så den skjules med mindre noe annet sies.
    skjulFraGjennomgang: skjulFraGjennomgang ?? status === "avklart",
    notat: notat.trim(),
    sistOppdatert: new Date().toISOString().slice(0, 10),
  };
  await hsetJSON(HASH_KEY, markKey(l, entry.bygg), entry);
  return entry;
}

export async function removeReviewMark(leietaker: string, bygg: string): Promise<void> {
  await hdel(HASH_KEY, markKey(leietaker, bygg));
}
