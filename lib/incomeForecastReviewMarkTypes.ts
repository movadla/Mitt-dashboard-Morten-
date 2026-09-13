// Rene typer og oppslagsfunksjoner for vurderingene i "Leieforhold til gjennomgang" (v35).
//
// Ligger i EGEN fil, skilt fra lib/incomeForecastReviewMarks.ts, av nøyaktig samme grunn som
// lib/tenantForecastSystemRow.ts ble skilt ut fra tenantForecastTable.ts (v25): den andre filen
// importerer ./kv (server-only, ioredis) på toppnivå, så et VERDI-import derfra - f.eks.
// `finnMark` brukt i app/IncomeForecastSection.tsx, som er en klientkomponent - ville dratt hele
// Redis-klienten inn i nettleser-bundlen og krasjet builden med "Module not found: Can't resolve
// 'net'/'tls'". tsc fanger det ikke; det dukker først opp i `npm run build`.
// Denne filen har INGEN avhengigheter og er trygg å importere fra klientkode.

// v38 (2026-09-11): "mangler-fakturering" er en TREDJE kategori, ikke en variant av de to andre.
// Morten: "Telenor Towers kan du legge på en egen liste: Mangler fakturering, sammen med Telia
// Rooftops og Utleiemegleren". Felles for dem er at beløpet er reelt og skal stå i prognosen, men
// at faktureringen ikke har skjedd - det er en oppfølgingsoppgave mot Fazile/regnskap, ikke en
// usikkerhet ved tallet. De vises derfor i en egen liste med sum, slik at de kan jages samlet.
// v44 (2026-09-11, Morten: "legg den i rød farge siden de må sjekkes ekstra"): "ma-sjekkes" er et
// sterkere signal enn "usikker". Usikker = beløpet kan endre seg. Må sjekkes = det er mistanke om
// at tallet er FEIL (Follestad Trend: mistenkt overfakturert) og noen må se på det konkret.
// Leietakernavnet vises i rødt i Leieinntekter-tabellen, ikke bare med en brikke.
export type ReviewMarkStatus = "avklart" | "usikker" | "mangler-fakturering" | "ma-sjekkes";

export interface ReviewMark {
  leietaker: string;
  // Tomt bygg = merket gjelder ALLE byggene til leietakeren.
  bygg: string;
  status: ReviewMarkStatus;
  // v36 (2026-09-11): skilt fra `status`, fordi Morten ba om begge deler samtidig for Lemonwax -
  // "merk den som usikker i leietakerlisten, fjern fra gjennomgang". Status sier HVA vurderingen
  // er; dette flagget sier om raden fortsatt skal stå i arbeidslista. "avklart" setter det true
  // som default, men en "usikker" rad kan også skjules når beslutningen faktisk er tatt og det
  // bare er beløpet som er usikkert.
  skjulFraGjennomgang?: boolean;
  notat: string;
  sistOppdatert: string;
}

export function markKey(leietaker: string, bygg: string): string {
  return `${leietaker.trim().toLowerCase()}||${bygg.trim().toLowerCase()}`;
}

// Slår opp et merke for (leietaker, bygg) med fallback til leietaker-nivå (bygg = ""), slik at
// ett merke kan dekke alle byggene til en leietaker uten å måtte settes pr. rad.
export function finnMark(marks: ReviewMark[], leietaker: string, bygg: string): ReviewMark | null {
  const eksakt = marks.find((m) => markKey(m.leietaker, m.bygg) === markKey(leietaker, bygg));
  if (eksakt) return eksakt;
  const leietakerNivaa = leietaker.trim().toLowerCase();
  return marks.find((m) => m.bygg.trim() === "" && m.leietaker.trim().toLowerCase() === leietakerNivaa) ?? null;
}
