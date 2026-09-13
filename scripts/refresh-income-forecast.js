// v18 (2026-09-07, "sikre tallgrunnlaget"-gjennomgangen): orkestrerer ALLE åtte
// build-*.js-scriptene for Inntektsprognose-siden i riktig rekkefølge, med fail-fast - før dette
// fantes ingen samlende script, kun scattered dokumentasjon i hvert enkelt filhode om hva som må
// kjøres FØR det aktuelle scriptet (f.eks. "kjør build-remaining-summary.js først" i
// build-tenant-forecast-table.js). Reell risiko: kjør dem i feil rekkefølge, eller glem én etter
// en Fazile/NXT-oppdatering, og UI-en viser et snapshot som SER konsistent ut men er bygget på
// utdaterte mellomtall fra en tidligere kjøring - uten noe varsel.
//
// REKKEFØLGE (avhengighetsgraf, verifisert 2026-09-07 ved å grep'e getFromRedis() i alle åtte
// scriptene - se REFRESH.md for full forklaring):
//   1) build-remaining-summary.js       - ingen avhengigheter (rot)
//   2) build-tenant-budget.js           - leser REMAINING (eierandel-korrigering av budsjett)
//   3) build-contract-expiry-2026.js    - leser REMAINING
//   4) build-omsetningsavregning.js     - leser REMAINING
//   5) build-tenant-forecast-table.js   - leser REMAINING + BUDGET (må komme etter BÅDE 1 og 2)
//   6) build-nxt-budget.js              - ingen avhengigheter
//   7) build-tenant-signals.js          - ingen avhengigheter
//   8) build-vacant-areas.js            - ingen avhengigheter
//
// FAIL-FAST: stopper på FØRSTE feil (inkl. verifyTotal()-kontrollsummene i steg 1/2) - fortsetter
// aldri til et script som ville lest et ufullstendig/foreldet Redis-resultat fra et tidligere steg.
//
// v19 (2026-09-07, "avstemming"-gjennomgangen): la til check-building-registry.js som et eget,
// IKKE-blokkerende diagnostikk-steg etter de åtte - det scriptet kaster aldri feil (kun
// console.log), men sin egen filhode-kommentar sier det bør kjøres etter HVER rådata-refresh
// (fanger ukjente bygg-navn tidlig). Kjøres etter build-nxt-budget.js/build-vacant-areas.js siden
// det leser DERES Redis-resultat.
//
// HUSK OGSÅ: de tre "refresh-*.js"-filene i denne mappen (refresh-fazile-remaining-tenants.js,
// refresh-nxt-booked-tenants.js, refresh-fazile-kontrakt-crosswalk.js) er IKKE kjørbare scripts,
// men oppskrifter for Claude sin interaktive Fazile/NXT MCP-tilkobling - de kan ikke automatiseres
// her, og må kjøres FØR dette orkestreringsscriptet for at rådataen skal være fersk. Se REFRESH.md.
//
// v30 (2026-09-08, Morten: "sørg for at NXT- og Fazile-data alltid hentes på likt slik at det ikke
// er mismatch mellom datalast fra de to systemene"): PREFLIGHT-porten under kjører FØR steg 1 og
// stopper hele pipelinen hvis rå-uttrekkene ikke deler skjæringsdato. Bakgrunnen er konkret: 7.
// september var fakturaplanen hentet 4. september mot en NXT-cache fra 30. august, mens NXT selv
// var oppdatert til 7. september. Fakturaer sendt i det vinduet ble talt BÅDE som bokført (de lå i
// den ferske NXT-cachen) og som gjenstående (de så usendte ut i den gamle fakturaplanen) - 838 985
// kr dobbelttalt, uten at noe stoppet kjøringen. En ren advarsel var ikke nok; her er det en
// blokkerende sjekk, fordi et slikt avvik ikke er synlig i resultatet etterpå.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Rå-uttrekk som MÅ dele skjæringsdato. `felt` er datofeltet i kildens egen meta.json.
// Legg til nye rå-kilder her når de kommer til - en kilde som ikke står her, blir ikke kontrollert.
const DATOKILDER = [
  { navn: "NXT bokført pr. leietaker", fil: "nxt-booked-tenants/meta.json", felt: "sistOppdatert" },
  { navn: "NXT 3630/3632-detalj", fil: "nxt-3630-3632-detalj/meta.json", felt: "uttrekksdato" },
  { navn: "Fazile rent_roll (gjenstår)", fil: "fazile-remaining-tenants/meta.json", felt: "sistOppdatert" },
  { navn: "Fazile fakturaplan", fil: "fazile-fakturaplan/meta.json", felt: "uttrekksdato" },
  // Fakturaplanens egen oppfatning av HVOR LANGT NXT er kommet - v13-metodikken bruker denne som
  // grense for "allerede fakturert", så den må stemme med NXT-uttrekket, ikke bare med seg selv.
  { navn: "Fakturaplanens NXT-cachedato", fil: "fazile-fakturaplan/meta.json", felt: "nxtCacheDato" },
];

function preflightDatoer() {
  const rot = path.join(__dirname, "refresh-data");
  const funnet = [];
  const mangler = [];
  for (const kilde of DATOKILDER) {
    const p = path.join(rot, kilde.fil);
    if (!fs.existsSync(p)) {
      mangler.push(`${kilde.navn}: fant ikke ${kilde.fil}`);
      continue;
    }
    const meta = JSON.parse(fs.readFileSync(p, "utf8"));
    const dato = meta[kilde.felt];
    if (!dato) {
      mangler.push(`${kilde.navn}: mangler feltet "${kilde.felt}" i ${kilde.fil}`);
      continue;
    }
    funnet.push({ ...kilde, dato });
  }
  const unike = [...new Set(funnet.map((k) => k.dato))].sort();
  console.log("Preflight - skjæringsdato pr. rå-uttrekk:");
  for (const k of funnet) console.log(`  ${k.dato}  ${k.navn}`);
  if (mangler.length > 0) {
    console.error("\nSTOPPET: kunne ikke kontrollere at uttrekkene er samkjørte:");
    for (const m of mangler) console.error(`  - ${m}`);
    process.exit(1);
  }
  if (unike.length > 1) {
    const eldst = unike[0];
    const ferskest = unike[unike.length - 1];
    console.error(`\nSTOPPET: rå-uttrekkene er IKKE hentet på samme dato (${eldst} … ${ferskest}).`);
    console.error("Etterslepende kilder som må hentes på nytt før pipelinen kan kjøre:");
    for (const k of funnet.filter((k) => k.dato !== ferskest)) {
      console.error(`  - ${k.navn} (${k.dato}, ${ferskest === k.dato ? "" : "bak "}${ferskest})`);
    }
    console.error(
      "\nEt sprik mellom NXT- og Fazile-siden gir dobbelttelling eller hull i 'gjenstår å fakturere'\n" +
        "som IKKE er synlig i resultatet etterpå. Se scripts/REFRESH.md for hvordan hver kilde hentes.",
    );
    process.exit(1);
  }
  console.log(`Alle ${funnet.length} kilder er hentet ${unike[0]}.\n`);
}

const REKKEFOLGE = [
  "build-remaining-summary.js",
  "build-tenant-budget.js",
  "build-contract-expiry-2026.js",
  "build-omsetningsavregning.js",
  "build-tenant-forecast-table.js",
  "build-nxt-budget.js",
  "build-tenant-signals.js",
  "build-vacant-areas.js",
];
const DIAGNOSTIKK = ["check-building-registry.js"];

function kjor(fil) {
  const stegStart = Date.now();
  const res = spawnSync(process.execPath, [path.join(__dirname, fil)], { stdio: "inherit" });
  return { res, sekunder: (Date.now() - stegStart) / 1000 };
}

function main() {
  const startTid = Date.now();
  preflightDatoer();
  console.log(`Oppdaterer Inntektsprognose - ${REKKEFOLGE.length} scripts i rekkefølge:\n`);
  for (const [i, fil] of REKKEFOLGE.entries()) {
    console.log(`\n[${i + 1}/${REKKEFOLGE.length}] ${fil}`);
    console.log("=".repeat(60));
    const { res, sekunder } = kjor(fil);
    if (res.status !== 0) {
      console.error(`\nSTOPPET: "${fil}" feilet (exit ${res.status}) - de resterende ${REKKEFOLGE.length - i - 1} scriptene ble IKKE kjørt.`);
      console.error("Rett feilen over og kjør på nytt - fortsetter aldri på et ufullstendig datagrunnlag.");
      process.exit(1);
    }
    console.log(`[${i + 1}/${REKKEFOLGE.length}] ${fil} ferdig (${sekunder.toFixed(1)}s)`);
  }
  console.log(`\nAlle ${REKKEFOLGE.length} scripts fullført på ${((Date.now() - startTid) / 1000).toFixed(1)}s.`);

  console.log(`\nDiagnostikk (ikke-blokkerende):`);
  for (const fil of DIAGNOSTIKK) {
    console.log(`\n${fil}`);
    console.log("-".repeat(60));
    kjor(fil);
  }
}

main();
