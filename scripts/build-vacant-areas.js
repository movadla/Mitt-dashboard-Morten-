// Bygger Redis-snapshotet for "Ledige arealer" - ny fane i Inntektsprognose, bygget
// 2026-08-24 etter Morten sitt spørsmål om en oversikt over ledige arealer pr bygg med
// kvm, delt på arealtype (Kontor/Lager/Butikk osv). Tenkt som fremtidig datakilde for
// "Potensiell inntekt: ledige lokaler"-boksen (i dag et manuelt anslag, se
// lib/incomeForecastPotential.ts).
//
// Kilde: Fazile MCP-verktøyet mcp__claude_ai_Fazile_intern__arealoversikt, kalt UTEN
// seksjon (hele porteføljen i ett kall - færre enn 5000 rader med status=Ledig, ingen
// trunkering/warnings) og status=["Ledig"]:
//   arealoversikt({status: ["Ledig"], max_rader: 5000})
// MERK: samme kall UTEN status-filter trunkeres ved 5000 rader (porteføljen har flere
// arealer enn det) - IKKE bruk det for et pålitelig totalt-portefølje-tall, kun for
// "Ledig"-delmengden som er bekreftet komplett (1333 rader, ingen advarsel/cap truffet).
//
// Lagre rå-resultatet (hele JSON-objektet med "rows") som
// scripts/refresh-data/arealoversikt-ledig-raw.json - ingen persondata (kun
// bygg/etasje/arealtype/kvm/leietaker-navn på UTLEIDE arealer, men vi bruker kun de
// LEDIGE radene her der leietaker alltid er null).
//
// Kjør: node scripts/build-vacant-areas.js

const fs = require("fs");
const path = require("path");
const { loadEnvLocal, pushToRedis } = require("./lib/refresh-helpers");

const RAW_FILE = path.join(__dirname, "refresh-data", "arealoversikt-ledig-raw.json");
const REDIS_HASH_KEY = "jobb:inntektsprognose-ledige-arealer";
const REDIS_FIELD = "snapshot";

function main() {
  loadEnvLocal();
  const raw = JSON.parse(fs.readFileSync(RAW_FILE, "utf8"));
  if (raw.warnings && raw.warnings.length > 0) {
    console.log("ADVARSEL fra Fazile-verktøyet (rådata kan være trunkert):", raw.warnings);
  }

  const byggMap = new Map();
  const arealtypeTotals = new Map();

  for (const r of raw.rows) {
    if (!byggMap.has(r.bygg)) byggMap.set(r.bygg, { bygg: r.bygg, totalKvm: 0, antall: 0, perArealtype: new Map() });
    const b = byggMap.get(r.bygg);
    b.totalKvm += r.eksklusiv_kvm;
    b.antall += 1;
    b.perArealtype.set(r.arealtype, (b.perArealtype.get(r.arealtype) || 0) + r.eksklusiv_kvm);
    arealtypeTotals.set(r.arealtype, (arealtypeTotals.get(r.arealtype) || 0) + r.eksklusiv_kvm);
  }

  const bygg = [...byggMap.values()]
    .map((b) => ({
      bygg: b.bygg,
      totalKvm: Math.round(b.totalKvm * 10) / 10,
      antall: b.antall,
      perArealtype: Object.fromEntries(
        [...b.perArealtype.entries()].map(([k, v]) => [k, Math.round(v * 10) / 10]),
      ),
    }))
    .sort((a, b2) => b2.totalKvm - a.totalKvm);

  const totalKvm = Math.round(raw.rows.reduce((sum, r) => sum + r.eksklusiv_kvm, 0) * 10) / 10;

  const snapshot = {
    sistOppdatert: "2026-08-24",
    totalLedigKvm: totalKvm,
    antallArealer: raw.rows.length,
    antallBygg: bygg.length,
    perArealtype: Object.fromEntries(
      [...arealtypeTotals.entries()].sort((a, b2) => b2[1] - a[1]).map(([k, v]) => [k, Math.round(v * 10) / 10]),
    ),
    bygg,
  };

  console.log(`Ledige arealer: ${snapshot.totalLedigKvm} kvm eksklusiv, ${snapshot.antallArealer} arealer, ${snapshot.antallBygg} bygg`);

  return pushToRedis(REDIS_HASH_KEY, REDIS_FIELD, snapshot, "vacant-areas-snapshot.json");
}

main();
