// Setter Mortens vurdering av ett leieforhold i Inntektsprognosen (v37, 2026-09-11).
//
// Bakgrunn: gjennomgangen av "Leieforhold til gjennomgang" gjøres leietaker for leietaker, og hver
// avgjørelse er to ting: et MERKE (avklart/usikker, med eller uten skjuling fra arbeidslista) og
// ofte en FORNYELSESSANNSYNLIGHET på leietakerens åpne utløpskontrakter. Dette scriptet gjør begge
// i ett, slik at de ikke kommer ut av takt - en "antar fornyelse"-beslutning som bare blir et
// merke, uten at sannsynligheten settes, endrer ingenting i tallene.
//
// Begge deler ligger i egne Redis-hasher som byggeskriptene ALDRI rører, så vurderingene overlever
// `npm run refresh:income-forecast`. De er med i /api/income-forecast/backup.
//
// Bruk:
//   node scripts/sett-vurdering.js "Parkly AS" avklart 100 "Forlenger. Morten 2026-09-11."
//   node scripts/sett-vurdering.js "Telia Rooftops Norway AS" usikker - "Ukjent hvorfor ikke fakturert." --vis
//
// Argumenter: <leietaker> <avklart|usikker|mangler-fakturering|ma-sjekkes> <sannsynlighet 0-100 eller "-"> <notat> [--vis]
//   "-" på sannsynlighet = ikke rør signalene (kun merke).
//   --vis = la raden bli stående i arbeidslista (default er å skjule den).
const fs = require("fs");
const path = require("path");

const VURDERING_HASH = "jobb:inntektsprognose-vurderinger";
const SIGNAL_HASH = "jobb:inntektsprognose-signaler";
const UTLOP_HASH = "jobb:inntektsprognose-kontraktsutlop-2026";

function lastEnv() {
  const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  for (const linje of env.split(/\r?\n/)) {
    const m = linje.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const [leietaker, status, sannsynlighetArg, notat] = process.argv.slice(2);
  const vis = process.argv.includes("--vis");
  if (!leietaker || !status || !sannsynlighetArg) {
    console.error('Bruk: node scripts/sett-vurdering.js "<leietaker>" <avklart|usikker|mangler-fakturering|ma-sjekkes> <0-100|-> "<notat>" [--vis]');
    process.exit(1);
  }
  if (!["avklart", "usikker", "mangler-fakturering", "ma-sjekkes"].includes(status)) throw new Error(`Ukjent status: ${status}`);

  lastEnv();
  const Redis = require(path.join(__dirname, "..", "node_modules", "ioredis"));
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  const idag = new Date().toISOString().slice(0, 10);

  // 1) Sannsynlighet på ALLE åpne utløpskontrakter for leietakeren. Treffer den ingen, sies det
  // eksplisitt - da har beslutningen ingen beløpseffekt, og det er verdt å vite.
  if (sannsynlighetArg !== "-") {
    const p = Number(sannsynlighetArg);
    if (!Number.isFinite(p) || p < 0 || p > 100) throw new Error(`Ugyldig sannsynlighet: ${sannsynlighetArg}`);
    const utlop = JSON.parse((await redis.hget(UTLOP_HASH, "snapshot")) || '{"contracts":[]}');
    const mine = utlop.contracts.filter(
      (c) => c.status === "apen" && c.leietaker.trim().toLowerCase() === leietaker.trim().toLowerCase(),
    );
    if (mine.length === 0) {
      console.log(`Ingen åpen utløpskontrakt i 2026 for "${leietaker}" - ingen beløpseffekt av sannsynligheten.`);
    }
    for (const c of mine) {
      const eksisterende = await redis.hget(SIGNAL_HASH, c.kontraktsnokkel);
      const forrige = eksisterende ? JSON.parse(eksisterende).sannsynlighetProsent : null;
      const base = eksisterende
        ? JSON.parse(eksisterende)
        : { id: c.kontraktsnokkel, type: "reforhandling", navn: leietaker, bygg: c.bygg, kilde: "Morten (manuell vurdering)" };
      await redis.hset(
        SIGNAL_HASH,
        c.kontraktsnokkel,
        JSON.stringify({ ...base, sannsynlighetProsent: p, notat, sistOppdatert: idag }),
      );
      const ekstra = Math.round(c.ekstraI2026 * (p / 100)).toLocaleString("nb-NO");
      console.log(
        `Signal ${c.kontraktsnokkel} (${c.bygg}, utløper ${c.maxSlutt}): ${forrige ?? "default 100"} % -> ${p} %  [vektet ekstra: ${ekstra} kr]`,
      );
    }
  }

  // 2) Merket. bygg = "" betyr at det gjelder alle byggene til leietakeren.
  await redis.hset(
    VURDERING_HASH,
    `${leietaker.trim().toLowerCase()}||`,
    JSON.stringify({
      leietaker: leietaker.trim(),
      bygg: "",
      status,
      skjulFraGjennomgang: !vis,
      notat: notat || "",
      sistOppdatert: idag,
    }),
  );
  console.log(`Merke: ${leietaker} -> ${status}${vis ? " (blir stående i lista)" : " (skjult fra lista)"}`);

  const alle = await redis.hgetall(VURDERING_HASH);
  console.log(`Totalt ${Object.keys(alle).length} vurderinger registrert.`);
  redis.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
