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
const { spawnSync } = require("child_process");
const path = require("path");

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
