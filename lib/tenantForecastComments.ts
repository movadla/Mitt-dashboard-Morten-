import { hgetallJSON, hsetJSON } from "./kv";
import { anonymizeIfPerson } from "./tenantAnonymize";

// Frie kommentarer pr. leietaker i "Gjenstår per leietaker"/"Leieinntekter"-tabellene
// (Inntektsprognose). Holdes i en EGEN Redis-hash, ikke i selve tenant-forecast-table-
// snapshotet - det snapshotet bygges på nytt av scripts/build-tenant-forecast-table.js
// hver gang pipelinen kjøres, og ville ha overskrevet/mistet kommentarene ellers.
// Kobles inn i lib/tenantForecastTable.ts ved lesing (samme mønster som anonymisering der).

interface TenantForecastComment {
  navn: string;
  kommentar: string;
  sistOppdatert: string;
  // v53 (2026-09-11): hvem som skrev kommentaren. Mortens egne (fra UI-en) har ikke feltet;
  // Claude sine analysekommentarer merkes "claude" og vises i egen farge i tabellen, slik at
  // Morten ser hva som er hans vurdering og hva som er en maskinell forklaring han kan overprøve.
  forfatter?: "claude";
  // v15 (2026-09-06, scripts/build-tenant-forecast-table.js sin settAutoKommentar()): satt av
  // PIPELINEN selv når kommentaren er en autogenerert forklaring (regenereres ved hver kjøring,
  // se `erAutoKommentar()` der). UI-en (setTenantForecastComment() under) setter ALDRI dette
  // feltet, så en ekte Morten-/Claude-kommentar har det aldri satt.
  auto?: boolean;
}

const HASH_KEY = "jobb:inntektsprognose-leietaker-kommentarer";

function normalizeKey(navn: string): string {
  return navn.trim().toLowerCase();
}

export async function getTenantForecastComments(): Promise<Record<string, string>> {
  const stored = await hgetallJSON<TenantForecastComment>(HASH_KEY);
  const result: Record<string, string> = {};
  for (const entry of Object.values(stored)) {
    if (entry.kommentar) result[normalizeKey(entry.navn)] = entry.kommentar;
  }
  return result;
}

// v77 (2026-09-26, presentasjonsrevisjon): før dette fantes, kunne lib/tenantForecastTable.ts sin
// withComments() kun se OM en oppføring fantes i denne hashen, ikke om den var pipelinens EGEN
// autogenererte tekst (`auto: true`, satt av settAutoKommentar() i build-tenant-forecast-table.js)
// eller en ekte Morten-/Claude-kommentar - feilaktig behandlet ALT som "ekte" siden mange
// autokommentarer faktisk lever i SAMME Redis-hash. Denne gir det ekte skillet videre til UI-en.
export async function getTenantForecastCommentAutoFlags(): Promise<Record<string, boolean>> {
  const stored = await hgetallJSON<TenantForecastComment>(HASH_KEY);
  const result: Record<string, boolean> = {};
  for (const entry of Object.values(stored)) {
    if (entry.kommentar) result[normalizeKey(entry.navn)] = entry.auto === true;
  }
  return result;
}

// Alle oppføringer med forfatter - brukes av API-et slik at UI-en kan fargelegge Claude sine.
export async function getTenantForecastCommentAuthors(): Promise<Record<string, "claude" | "morten">> {
  const stored = await hgetallJSON<TenantForecastComment>(HASH_KEY);
  const result: Record<string, "claude" | "morten"> = {};
  for (const entry of Object.values(stored)) {
    if (entry.kommentar) result[normalizeKey(entry.navn)] = entry.forfatter === "claude" ? "claude" : "morten";
  }
  return result;
}

// v76 (2026-09-25, revisjonsrunde 2): getTenantForecastComments()/-Authors() over er UENDRET og
// brukes fortsatt server-side i lib/tenantForecastTable.ts, som kobler kommentarer inn på EKTE
// navn FØR sin egen snapshot-anonymisering kjører - de må derfor forbli rå.
// app/api/income-forecast/tenant-comments sin GET derimot sender kartet DIREKTE til klienten
// (også /dele-brukere) uten noen mellomliggende anonymisering - dette var uoppdaget frem til nå.
// Denne varianten anonymiserer NAVNET i nøkkelen (kommentarteksten selv er fortsatt fritekst og
// anonymiseres ikke - kjent, dokumentert restrisiko, se TENANT_REGLER.md).
export async function getTenantForecastCommentsForApi(): Promise<{
  kommentarer: Record<string, string>;
  forfattere: Record<string, "claude" | "morten">;
  // v77 (2026-09-26): se getTenantForecastCommentAutoFlags() - samme "auto"-skille, sendt med her
  // slik at klienten ikke trenger et fjerde separat API-kall for samme kommentar-datasett.
  auto: Record<string, boolean>;
}> {
  const stored = await hgetallJSON<TenantForecastComment>(HASH_KEY);
  const erProd = process.env.NODE_ENV === "production";
  const kommentarer: Record<string, string> = {};
  const forfattere: Record<string, "claude" | "morten"> = {};
  const auto: Record<string, boolean> = {};
  for (const entry of Object.values(stored)) {
    if (!entry.kommentar) continue;
    const key = normalizeKey(erProd ? anonymizeIfPerson(entry.navn) : entry.navn);
    kommentarer[key] = entry.kommentar;
    forfattere[key] = entry.forfatter === "claude" ? "claude" : "morten";
    auto[key] = entry.auto === true;
  }
  return { kommentarer, forfattere, auto };
}

export async function setTenantForecastComment(navn: string, kommentar: string): Promise<TenantForecastComment> {
  const trimmedNavn = navn.trim();
  if (!trimmedNavn) throw new Error("Mangler leietakernavn");
  // Lagres fra UI-en = Morten sin. Ingen forfatter-felt betyr Morten; en eksisterende Claude-
  // kommentar som Morten redigerer blir dermed hans, som er riktig.
  const entry: TenantForecastComment = {
    navn: trimmedNavn,
    kommentar: kommentar.trim(),
    sistOppdatert: new Date().toISOString().slice(0, 10),
  };
  await hsetJSON(HASH_KEY, normalizeKey(trimmedNavn), entry);
  return entry;
}
