// Diagnostikk: sjekker bygg-navn fra hver kilde mot lib/data/building-registry.json.
// Kjør etter HVER ny rådata-refresh (NXT-budsjett, ledige arealer, osv.) for å fange opp
// ukjente bygg-navn automatisk - dette scriptet ville flagget "Vollsveien 13G" med én gang
// i stedet for at det ble funnet ved en manuell, engangs kryssjekk 2026-08-24.
//
// Kjør: node scripts/check-building-registry.js

const fs = require("fs");
const path = require("path");
const { loadEnvLocal, loadBuildingRegistry } = require("./lib/refresh-helpers");

async function readSnapshot(hashKey) {
  if (!process.env.REDIS_URL) return null;
  const Redis = require(path.join(__dirname, "..", "node_modules", "ioredis"));
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  const raw = await redis.hget(hashKey, "snapshot");
  redis.disconnect();
  return raw ? JSON.parse(raw) : null;
}

function knownNames(registry) {
  const known = new Set();
  for (const n of registry.kanoniskeBygg) known.add(n.toLowerCase());
  for (const b of registry.buildings) {
    known.add(b.kanoniskNavn.toLowerCase());
    for (const a of b.alias) known.add(a.toLowerCase());
  }
  for (const b of registry.ikkeFysiskeBygg) known.add(b.navn.toLowerCase());
  for (const b of registry.uavklart) known.add(b.navn.toLowerCase());
  return known;
}

function checkSource(label, byggNavn, known, registry) {
  const unresolved = byggNavn.filter((b) => !known.has(b.toLowerCase()));
  console.log(`\n${label}: ${byggNavn.length} bygg-navn, ${unresolved.length} ikke i registeret`);
  for (const b of unresolved) {
    const alreadyFlagged = registry.uavklart.some((u) => u.navn.toLowerCase() === b.toLowerCase());
    console.log(`  - "${b}"${alreadyFlagged ? " (allerede flagget i uavklart[])" : " -- NY, IKKE FLAGGET FØR"}`);
  }
}

async function main() {
  loadEnvLocal();
  const registry = loadBuildingRegistry();
  if (!registry) {
    console.log("Fant ikke lib/data/building-registry.json");
    return;
  }
  const known = knownNames(registry);

  const budgetSnap = await readSnapshot("jobb:inntektsprognose-nxt-budsjett");
  if (budgetSnap) {
    checkSource("NXT-budsjett (Redis)", budgetSnap.perBygg.map((b) => b.bygg), known, registry);
  } else {
    console.log("Hopper over NXT-budsjett - ingen snapshot funnet i Redis.");
  }

  const vacantSnap = await readSnapshot("jobb:inntektsprognose-ledige-arealer");
  if (vacantSnap) {
    checkSource("Ledige arealer (Redis)", vacantSnap.bygg.map((b) => b.bygg), known, registry);
  } else {
    console.log("Hopper over ledige arealer - ingen snapshot funnet i Redis.");
  }

  console.log("\nMERK: kanoniske navn i registeret sjekkes ikke automatisk mot Fazile sin FAKTISKE bygg-liste her (krever MCP-tilgang, ikke tilgjengelig i et frittstående script) - kryssjekk manuelt ved neste leietakerliste-uttrekk.");
}

main();
