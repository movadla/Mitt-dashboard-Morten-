// Delt hjelpefunksjoner for scripts/build-*.js - konsoliderer det som tidligere var
// kopiert (loadEnvLocal, Redis-push) inn i hver enkelt build-script, og legger til en
// verifyTotal()-sjekk som IKKE fantes tidligere (den ville fanget opp Mustad Eiendom AS-
// budsjett-transkriberingsfeilen 2026-08-24 automatisk, i stedet for ved tilfeldig
// oppmerksomhet under manuell gjennomgang). Se lib/data/ownership-shares.json for den
// delte eierandel-tabellen (samme begrunnelse: unngå at hvert script hardkoder sin egen,
// lett-å-glemme-å-oppdatere kopi).

const fs = require("fs");
const path = require("path");

const ENV_LOCAL = path.join(__dirname, "..", "..", ".env.local");
const OWNERSHIP_SHARES_FILE = path.join(__dirname, "..", "..", "lib", "data", "ownership-shares.json");
const BUILDING_REGISTRY_FILE = path.join(__dirname, "..", "..", "lib", "data", "building-registry.json");

function loadEnvLocal() {
  if (!fs.existsSync(ENV_LOCAL)) return;
  for (const line of fs.readFileSync(ENV_LOCAL, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

function loadOwnershipShares() {
  return JSON.parse(fs.readFileSync(OWNERSHIP_SHARES_FILE, "utf8"));
}

// Matcher på substreng (case-insensitive), samme regel som lib/ownershipShares.ts sin
// andelForBygg() - hold disse to i sync hvis matching-logikken endres.
function andelForBygg(byggNavn, shares) {
  const norm = byggNavn.toLowerCase();
  const match = shares.buildings.find((r) => norm.includes(r.bygg.toLowerCase()));
  return match ? match.andel : 1;
}

// Selskaps-nivå eierandel (eksakt match på selskapsnavn) - brukes FØR andelForBygg der
// selskapet er kjent, siden en generisk bygg-etikett som "Adm felles" kan tilhøre flere
// selskaper med ulik eierandel. Se "notat"-feltet i lib/data/ownership-shares.json.
function andelForSelskap(selskapNavn, shares) {
  const match = shares.selskaper.find((r) => r.selskap.toLowerCase() === selskapNavn.toLowerCase());
  return match ? match.andel : null;
}

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// "Kjerne-navn" uten selskapsform/tegnsetting - fallback når eksakt normalisert navn ikke
// matcher (f.eks. et leietakernavn skrevet med "A/S" i Fazile mot "AS" i NXT). Delt mellom
// build-remaining-summary.js og build-omsetningsavregning.js - hold i sync hvis endret.
function coreName(name) {
  return normalizeName(name)
    .replace(/[.,\-'’´`]/g, " ")
    .replace(/\b(as|asa|da|ans|ba|nuf|enk|sa|ks|a\/s)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// v55 (2026-09-18, Morten: fire navngitte konsern skal vises som én leietaker hver): konsern
// med flere juridiske enheter vises som ÉN leietaker overalt i
// Inntektsprognosen (leietakertabell, budsjett, kontraktsutløp, omsetningsavregning, signaler).
// Gruppene ligger i en gitignored fil (leietakernavn, jf. ANONYMISERING.md):
//   { "<visningsnavn>": ["<medlemsnavn slik det står i Fazile/NXT/Excel>", ...] }
// NXT-/Fazile-matching skjer fortsatt pr. juridisk enhet (kundenummer og kontrakt-id) -
// sammenslåingen gjøres på leietaker-nivå i build-remaining-summary.js, og de andre scriptene
// slår opp via konsernNavn() så navnene treffer. Et navn som ikke er med i noen gruppe
// returneres uendret, så funksjonen er trygg å kalle på alle navn.
const KONSERN_GRUPPER_FILE = path.join(__dirname, "..", "refresh-data", "_private-konsern-grupper.json");
let konsernIndeks = null; // normalisert medlemsnavn -> visningsnavn (lastes én gang pr. prosess)
let konsernGrupperCache = null; // visningsnavn -> [medlemsnavn]
function loadKonsernGrupper() {
  if (konsernIndeks) return konsernIndeks;
  konsernIndeks = new Map();
  konsernGrupperCache = {};
  if (!fs.existsSync(KONSERN_GRUPPER_FILE)) return konsernIndeks;
  const grupper = JSON.parse(fs.readFileSync(KONSERN_GRUPPER_FILE, "utf8"));
  for (const [visningsnavn, medlemmer] of Object.entries(grupper)) {
    if (visningsnavn.startsWith("_") || !Array.isArray(medlemmer)) continue;
    konsernGrupperCache[visningsnavn] = medlemmer;
    for (const m of medlemmer) konsernIndeks.set(normalizeName(m), visningsnavn);
  }
  return konsernIndeks;
}
function konsernNavn(name) {
  if (!name) return name;
  return loadKonsernGrupper().get(normalizeName(name)) || name;
}
// Alle grupper (visningsnavn -> medlemsnavn) - brukt til f.eks. å flytte manuelle kommentarer
// fra de gamle enhetsnavnene over på konsernraden.
function konsernGrupper() {
  loadKonsernGrupper();
  return konsernGrupperCache;
}

function loadBuildingRegistry() {
  if (!fs.existsSync(BUILDING_REGISTRY_FILE)) return null;
  return JSON.parse(fs.readFileSync(BUILDING_REGISTRY_FILE, "utf8"));
}

// Kaster hvis computed avviker fra independent med mer enn toleransePct (default 0,5%).
// Kall dette FØR Redis-push i alle build-scripts som beregner en total fra rådata -
// bruk et UAVHENGIG kontrollsum-uttrekk som independent (f.eks. et separat "totalt"-felt
// fra samme API-respons, ikke bare den samme summeringen regnet på nytt).
function verifyTotal(label, computed, independent, toleransePct = 0.5) {
  if (!Number.isFinite(independent) || independent === 0) return;
  const avvikPct = (Math.abs(computed - independent) / Math.abs(independent)) * 100;
  if (avvikPct > toleransePct) {
    throw new Error(
      `KONTROLLSUM-AVVIK for "${label}": beregnet=${computed.toFixed(2)}, uavhengig kontrollsum=${independent.toFixed(2)} ` +
        `(${avvikPct.toFixed(2)}% avvik, toleranse ${toleransePct}%). Sjekk rådata/transkribering før du fortsetter.`,
    );
  }
}

// Leser et allerede lagret snapshot fra Redis (motstykket til pushToRedis) - brukt når et
// build-script skal gjenbruke resultatet av et ANNET script i stedet for å duplisere
// beregningen (f.eks. omsetningsavregning som gjenbruker gjenstår-per-leietaker-snapshotet).
function getFromRedis(hashKey, field) {
  loadEnvLocal();
  if (!process.env.REDIS_URL) {
    console.log("REDIS_URL ikke satt - kan ikke lese fra Redis.");
    return Promise.resolve(null);
  }
  const Redis = require(path.join(__dirname, "..", "..", "node_modules", "ioredis"));
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  return redis
    .hget(hashKey, field)
    .then((raw) => {
      redis.disconnect();
      return raw ? JSON.parse(raw) : null;
    })
    .catch((err) => {
      console.error("Feil ved lesing fra Redis:", err);
      redis.disconnect();
      return null;
    });
}

// v73 (2026-09-24, controller-notat punkt 11, Morten valgte "egen, datert Redis-nøkkel" fremfor
// Vercel Blob - sistnevnte krever access:"public" (URL-basert, ikke ekte tilgangskontroll), og
// ville lagt reelle leietakernavn/beløp et sted utenfor den allerede-stolte Redis-tilgangen).
// IKKE ekte katastrofe-sikring (samme Redis-instans - ryker HELE instansen, ryker backupen med),
// men fanger opp den mer sannsynlige feilen: en fremtidig kjøring som skriver et FEILAKTIG/tomt
// snapshot over det gode - da finnes de siste BACKUP_DAGER dagenes versjoner å hente tilbake fra.
// Egen hash pr. kildehash (`${hashKey}:backup`), ett felt pr. dato - `hkeys`/`hget` for å liste/
// hente en tidligere dag manuelt ved behov (se TENANT_REGLER.md).
const BACKUP_DAGER = 30;
async function lagreBackup(redis, hashKey, snapshotJson) {
  try {
    const backupKey = `${hashKey}:backup`;
    const dato = new Date().toISOString().slice(0, 10);
    await redis.hset(backupKey, dato, snapshotJson);
    const alleDatoer = await redis.hkeys(backupKey);
    const utdaterte = alleDatoer.sort().slice(0, Math.max(0, alleDatoer.length - BACKUP_DAGER));
    if (utdaterte.length > 0) await redis.hdel(backupKey, ...utdaterte);
  } catch (err) {
    // Backup skal ALDRI blokkere/kræsje selve pipeline-kjøringen - kun et varsel.
    console.error(`ADVARSEL: klarte ikke å lagre backup for ${hashKey}:`, err.message || err);
  }
}

function pushToRedis(hashKey, field, snapshot, fallbackFileName) {
  loadEnvLocal();
  if (!process.env.REDIS_URL) {
    console.log("REDIS_URL ikke satt - hopper over Redis-push.");
    if (fallbackFileName) {
      fs.writeFileSync(path.join(__dirname, "..", "refresh-data", fallbackFileName), JSON.stringify(snapshot, null, 2));
    }
    return Promise.resolve();
  }
  const Redis = require(path.join(__dirname, "..", "..", "node_modules", "ioredis"));
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  const snapshotJson = JSON.stringify(snapshot);
  return redis
    .hset(hashKey, field, snapshotJson)
    .then(async () => {
      console.log(`Lagret i Redis under ${hashKey} / ${field}`);
      await lagreBackup(redis, hashKey, snapshotJson);
      redis.disconnect();
    })
    .catch((err) => {
      console.error("Feil ved lagring i Redis:", err);
      redis.disconnect();
      process.exit(1);
    });
}

module.exports = {
  loadEnvLocal,
  loadOwnershipShares,
  andelForBygg,
  andelForSelskap,
  loadBuildingRegistry,
  verifyTotal,
  pushToRedis,
  getFromRedis,
  normalizeName,
  coreName,
  konsernNavn,
  konsernGrupper,
};
