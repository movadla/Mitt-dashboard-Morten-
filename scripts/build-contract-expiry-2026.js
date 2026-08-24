// Bygger Redis-snapshotet for "Kontrakter som utløper i 2026" (ny fane i
// Inntektsprognose, bygget 2026-08-24 etter Morten sitt spørsmål: "hvor mye
// utgjør kontrakter som løper ut ila. 2026 hvis de fornyes?").
//
// Kilde: Fazile MCP-verktøyet mcp__claude_ai_Fazile_intern__kontraktsutlop.
// Hent på nytt slik (uten scope = hele porteføljen, ingen øvre grense når
// inkluder_utlopte=true dekker hele 2026):
//   fra_dato: "2026-01-01", maneder_frem: 12, inkluder_utlopte: true, max_rader: 5000
// Lagre RAW JSON-resultatet (objektet med "rows"-arrayet) som
// scripts/refresh-data/kontraktsutlop-raw-full.json - IKKE forhåndsfiltrer, dette
// scriptet gjør all filtrering/gruppering selv (repeterbart, se ANONYMISERING.md
// om hvorfor løse dump-filer i refresh-data/ er gitignored).
//
// Metodikk:
// - Filtrerer til linjer med linje_slutt i kalenderåret 2026 OG total_arsleie > 0
//   (0-kr-linjer er ofte felleskostnad-detaljlinjer uten egen verdi - støy).
// - Grupperer til KONTRAKT-nivå (leietaker + kontraktsnokkel), ikke linjenivå - én
//   kontrakt kan ha flere linjer (husleie, FK, parkering) som utløper samme dag.
// - "reforhandlet" (fra verktøyet, via contract.renewed_contract_id): kontrakten er
//   allerede sikret med en ny, aktiv/signert etterfølger - IKKE reell eksponering.
// - "reell eksponering" = åpne (ikke reforhandlede) kontrakter - dette er beløpet
//   som faktisk står på spill hvis de IKKE fornyes, altså komplementet til
//   spørsmålet "hvor mye utgjør de HVIS de fornyes" (som er totalsummen, se under).
//
// "Ekstra i 2026 hvis fornyet" (Morten, 2026-08-24): REMAINING/prognosetotalen
// (685,2 mill kr) teller Fazile sin arsleie_nok KUN frem til kontraktens faktiske
// sluttdato i 2026 - INGEN antagelse om fornyelse. For en ÅPEN (ikke reforhandlet)
// linje er derfor dagene fra dagen ETTER linje_slutt til 2026-12-31 ikke med i
// prognosen i det hele tatt. ekstraI2026 = (total_arsleie/365) × gjenværende dager
// - dette er beløpet som IKKE er i de 685,2 mill kr, og som blir reell ekstra
// 2026-inntekt HVIS (og bare hvis) leietaker faktisk fornyer til samme sats.
// Reforhandlede linjer får ekstraI2026=0 - den nye kontrakten er allerede en egen
// linje i Fazile og dermed allerede talt med i prognosetotalen.
//
// EIERANDEL (rettet 2026-08-24): kontraktsutlop-verktøyet auto-halverer IKKE for
// Strandveien 4-8/10/Lilleakerveien 20-22, i motsetning til rent_roll/leietakerliste
// (bekreftet: `eierandel`-feltet i rådata er 1 for ALLE rader). Fant 4 linjer (2
// leietakere på Strandveien 4-8) som IKKE var halvert - overstatte totalArsleie/
// reell eksponering med ca. 272 663 kr og ekstraI2026 med ca. 48 256 kr før denne fiksen.
// Halveres nå PER LINJE via den delte lib/data/ownership-shares.json (samme kilde som
// build-nxt-budget.js), FØR gruppering til kontrakt-nivå.
//
// Kjør: node scripts/build-contract-expiry-2026.js

const fs = require("fs");
const path = require("path");
const { loadEnvLocal, pushToRedis, loadOwnershipShares, andelForBygg } = require("./lib/refresh-helpers");

const RAW_FILE = path.join(__dirname, "refresh-data", "kontraktsutlop-raw-full.json");
const REDIS_HASH_KEY = "jobb:inntektsprognose-kontraktsutlop-2026";
const REDIS_FIELD = "snapshot";
const AR = 2026;
const AR_SLUTT = new Date(`${AR}-12-31T00:00:00Z`);

function ekstraI2026ForLinje(linjeSlutt, totalArsleie, reforhandlet) {
  if (reforhandlet) return 0;
  const slutt = new Date(`${linjeSlutt}T00:00:00Z`);
  const dagerEtter = Math.max(0, Math.round((AR_SLUTT - slutt) / 86400000));
  return (totalArsleie / 365) * dagerEtter;
}

function main() {
  loadEnvLocal();
  const raw = JSON.parse(fs.readFileSync(RAW_FILE, "utf8"));
  const shares = loadOwnershipShares();
  const rows = (raw.rows || []).filter(
    (r) => r.linje_slutt >= `${AR}-01-01` && r.linje_slutt <= `${AR}-12-31` && r.total_arsleie > 0,
  );

  let antallEierandelKorrigert = 0;
  const groups = new Map();
  for (const r of rows) {
    const andel = r.bygg ? andelForBygg(r.bygg, shares) : 1;
    if (andel !== 1) antallEierandelKorrigert++;
    const totalArsleie = r.total_arsleie * andel;

    const key = `${r.leietaker}||${r.kontraktsnokkel}`;
    if (!groups.has(key)) {
      groups.set(key, {
        leietaker: r.leietaker,
        kontraktsnokkel: r.kontraktsnokkel,
        byggSet: new Set(),
        totalArsleie: 0,
        minSlutt: r.linje_slutt,
        maxSlutt: r.linje_slutt,
        status: "apen",
        nyKontraktsnokkel: null,
        ekstraI2026: 0,
        lines: [],
      });
    }
    const g = groups.get(key);
    g.totalArsleie += totalArsleie;
    if (r.bygg && r.bygg !== "(ukjent bygg)") g.byggSet.add(r.bygg);
    if (r.linje_slutt < g.minSlutt) g.minSlutt = r.linje_slutt;
    if (r.linje_slutt > g.maxSlutt) g.maxSlutt = r.linje_slutt;
    if (r.reforhandlet) {
      g.status = "reforhandlet";
      g.nyKontraktsnokkel = r.ny_kontraktsnokkel;
    }
    const ekstraLinje = ekstraI2026ForLinje(r.linje_slutt, totalArsleie, r.reforhandlet);
    g.ekstraI2026 += ekstraLinje;
    g.lines.push({
      linjenokkel: r.linjenokkel,
      linjeBeskrivelse: r.linje_beskrivelse,
      arealtype: r.arealtype,
      linjeSlutt: r.linje_slutt,
      totalArsleie,
      ekstraI2026: Math.round(ekstraLinje * 100) / 100,
    });
  }
  if (antallEierandelKorrigert > 0) {
    console.log(`Eierandel-korrigert: ${antallEierandelKorrigert} linjer halvert (Strandveien 4-8/10, Lilleakerveien 20/22).`);
  }

  const contracts = [...groups.values()]
    .map((g) => ({
      leietaker: g.leietaker,
      kontraktsnokkel: g.kontraktsnokkel,
      bygg: [...g.byggSet].join(", ") || "(ukjent bygg)",
      totalArsleie: Math.round(g.totalArsleie * 100) / 100,
      minSlutt: g.minSlutt,
      maxSlutt: g.maxSlutt,
      status: g.status,
      nyKontraktsnokkel: g.nyKontraktsnokkel,
      ekstraI2026: Math.round(g.ekstraI2026 * 100) / 100,
      lines: g.lines,
    }))
    .sort((a, b) => b.totalArsleie - a.totalArsleie);

  const totalArsleie = contracts.reduce((sum, c) => sum + c.totalArsleie, 0);
  const reforhandlet = contracts.filter((c) => c.status === "reforhandlet");
  const apen = contracts.filter((c) => c.status === "apen");
  const reforhandletArsleie = reforhandlet.reduce((sum, c) => sum + c.totalArsleie, 0);
  const reellEksponeringArsleie = apen.reduce((sum, c) => sum + c.totalArsleie, 0);
  const totalEkstraI2026 = contracts.reduce((sum, c) => sum + c.ekstraI2026, 0);

  // Aggregat pr. leietaker av "ekstra i 2026 hvis fornyet" - Morten ba eksplisitt om
  // dette listet opp pr leietaker (én leietaker kan ha flere kontrakter/bygg som
  // hver bidrar til ekstraI2026).
  const perLeietakerMap = new Map();
  for (const c of contracts) {
    if (c.ekstraI2026 <= 0) continue;
    if (!perLeietakerMap.has(c.leietaker)) perLeietakerMap.set(c.leietaker, { leietaker: c.leietaker, ekstraI2026: 0, kontrakter: [] });
    const p = perLeietakerMap.get(c.leietaker);
    p.ekstraI2026 += c.ekstraI2026;
    p.kontrakter.push({ kontraktsnokkel: c.kontraktsnokkel, bygg: c.bygg, maxSlutt: c.maxSlutt, ekstraI2026: c.ekstraI2026 });
  }
  const ekstraI2026PerLeietaker = [...perLeietakerMap.values()]
    .map((p) => ({ ...p, ekstraI2026: Math.round(p.ekstraI2026 * 100) / 100 }))
    .sort((a, b) => b.ekstraI2026 - a.ekstraI2026);

  const snapshot = {
    sistOppdatert: new Date().toISOString().slice(0, 10),
    ar: AR,
    totalArsleie: Math.round(totalArsleie * 100) / 100,
    reforhandletArsleie: Math.round(reforhandletArsleie * 100) / 100,
    reellEksponeringArsleie: Math.round(reellEksponeringArsleie * 100) / 100,
    totalEkstraI2026: Math.round(totalEkstraI2026 * 100) / 100,
    antallKontrakter: contracts.length,
    antallReforhandlet: reforhandlet.length,
    antallApen: apen.length,
    contracts,
    ekstraI2026PerLeietaker,
  };

  console.log(`Kontrakter som utløper i ${AR}: ${snapshot.antallKontrakter}`);
  console.log(`  Total årsleie: ${snapshot.totalArsleie}`);
  console.log(`  Reforhandlet (sikret): ${snapshot.antallReforhandlet} stk, ${snapshot.reforhandletArsleie} kr`);
  console.log(`  Åpen (reell eksponering): ${snapshot.antallApen} stk, ${snapshot.reellEksponeringArsleie} kr`);
  console.log(`  Ekstra i 2026 hvis alle åpne fornyes: ${snapshot.totalEkstraI2026} (${ekstraI2026PerLeietaker.length} leietakere)`);

  return pushToRedis(REDIS_HASH_KEY, REDIS_FIELD, snapshot, "kontraktsutlop-2026-snapshot.json");
}

main();
