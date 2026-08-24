// Bygger og oppdaterer Redis-snapshotet for Inntektsprognose > "Gjenstår å fakturere per leietaker".
//
// Fazile-delen av datahentingen kan IKKE automatiseres i dette scriptet - den krever Claude sin
// interaktive MCP-tilkobling (rent_roll-verktøyet, se claude_ai_Fazile_intern). Når Morten ber om
// et nytt øyeblikksbilde:
//
// 1. Hent property-listen: fazile_graphql_query mot `properties` (first:100, filter removed_at
//    isNull) for å få full liste over eiendommer (endres sjelden - se scripts/refresh-data/
//    fazile-remaining-tenants/properties.json for forrige gang sin liste).
//
// 2. For HVER eiendom (55 stk sist gang, hold av tid - dette er en treg, sekvensiell runde):
//    kall rent_roll({ eiendom: "<navn>", max_linjer: 500 }) og lagre "rows" (IKKE "chart" -
//    den dupliserer rows unødvendig og sprenger svarstørrelsen for store eiendommer).
//    - aktiv_dato brukes IKKE eksplisitt (default = i dag) - vi vil ha kontraktslinjer som er
//      aktive NÅ, og beregner selv hvor mye som gjenstår av resten av året nedenfor.
//    - default inkluder_typer (alle linjetyper) brukes - "netto totalinntekt" er riktig for
//      "gjenstår å fakturere", ikke bare RENT.
//    - Hvis responsen blir for stor (skjer for eiendommer med >~30-40 linjer), blir den lagret
//      til fil automatisk av verktøyet - bruk Bash+node til å trekke ut kun `data.rows` derfra
//      i stedet for å lese hele filen inn i kontekst.
//
// 3. VIKTIG KJENT BUG: Fazile sitt rent_roll-verktøy halverer IKKE "Strandveien 4-8_E" korrekt
//    (eierandel vises som 1, ikke 0.5, trolig fordi property-navnet mangler det doble
//    mellomrommet ("Strandveien  4-8_E") som 50%-eierskapslisten i fazile_schema_guide bruker).
//    "Strandveien 10_E" og "Lilleakerveien 20-22_E" halveres KORREKT av verktøyet selv.
//    Dette scriptet korrigerer Strandveien 4-8 manuelt (STRANDVEIEN_4_8_MANUAL_HALVING under) -
//    sjekk om Fazile har fikset bugen før du kjører på nytt (søk etter "eierandel": 0.5 i rådata
//    for Strandveien 4-8 - hvis den nå viser 0.5 automatisk, FJERN denne manuelle korreksjonen).
//
// 4. Skriv resultatet til scripts/refresh-data/fazile-remaining-tenants/<eiendom-slug>.json som
//    en flat liste av rows (samme feltnavn som verktøyet returnerer: eiendom, seksjon, leietaker,
//    kontrakt_id, linje_id, linjetype, beskrivelse, arsleie_nok, start_dato, slutt_dato).
//
// 5. Oppdater scripts/refresh-data/fazile-remaining-tenants/meta.json:
//    { "dagensDato": "YYYY-MM-DD", "arSlutt": "YYYY-12-31" } - dagensDato brukes til å beregne
//    hvor mange dager som gjenstår av året per linje.
//
// 6. Kjør: node scripts/refresh-fazile-remaining-tenants.js

const fs = require("fs");
const path = require("path");
const Redis = require(path.join(__dirname, "..", "node_modules", "ioredis"));

const DATA_DIR = path.join(__dirname, "refresh-data", "fazile-remaining-tenants");
const ENV_LOCAL = path.join(__dirname, "..", ".env.local");
const REDIS_HASH_KEY = "jobb:inntektsprognose-gjenstar-leietakere";
const REDIS_FIELD = "snapshot";

// Se punkt 3 i header-kommentaren over.
const STRANDVEIEN_4_8_MANUAL_HALVING = "Strandveien 4-8_E";

function loadEnvLocal() {
  if (!fs.existsSync(ENV_LOCAL)) return;
  for (const line of fs.readFileSync(ENV_LOCAL, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function daysRemainingForLine(startDato, sluttDato, todayIso, yearEndIso) {
  const rangeStart = new Date(todayIso);
  rangeStart.setDate(rangeStart.getDate() + 1); // "resten av året" = fra i morgen
  const rangeEnd = new Date(yearEndIso);

  const lineStart = startDato ? new Date(startDato) : null;
  const lineEnd = sluttDato ? new Date(sluttDato) : null; // null = løper videre uten kjent sluttdato

  const effectiveStart = lineStart && lineStart > rangeStart ? lineStart : rangeStart;
  const effectiveEnd = lineEnd && lineEnd < rangeEnd ? lineEnd : rangeEnd;

  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.round((effectiveEnd - effectiveStart) / msPerDay) + 1;
  return days > 0 ? days : 0;
}

function main() {
  loadEnvLocal();

  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Fant ikke ${DATA_DIR}. Se toppen av dette scriptet for hvordan input-filene skal se ut.`);
    process.exit(1);
  }

  const meta = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "meta.json"), "utf8"));
  const daysInYear = (() => {
    const year = Number(meta.arSlutt.slice(0, 4));
    return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
  })();

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json") && f !== "meta.json" && f !== "properties.json");

  const tenants = new Map(); // normalisert navn -> { navn, lines: [] }
  let totalBelop = 0;
  let totalLinjer = 0;

  for (const file of files) {
    const rows = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
    for (const row of rows) {
      const days = daysRemainingForLine(row.start_dato, row.slutt_dato, meta.dagensDato, meta.arSlutt);
      if (days <= 0) continue;

      let gjenstaende = (row.arsleie_nok * days) / daysInYear;
      if (row.eiendom === STRANDVEIEN_4_8_MANUAL_HALVING) gjenstaende *= 0.5;
      gjenstaende = Math.round(gjenstaende * 100) / 100;
      if (gjenstaende === 0) continue;

      const key = normalizeName(row.leietaker);
      if (!tenants.has(key)) tenants.set(key, { navn: row.leietaker.trim(), lines: [] });
      tenants.get(key).lines.push({
        eiendom: row.eiendom,
        bygg: row.seksjon,
        linjetype: row.linjetype,
        beskrivelse: row.beskrivelse,
        gjenstaende,
      });
      totalBelop += gjenstaende;
      totalLinjer += 1;
    }
  }

  const tenantList = [...tenants.values()]
    .map((t) => ({
      navn: t.navn,
      totalBelop: Math.round(t.lines.reduce((s, l) => s + l.gjenstaende, 0) * 100) / 100,
      lines: t.lines.sort((a, b) => b.gjenstaende - a.gjenstaende),
    }))
    .sort((a, b) => b.totalBelop - a.totalBelop);

  const snapshot = {
    sistOppdatert: meta.dagensDato,
    ar: Number(meta.arSlutt.slice(0, 4)),
    periodeFra: (() => {
      const d = new Date(meta.dagensDato);
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    })(),
    periodeTil: meta.arSlutt,
    totalBelop: Math.round(totalBelop * 100) / 100,
    antallLeietakere: tenantList.length,
    tenants: tenantList,
  };

  const sumTenantTotals = tenantList.reduce((s, t) => s + t.totalBelop, 0);
  const diff = Math.abs(sumTenantTotals - snapshot.totalBelop);
  console.log(
    `Bygget snapshot: ${tenantList.length} leietakere, ${totalLinjer} linjer, totalt ${snapshot.totalBelop} kr (periode ${snapshot.periodeFra} - ${snapshot.periodeTil})`,
  );
  console.log(`Avstemming: sum leietaker-totaler = ${sumTenantTotals.toFixed(2)}, differanse = ${diff.toFixed(2)}`);

  if (!process.env.REDIS_URL) {
    console.log("REDIS_URL ikke satt - hopper over Redis-push.");
    fs.writeFileSync(path.join(DATA_DIR, "..", "fazile-remaining-tenants-snapshot.json"), JSON.stringify(snapshot, null, 2));
    return;
  }

  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  redis
    .hset(REDIS_HASH_KEY, REDIS_FIELD, JSON.stringify(snapshot))
    .then(() => {
      console.log(`Lagret i Redis under ${REDIS_HASH_KEY} / ${REDIS_FIELD}`);
      redis.disconnect();
    })
    .catch((err) => {
      console.error("Redis-feil:", err);
      process.exit(1);
    });
}

main();
