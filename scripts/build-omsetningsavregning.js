// Bygger Redis-snapshotet for "Omsetningsavregning" (erstatter det manuelle 10 mill kr-
// anslaget i lib/incomeForecastPotential.ts med et beregnet tall pr. CC Vest-butikk).
//
// Formel (Morten, 2026-08-24):
//   forventetOmsetningsleie = omsetningKorr (rullerende 12 mnd, eks. mva) × avtaltOmsProsent
//   fakturertPlusGjenstar   = fullArsverdi2026 for CC Vest-delen av leieforholdet (Fazile) -
//                             per definisjon "allerede fakturert i år" + "gjenstår å fakturere",
//                             siden REMAINING = fullArsverdi2026 - alleredeFakturertNxt2026.
//   ekstrafakturering       = MAX(0, forventetOmsetningsleie - fakturertPlusGjenstar)
// Gulvet på 0 fordi nesten alle CC Vest-leieforhold har minimumsleie - lav omsetning kan
// aldri gi penger tilbake, kun høy omsetning kan gi tilleggsfakturering.
//
// Datakilder:
//  - scripts/refresh-data/omsetningsleie-cc-vest.json - manuelt limt inn fra "Omsetningsleie"-
//    fanen i inntektsprognose-arket Morten sender over (ingen Fenistra-MCP finnes ennå).
//  - Redis jobb:inntektsprognose-gjenstar-leietakere (bygget av build-remaining-summary.js) -
//    gjenbrukes for fullArsverdi2026 pr. leietaker+bygg i stedet for å duplisere Fazile/NXT-
//    matchingen på nytt.
//
// Kjør: node scripts/build-omsetningsavregning.js

const fs = require("fs");
const path = require("path");
const { getFromRedis, pushToRedis, normalizeName, coreName } = require("./lib/refresh-helpers");

const INPUT_FILE = path.join(__dirname, "refresh-data", "omsetningsleie-cc-vest.json");
const REMAINING_HASH_KEY = "jobb:inntektsprognose-gjenstar-leietakere";
const REMAINING_FIELD = "snapshot";
const OUTPUT_HASH_KEY = "jobb:inntektsprognose-omsetningsavregning";
const OUTPUT_FIELD = "snapshot";

// CC Vest-komplekset spenner over FLERE Fazile-seksjonsnavn, ikke bare "Lilleakerveien 16"
// (hovedsenterbygget - bekreftet i build-remaining-summary.js sin BUILDING_ALIASES-kommentar).
// Funnet 2026-08-24: flere kjente CC Vest-butikker (Barnas Hus, Lyreco, Aquarium/Buddy m.fl.)
// har sin reelle "Minimumsleie avg.pl."-linje under "Lilleakerveien 14" - "Lilleakerveien 16"
// inneholder for disse KUN en løs 0-kr "Markedsbidrag"-linje. Uten dette ga scriptet feilaktig
// fakturertPlusGjenstar=0 for disse (samme symptom som Meny-funnet under - se EXCEL_TO_FAZILE_
// ALIASES). "Lilleakerveien 14" har OGSÅ enkelte ikke-CC Vest-leietakere (kontor/lager på
// samme gate) - det er trygt, siden de aldri vil treffe noe Excel-butikknavn i matchingen.
const CC_VEST_FAZILE_BYGG = ["lilleakerveien 16", "lilleakerveien 14"];

// Bekreftet av Morten (2026-08-24) - Excel-arkets kortnavn/merkenavn stemmer ikke alltid med
// det juridiske leietakernavnet i Fazile. Kun trygge, MORTEN-BEKREFTEDE sammenslåinger her -
// ikke gjettet på nytt uten å spørre.
const EXCEL_TO_FAZILE_ALIASES = {
  // Morten bekreftet først "CC Vest Mat as", men den har KUN én linje i Fazile ("à konto
  // felleskost avg.pl.", 0 kr) - kan ikke være riktig for en butikk med 535 mill kr omsetning.
  // "CC Vest Stormarked AS" ble også undersøkt og forkastet (1,28 mill kr, linjer som
  // "spiserom og møterom"/"solcelleanlegg" - ser ut som en administrativ senterenhet, ikke en
  // butikk). Fant i stedet en "Minimumsleie avg.pl." på 18 409 954 kr/år på Norgesgruppen Øst
  // AS for Lilleakerveien 16 - realistisk størrelse, og NorgesGruppen Øst er reelt driftsselskap
  // for Meny-butikker i regionen. Bekreftet av Morten 2026-08-24 etter denne korreksjonen.
  "Meny CC Vest": "Norgesgruppen Øst AS",
  "Anton Sport CC Vest": "Sport Holding Retail AS",
  Sportsnett: "Sport Holding Retail AS",
  "Vitusapotek CC Vest": "Norsk Medisinaldepot AS",
  "H & M CC Vest  Avd 835": "H & M Hennes & Mauritz AS",
  "Synoptik Brilleland": "Synoptik Norge AS",
  Sunkost: "Stig A. Dalen AS",
  Buddy: "Aquarium A/S",
  "Beth´s Beauty": "Beths Beauty Center AS",
  "Søstrene Grene": "HS Retail Oslo2 AS",
  "Vita Detalj AS": "Vita Group AS",
  "Backe Grensen": "Joh. Jørg.Backe CC Vest AS",
  "Smoothie Exchange": "Smoothie Xchange AS",
  "Narvesen CC Vest": "Reitan Convenience Norway AS/Kiosk 814",
  // Morten oppga opprinnelig "Grensen Sko CC Vest A/S" for Kidz-butikken, men det finnes
  // INGEN slik leietaker i Fazile (sjekket direkte, 0 treff på "Grensen Sko" utover denne
  // ene) - konklusjonen er at hoved- og Kidz-butikken deler samme kontrakt/selskap som
  // "Grændsens Skotøimagazin" (se GROUPED_TENANTS under for hvordan vi unngår dobbelttelling
  // av den delte fakturert+gjenstår-basisen).
  "Grændsens Skotøimagazin": "Grensen Sko Drift AS",
  "Grændsens Skotøimagazin Kidz": "Grensen Sko Drift AS",
  // Morten oppga først "Morris-Accent AS" (riktig, bekreftet via Salesforce Account-navn -
  // org.nr 966715596, Forretning_Navn__c="Bagorama"), men den kontrakten gikk ut 2025-02-28
  // og finnes derfor ikke i Fazile sitt AKTIVE leieforhold-datasett. Salesforce viser en
  // etterfølger-konto "Snos Cc Vest AS" (samme Forretning_Navn__c="Bagorama", ny hovedkontrakt
  // til 2030-02-28, opprettet des. 2025) - dette er riktig 2026-leieforhold.
  Bagorama: "Snos Cc Vest AS",
  // Newbie er KappAhls egen barneklær-merkevare (offentlig kjent kjede-eierskap) - Mortens
  // eget "kanskje"-forslag 2026-08-25, IKKE eksplisitt bekreftet ennå - dobbeltsjekk med ham.
  Newbie: "Kappahl AS",
};

// Bekreftet av Morten: ikke omsetningsbasert leieforhold - skal ikke telles med i det hele
// tatt (heller ikke som "ikke matchet", siden det ikke er en matching-feil).
const EXCLUDED_NOT_OMSETNINGSBASERT = new Set(["McDonald`s CC Vest", "Telenorbutikken CC Vest", "Elite Foto"]);

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Excel-butikknavn har ofte "CC Vest"/"CC-Vest"-suffiks som ikke alltid finnes i Fazile sitt
// leietakernavn (eller omvendt) - strip det av før substring-matching.
function stripCcVestSuffix(name) {
  return name
    .replace(/\bcc[\s-]?vest\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const input = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));
  const remaining = await getFromRedis(REMAINING_HASH_KEY, REMAINING_FIELD);
  if (!remaining) {
    console.error("Fant ikke gjenstår-per-leietaker-snapshotet i Redis - kjør build-remaining-summary.js først.");
    process.exit(1);
  }

  // Kun leietakere med minst én byggGruppe i CC Vest (Lilleakerveien 16) - reduserer
  // tvetydighet drastisk før vi begynner å matche mot Excel-butikknavn.
  const ccVestTenants = [];
  for (const t of remaining.tenants) {
    const grupper = t.byggGrupper.filter((b) => CC_VEST_FAZILE_BYGG.some((alias) => normalizeName(b.bygg).includes(alias)));
    if (grupper.length === 0) continue;
    const fullArsverdiCcVest = round2(grupper.reduce((s, b) => s + b.fullArsverdi2026DelA + b.fullArsverdi2026DelB, 0));
    ccVestTenants.push({ navn: t.navn, fullArsverdiCcVest });
  }

  const byExactName = new Map(ccVestTenants.map((t) => [normalizeName(t.navn), t]));
  const byCoreName = new Map(); // coreName -> tenant[] (kan ha flere - kun bruk hvis unikt)
  const byCoreNameNoSpace = new Map(); // coreName uten mellomrom -> tenant[] (fanger "PikantUnder" vs "Pikant Under AS")
  for (const t of ccVestTenants) {
    const c = coreName(t.navn);
    if (!byCoreName.has(c)) byCoreName.set(c, []);
    byCoreName.get(c).push(t);

    const cns = c.replace(/\s+/g, "");
    if (!byCoreNameNoSpace.has(cns)) byCoreNameNoSpace.set(cns, []);
    byCoreNameNoSpace.get(cns).push(t);
  }

  function findTenant(butikkNavn) {
    const alias = EXCEL_TO_FAZILE_ALIASES[butikkNavn];
    if (alias) {
      const aliasHit = byExactName.get(normalizeName(alias));
      if (aliasHit) return { tenant: aliasHit, via: "bekreftet av Morten" };
      return null; // alias finnes ikke i Fazile ennå (f.eks. Bagorama -> Morris-Accent AS)
    }

    const exact = byExactName.get(normalizeName(butikkNavn));
    if (exact) return { tenant: exact, via: "eksakt" };

    const butikkCore = coreName(stripCcVestSuffix(butikkNavn));

    const core = byCoreName.get(butikkCore);
    if (core && core.length === 1) return { tenant: core[0], via: "kjerne-navn" };

    const coreNoSpace = byCoreNameNoSpace.get(butikkCore.replace(/\s+/g, ""));
    if (coreNoSpace && coreNoSpace.length === 1) return { tenant: coreNoSpace[0], via: "kjerne-navn (uten mellomrom)" };

    // Delstreng-fallback på kjerne-navn (uten selskapsform/CC Vest-suffiks/tegnsetting) -
    // fanger f.eks. "Escape by Lakkbar" (Excel) mot "Lakkbar AS" (Fazile). Krever minst 4
    // tegn for å unngå tilfeldige korte fellestreff, og kun brukt når treffet er unikt.
    if (butikkCore.length >= 4) {
      const candidates = ccVestTenants.filter((t) => {
        const tenantCore = coreName(stripCcVestSuffix(t.navn));
        if (tenantCore.length < 4) return false;
        return tenantCore.includes(butikkCore) || butikkCore.includes(tenantCore);
      });
      if (candidates.length === 1) return { tenant: candidates[0], via: "delstreng" };
    }
    return null;
  }

  const excluded = [];
  const unmatched = [];
  // matchedByTenant: Fazile-tenantnavn -> liste av { rad, forventetOmsetningsleie, via }
  // Flere Excel-rader kan dele samme Fazile-leieforhold (f.eks. Anton Sport + Sportsnett under
  // "Sport Holding Retail AS") - MÅ grupperes og trekke "fakturert+gjenstår" fra ÉN gang, ikke
  // én gang PR rad, ellers dobbelt-/trippelttelles samme basis.
  const matchedByTenant = new Map();

  for (const rad of input.butikker) {
    if (EXCLUDED_NOT_OMSETNINGSBASERT.has(rad.butikk)) {
      excluded.push(rad.butikk);
      continue;
    }
    const match = findTenant(rad.butikk);
    const forventetOmsetningsleie = round2(rad.omsetningKorr * rad.avtaltOmsProsent);

    if (!match) {
      unmatched.push(rad.butikk);
      continue;
    }

    if (!matchedByTenant.has(match.tenant.navn)) matchedByTenant.set(match.tenant.navn, []);
    matchedByTenant.get(match.tenant.navn).push({ rad, forventetOmsetningsleie, via: match.via, tenant: match.tenant });
  }

  const butikker = [];
  let sumEkstrafakturering = 0;
  let countMatched = 0;

  for (const [, gruppe] of matchedByTenant) {
    const fakturertPlusGjenstar = gruppe[0].tenant.fullArsverdiCcVest;
    const sumForventet = gruppe.reduce((s, g) => s + g.forventetOmsetningsleie, 0);
    const ekstraGruppe = Math.max(0, round2(sumForventet - fakturertPlusGjenstar));
    const delerMedAndre = gruppe.length > 1;

    for (const g of gruppe) {
      const andel = sumForventet > 0 ? g.forventetOmsetningsleie / sumForventet : 0;
      const ekstrafakturering = round2(ekstraGruppe * andel);
      sumEkstrafakturering += ekstrafakturering;
      countMatched++;
      butikker.push({
        butikk: g.rad.butikk,
        omsetningKorr: g.rad.omsetningKorr,
        avtaltOmsProsent: g.rad.avtaltOmsProsent,
        forventetOmsetningsleie: g.forventetOmsetningsleie,
        fakturertPlusGjenstar,
        ekstrafakturering,
        matchStatus: g.via,
        delerLeieforholdMed: delerMedAndre
          ? gruppe.filter((x) => x !== g).map((x) => x.rad.butikk)
          : [],
      });
    }
  }

  for (const navn of unmatched) {
    const rad = input.butikker.find((b) => b.butikk === navn);
    butikker.push({
      butikk: rad.butikk,
      omsetningKorr: rad.omsetningKorr,
      avtaltOmsProsent: rad.avtaltOmsProsent,
      forventetOmsetningsleie: round2(rad.omsetningKorr * rad.avtaltOmsProsent),
      fakturertPlusGjenstar: null,
      ekstrafakturering: 0,
      matchStatus: "ikke-matchet",
      delerLeieforholdMed: [],
    });
  }

  butikker.sort((a, b) => b.ekstrafakturering - a.ekstrafakturering);

  const snapshot = {
    sistOppdatert: input.hentetDato,
    kilde: input.kilde,
    totalEkstrafakturering: round2(sumEkstrafakturering),
    antallButikker: butikker.length,
    antallMatchet: countMatched,
    antallIkkeMatchet: unmatched.length,
    antallUtelatt: excluded.length,
    butikkerUtelatt: excluded,
    butikker,
  };

  console.log(`Butikker: ${butikker.length} (matchet=${countMatched}, ikke matchet=${unmatched.length}, utelatt=${excluded.length})`);
  if (excluded.length > 0) {
    console.log(`Utelatt (ikke omsetningsbasert, bekreftet av Morten):`);
    for (const navn of excluded) console.log(`  - ${navn}`);
  }
  if (unmatched.length > 0) {
    console.log(`Ikke matchet mot noe CC Vest-leieforhold (sjekk manuelt, telles ikke i summen):`);
    for (const navn of unmatched) console.log(`  - ${navn}`);
  }
  console.log(`Sum ekstrafakturering: ${snapshot.totalEkstrafakturering} kr`);

  return pushToRedis(OUTPUT_HASH_KEY, OUTPUT_FIELD, snapshot, "omsetningsavregning-snapshot.json");
}

main();
