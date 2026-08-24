// Seeder Redis-hashen for leietaker-signaler (sannsynlighet for reforhandling/utleie),
// bygget 2026-08-24. IDEMPOTENT: skriver KUN felt som ikke finnes fra før - kjør denne på
// nytt så mye du vil uten å overskrive Mortens egne manuelle justeringer (gjort via UI,
// PATCH /api/income-forecast/tenant-signals).
//
// Kilder, i prioritert rekkefølge pr leieforhold (kontraktsnokkel):
//  1. kontraktsutlop-2026-snapshotet sitt eget "reforhandlet"-flagg -> 90 %.
//  2. Salesforce Prosjekt__c (Reforhandling for leieforhold, Ledig_lokale for ledige
//     lokaler) - match på leietakernavn (reforhandling) eller egen SF-post (utleie).
//     Rådata i scripts/refresh-data/sf-prosjekt-reforhandling-ledig-lokale-raw.json
//     (gitignored - hentet via Salesforce SOQL 2026-08-24, se
//     project_income-forecast-fazile-remaining-tenants-2026-08-24.md for spørringen).
//     Seedes med 40 % + advarsel om SF-dataen er >12 mnd gammel (LastModifiedDate) - de
//     fleste ER det, se "sf-prosjekt-data-foreldet"-sjekken i lib/incomeForecast.local.ts.
//  3. Resten: INGEN seed - Morten fyller inn selv via UI eller etter research-runden.
//
// Kjør: node scripts/build-tenant-signals.js

const fs = require("fs");
const path = require("path");
const { loadEnvLocal } = require("./lib/refresh-helpers");

const SF_RAW_FILE = path.join(__dirname, "refresh-data", "sf-prosjekt-reforhandling-ledig-lokale-raw.json");
const REDIS_HASH_KEY = "jobb:inntektsprognose-signaler";
const STALE_MONTHS = 12;

function monthsAgo(dateStr) {
  const then = new Date(`${dateStr}T00:00:00Z`);
  const now = new Date(`2026-08-24T00:00:00Z`); // "i dag" i denne sesjonen - se ScheduleWakeup/systemklokke-begrensning i andre kontekster
  return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
}

async function readSnapshot(redis, hashKey) {
  const raw = await redis.hget(hashKey, "snapshot");
  return raw ? JSON.parse(raw) : null;
}

async function main() {
  loadEnvLocal();
  if (!process.env.REDIS_URL) {
    console.log("REDIS_URL ikke satt - kan ikke seede (leietaker-signaler krever Redis).");
    return;
  }
  const Redis = require(path.join(__dirname, "..", "node_modules", "ioredis"));
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });

  const sf = JSON.parse(fs.readFileSync(SF_RAW_FILE, "utf8"));
  const contractSnap = await readSnapshot(redis, "jobb:inntektsprognose-kontraktsutlop-2026");
  const existing = await redis.hgetall(REDIS_HASH_KEY);

  let seededReforhandling = 0;
  let seededUtleie = 0;
  let skippedExisting = 0;

  if (contractSnap) {
    const sfReforhandlingByLeietaker = new Map(
      sf.records.filter((r) => r.type === "Reforhandling" && r.leietaker).map((r) => [r.leietaker.toLowerCase(), r]),
    );
    for (const c of contractSnap.contracts) {
      const id = c.kontraktsnokkel;
      if (existing[id]) {
        skippedExisting++;
        continue;
      }
      let signal = null;
      if (c.status === "reforhandlet") {
        signal = {
          id,
          type: "reforhandling",
          navn: c.leietaker,
          bygg: c.bygg,
          sannsynlighetProsent: 90,
          notat: "Allerede reforhandlet i Fazile (ny kontrakt inngått).",
          kilde: "Fazile reforhandlet-flagg",
          sistOppdatert: sf.hentetDato,
        };
      } else {
        const sfHit = sfReforhandlingByLeietaker.get(c.leietaker.toLowerCase());
        if (sfHit) {
          const alder = monthsAgo(sfHit.lastModified);
          signal = {
            id,
            type: "reforhandling",
            navn: c.leietaker,
            bygg: c.bygg,
            sannsynlighetProsent: 40,
            notat:
              alder > STALE_MONTHS
                ? `SF-prosjekt ${sfHit.id} sist oppdatert ${sfHit.lastModified} (${alder} mnd siden) - kan være foreldet, sjekk manuelt.`
                : `SF-prosjekt ${sfHit.id} sist oppdatert ${sfHit.lastModified}.`,
            kilde: `SF Prosjekt ${sfHit.id}`,
            sistOppdatert: sf.hentetDato,
          };
        }
      }
      if (signal) {
        await redis.hset(REDIS_HASH_KEY, id, JSON.stringify(signal));
        seededReforhandling++;
      }
    }
  } else {
    console.log("Fant ikke kontraktsutlop-2026-snapshotet i Redis - hopper over reforhandling-seeding.");
  }

  for (const r of sf.records.filter((r) => r.type === "Ledig_lokale")) {
    if (existing[r.id]) {
      skippedExisting++;
      continue;
    }
    const alder = monthsAgo(r.lastModified);
    const signal = {
      id: r.id,
      type: "utleie",
      navn: `Ledig lokale-prosjekt (${r.bygg})`,
      bygg: r.bygg,
      sannsynlighetProsent: 40,
      notat:
        alder > STALE_MONTHS
          ? `SF-prosjekt ${r.id} sist oppdatert ${r.lastModified} (${alder} mnd siden) - kan være foreldet, sjekk manuelt.`
          : `SF-prosjekt ${r.id} sist oppdatert ${r.lastModified}.`,
      kilde: `SF Prosjekt ${r.id}`,
      sistOppdatert: sf.hentetDato,
    };
    await redis.hset(REDIS_HASH_KEY, r.id, JSON.stringify(signal));
    seededUtleie++;
  }

  console.log(`Seedet ${seededReforhandling} reforhandling-signaler, ${seededUtleie} utleie-signaler.`);
  console.log(`Hoppet over ${skippedExisting} som allerede fantes (ikke overskrevet - kan være manuelt justert av Morten).`);
  redis.disconnect();
}

main();
