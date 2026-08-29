// Bygger Redis-snapshotet for "Omsetningsavregning" (turnover-rent-avregning for 2026).
//
// v4 (2026-08-27) - full re-verifisering etter at Morten oppdaget flere metodefeil i v3:
//  - 9 leietakere (Tatler, Sprell, Telenor Norge, Søstrene Grene, Synoptik, Traktøren,
//    Wowbrow, Stig A. Dalen/Sunkost, Woolland) feilaktig markert "avgått" i v3 - de var
//    aktive hele tiden, v3 sitt Fazile-søk var feil-scopet til feil bygg/seksjon.
//  - Omsetning: bruker nå Morten sin egen "Omsetningsleie"-fane (manuelt oppdatert fra
//    fenistra.net, rullerende 12 mnd) i stedet for Fazile butikkomsetning-verktøyet, som
//    Morten bekreftet 2026-08-27 IKKE skal brukes ("Det er feil slik det ligger i dag").
//  - Fakturert 2026: kjerneleie-konti (3620+3630) KUN - IKKE hele kostnadskurven
//    (felleskostnader/energi/eiendomsskatt/garasje/lager/administrasjon/markedsføring),
//    for å sammenlignes riktig mot minimumsleie/omsetningsleie-linjen alene (samme
//    avgrensing som Amesto sin egen "à konto leie").
//  - KRITISK (Morten, 2026-08-27, gjentatt fra tidligere runde): 2025-avregningen (konto
//    3632, bekreftet via tekstlabel "Avsetning omsetningsleie 2025 iht vedlegg"/"Overført
//    fra Fazile") er nå ekskludert SYSTEMATISK for alle 36 berørte leietakere (full sweep),
//    ikke bare de 5 v2/v3 fant ved stikkprøve-beløpsmatching.
//
// Input-fila (`refresh-data/omsetningsavregning-2026-verified.json`) inneholder nå det
// FERDIGE, beregnede snapshotet direkte (bygget av en engangs-node-analyse denne økten via
// Fazile+NXT MCP-verktøy + manuell Excel-lesing - se `buildingTurnoverNote` i selve fila for
// full metodikk/kjente hull). Dette scriptet er derfor en ren passthrough til Redis, ikke en
// beregning - neste gang tallene skal oppdateres må hele uttrekket gjøres på nytt via Claude
// (Fazile leietakerliste + NXT generalLedgerTransaction + Morten sin Omsetningsleie-fane),
// IKKE bare kjør dette scriptet på nytt uten fersk data.
//
// Kjente hull i v4 (se buildingTurnoverNote i input-fila for detaljer): Barnas Hus og Lyreco
// (registrert på Lilleakerveien 14, ikke 16) har uverifisert fakturert2026. 7 leietakere fra
// Excel-arket (Sportsnett, Grændsens Skotøimagazin+Kidz, Buddy, Bagorama, Narvesen, Elite
// Foto) ble ikke funnet i Fazile og er utelatt, ikke aktivt vurdert.
//
// Kjør: node scripts/build-omsetningsavregning.js

const fs = require("fs");
const path = require("path");
const { pushToRedis } = require("./lib/refresh-helpers");

const INPUT_FILE = path.join(__dirname, "refresh-data", "omsetningsavregning-2026-verified.json");
const OUTPUT_HASH_KEY = "jobb:inntektsprognose-omsetningsavregning";
const OUTPUT_FIELD = "snapshot";

async function main() {
  const snapshot = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));

  console.log(`Leieforhold: ${snapshot.antallButikker} (verifisert=${snapshot.antallMatchet}, utelatt=${snapshot.antallUtelatt})`);
  const byggFordeling = {};
  for (const b of snapshot.butikker) byggFordeling[b.bygg] = (byggFordeling[b.bygg] || 0) + 1;
  console.log("Fordelt på bygg:", byggFordeling);
  console.log(`Sum avregning (forventet 2026-merleie): ${snapshot.totalEkstrafakturering} kr`);
  const krevManuell = snapshot.butikker.filter((b) => b.matchStatus.includes("manuell"));
  if (krevManuell.length) {
    console.log(`ADVARSEL - krever manuell sjekk: ${krevManuell.map((b) => b.butikk).join(", ")}`);
  }

  return pushToRedis(OUTPUT_HASH_KEY, OUTPUT_FIELD, snapshot, "omsetningsavregning-snapshot.json");
}

main();
