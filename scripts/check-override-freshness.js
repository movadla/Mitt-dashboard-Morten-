// Lister alle tidsbestemte overrides i Inntektsprognose-pipelinen (aliaser, manuelle
// korreksjoner, budsjett-konstanter) og hvilket ar de sist ble bekreftet for - slik at man
// ved oppstart av en ny prognoseperiode (f.eks. 2027) far en konkret sjekkliste i stedet for
// a maatte lete manuelt gjennom scripts/refresh-data/TENANT_REGLER.md og fire store scripts.
//
// Kjor: node scripts/check-override-freshness.js [--ar=2027]
//   --ar=<year>  Malaret a sjekke mot. Default: inneverende kalenderar.
//
// Hvordan det virker: hvert override i de fire commiterte build-scriptene er tagget med en
// linjekommentar rett etter definisjonen:
//   // @override ar=2026 navn=NAVN antall=N [status=todo] -- fritekst-notat
// Dette scriptet leser filene som ren tekst (INGEN kode kjores/require's - null risiko for a
// trigge en faktisk pipeline-kjoring) og regex-matcher tagsene. De gitignorede
// _private-*.json-overrideene har et tilsvarende "_bekreftetForAr"-felt i selve JSON-en.
//
// Legg til en ny override? Tagg den pa samme mate rett etter definisjonen (se eksisterende
// tags for monster), eller legg "_bekreftetForAr": <ar> i en ny/eksisterende privat JSON-fil.

const fs = require("fs");
const path = require("path");

const MALAR = (() => {
  const arg = process.argv.find((a) => a.startsWith("--ar="));
  return arg ? Number(arg.split("=")[1]) : new Date().getFullYear();
})();

const COMMITTEDE_FILER = [
  "build-remaining-summary.js",
  "build-tenant-budget.js",
  "build-tenant-forecast-table.js",
  "build-contract-expiry-2026.js",
];

const OVERRIDE_TAG_REGEX = /\/\/\s*@override\s+ar=(\d+)\s+navn=(\S+)(?:\s+antall=(\d+))?(?:\s+status=(\S+))?\s*(?:--\s*(.*))?$/;

const PRIVATE_FILER = [
  "_private-tenant-aliases.json",
  "_private-fazile-to-nxt-aliases.json",
  "_private-konsern-grupper.json",
  "_private-flyttet-inn-overrides.json",
  "_private-untracked-overtakelser.json",
  "_private-usikre-kontrakter.json",
  "_private-manuelle-kontrakter.json",
  "_private-omsetningsavregning-heltfakturert.json",
  "_private-ledig-navnestripp.json",
  "_private-ukodet-kundekoding.json",
  "_private-ovrig-risiko.json",
];

function samleCommittedeOverrides() {
  const funnet = [];
  for (const filnavn of COMMITTEDE_FILER) {
    const fil = path.join(__dirname, filnavn);
    if (!fs.existsSync(fil)) {
      console.warn(`ADVARSEL: fant ikke ${filnavn} (forventet i scripts/) - hoppet over.`);
      continue;
    }
    const linjer = fs.readFileSync(fil, "utf8").split("\n");
    for (const rawLinje of linjer) {
      const linje = rawLinje.replace(/\r$/, "");
      const m = linje.match(OVERRIDE_TAG_REGEX);
      if (!m) continue;
      funnet.push({
        kilde: filnavn,
        ar: Number(m[1]),
        navn: m[2],
        antall: m[3] !== undefined ? Number(m[3]) : null,
        status: m[4] || null,
        notat: m[5] || "",
      });
    }
  }
  return funnet;
}

function samlePrivateOverrides() {
  const funnet = [];
  for (const filnavn of PRIVATE_FILER) {
    const fil = path.join(__dirname, "refresh-data", filnavn);
    if (!fs.existsSync(fil)) {
      funnet.push({ kilde: filnavn, ar: null, navn: filnavn, antall: null, status: "mangler-lokalt", notat: "Fila finnes ikke pa denne maskinen - normalt hvis den aldri er brukt/fylt ut her." });
      continue;
    }
    let data;
    try {
      data = JSON.parse(fs.readFileSync(fil, "utf8"));
    } catch (e) {
      funnet.push({ kilde: filnavn, ar: null, navn: filnavn, antall: null, status: "ugyldig-json", notat: String(e.message || e) });
      continue;
    }
    const ar = typeof data._bekreftetForAr === "number" ? data._bekreftetForAr : null;
    funnet.push({
      kilde: filnavn,
      ar,
      navn: filnavn,
      antall: null,
      status: ar === null ? "mangler-_bekreftetForAr" : null,
      notat: data._comment ? data._comment.slice(0, 90) + "..." : "",
    });
  }
  return funnet;
}

function main() {
  const committede = samleCommittedeOverrides();
  const private_ = samlePrivateOverrides();
  const alle = [...committede, ...private_];

  const trengerAlltid = alle.filter((o) => o.status === "todo");
  const ikkeBekreftetForMalar = alle.filter((o) => o.status !== "todo" && o.ar !== null && o.ar !== MALAR);
  const manglerMetadata = alle.filter((o) => o.ar === null && o.status !== "mangler-lokalt");
  const manglerLokalt = alle.filter((o) => o.status === "mangler-lokalt");
  const bekreftetForMalar = alle.filter((o) => o.status !== "todo" && o.ar === MALAR);

  console.log(`\nInntektsprognose - override-friskhet, malar ${MALAR}\n${"=".repeat(50)}\n`);

  if (trengerAlltid.length) {
    console.log(`MA BYGGES/RETTES (uavhengig av ar) - ${trengerAlltid.length} stk:`);
    for (const o of trengerAlltid) {
      console.log(`  [${o.kilde}] ${o.navn}${o.antall !== null ? ` (${o.antall} stk)` : ""} - ${o.notat}`);
    }
    console.log("");
  }

  if (ikkeBekreftetForMalar.length) {
    console.log(`IKKE bekreftet for ${MALAR} (sist bekreftet for et annet ar) - ${ikkeBekreftetForMalar.length} stk:`);
    for (const o of ikkeBekreftetForMalar) {
      console.log(`  [${o.kilde}] ${o.navn}${o.antall !== null ? ` (${o.antall} stk)` : ""} - sist bekreftet ${o.ar}. ${o.notat}`);
    }
    console.log("");
  }

  if (manglerMetadata.length) {
    console.log(`Mangler bekreftelses-metadata (sjekk manuelt) - ${manglerMetadata.length} stk:`);
    for (const o of manglerMetadata) {
      console.log(`  [${o.kilde}] ${o.navn} - ${o.notat}`);
    }
    console.log("");
  }

  if (manglerLokalt.length) {
    console.log(`Gitignorede filer ikke funnet lokalt (normalt pa en fersk maskin) - ${manglerLokalt.length} stk:`);
    for (const o of manglerLokalt) {
      console.log(`  ${o.kilde}`);
    }
    console.log("");
  }

  console.log(`Bekreftet for ${MALAR}: ${bekreftetForMalar.length} stk.`);
  console.log(`\nTotalt sporet: ${alle.length} overrides pa tvers av ${COMMITTEDE_FILER.length} committede scripts + ${PRIVATE_FILER.length} gitignorede filer.`);
  console.log("Se scripts/refresh-data/TENANT_REGLER.md for full kontekst/metodikk bak hvert punkt.\n");

  const kritiske = trengerAlltid.length + ikkeBekreftetForMalar.length;
  if (kritiske > 0) {
    process.exitCode = 1;
  }
}

main();
