// Bygger og oppdaterer:
//  1) Redis-snapshotet for "Gjenstår per leietaker (Fazile)" (full leietaker/bygg-detalj)
//  2) Konsollutskrift for REMAINING-aggregatet i lib/incomeForecast.local.ts/.anon.ts
//     (kopier tallene inn manuelt - REMAINING er en liten, hardkodet konstant, ikke Redis-basert)
//
// Metodikk (Morten, 2026-08-24 - erstatter en tidligere, feilaktig fremover-rettet
// pro-rata-versjon av dette scriptet): gjenstår = FULL 2026-verdi (Fazile, årsbeløp
// justert for kontraktens faktiske start-/sluttdato i 2026) MINUS allerede fakturert
// i NXT for samme leietaker+bygg i år ("leieforhold" = leietaker+bygg-par - den
// fineste granulariteten NXT sin bokføring faktisk tillater).
//
// FORUTSETTER at disse to datasettene allerede er ferske (se egne header-kommentarer):
//  - scripts/refresh-data/fazile-remaining-tenants/*.json (scripts/refresh-fazile-remaining-tenants.js)
//  - scripts/refresh-data/booked-tenants-snapshot.json (dump av jobb:inntektsprognose-bokfort-leietakere,
//    som igjen bygges av scripts/refresh-nxt-booked-tenants.js - MÅ inkludere eierandel-halvering
//    og dump-steget, se punkt 6/7 i den filens header-kommentar)
//
// Kjør: node scripts/build-remaining-summary.js

const fs = require("fs");
const path = require("path");

const FAZILE_DIR = path.join(__dirname, "refresh-data", "fazile-remaining-tenants");
const NXT_BOOKED_SNAPSHOT = path.join(__dirname, "refresh-data", "booked-tenants-snapshot.json");
const REDIS_HASH_KEY = "jobb:inntektsprognose-gjenstar-leietakere";
const REDIS_FIELD = "snapshot";

// Se punkt 3 i scripts/refresh-fazile-remaining-tenants.js sin header-kommentar.
const STRANDVEIEN_4_8_MANUAL_HALVING = "Strandveien 4-8_E";

// CC Vest-senteret heter "Lilleakerveien 16" i Fazile (eiendom "Lilleakerveien 16 mm_E")
// men "CC Vest Senter" i NXT - bekreftet ved identisk, stor kjede-/butikk-leietakerliste
// på begge sider (kjente CC Vest-navn gjenkjent på tvers), IKKE gjettet.
const CC_VEST_NXT_BYGG = "CC Vest Senter";

// Bygg-navn-alias: Fazile-seksjon (normalisert) -> NXT-bygg-navn (eksakt streng, som i
// booked-tenants-snapshot.json). Kun trygge, bekreftede sammenslåinger - ALDRI gjett en
// ny en uten å kryssjekke leietakerlisten på begge sider slik disse ble bekreftet.
const BUILDING_ALIASES = {
  "arnstein arnebergsvei 4": "Arnstein Arnebergs vei 4",
  "mustadsvei 1": "Mustads vei 1",
  "lilleakerveien 16": CC_VEST_NXT_BYGG,
  "lilleakerveien 16 skoda": "Lilleakerveien 16 Bilforretning",
  // Bilforhandlerens Audi/VW-forhandlerseksjoner i Fazile tilsvarer NXT sine rene
  // bygg-bøtter i Fåbro Eiendom AS - bekreftet ved at leietakerens årsbeløp
  // (9,89 mill / 13,71 mill) matcher NXT-beløpene på kroneøre.
  "lilleakerveien 20 audi": "Lilleakerveien 20",
  "lilleakerveien 22 vw": "Lilleakerveien 22",
  // Funnet 2026-08-24 ved å undersøke "ikke matchet i NXT"-leieforhold: leietakernavnet
  // fantes eksakt i NXT, bare under et annet bygg-navn enn Fazile sitt - bekreftet ved å
  // sammenligne NXT sin bygg-liste for de samme leietakerne (44/11/5/1/1 leieforhold løst).
  "lilleakerveien 2 garasje": "Lilleakerveien 2 - Garasje", // NXT har bindestrek
  "lilleakerveien 6d hus 3": "Lilleakerveien 6D", // Fazile sin "Hus 3"-detalj finnes ikke i NXT
  "p-bro uteparkering": "P-Bro mellom LV8 og LV4",
  "mustads vei 10 fåbro gård": "Mustads vei 10",
  "mustads vei 12 hagebyen": "Mustads vei 12",
};

const { loadEnvLocal, pushToRedis, normalizeName, coreName } = require("./lib/refresh-helpers");

// Onepark AS - parkeringsdrift utenfor Fazile rent_roll (etterfakturert basert på tilsendt
// omsetningsrapport, ikke en vanlig leiekontrakt). De 6 leieforholdene under nulles derfor
// automatisk til "avsluttet" (ingen aktiv Fazile-kontrakt), men det er FEIL for Onepark - det
// er fortsatt en løpende, ordinær driftsinntekt resten av året. Manuell korreksjon (Morten,
// 2026-08-25): bruk årsestimatet fra Inntektsprognose-arkets "Onepark"-fane (rullerende
// prognose basert på 2025-fakturering × vekstfaktor jan-mai 2026) minus det som allerede er
// fakturert i NXT i år, lagt til Del B (ren parkeringsdrift) som ETT samlet portefølje-tillegg
// - IKKE fordelt bygg for bygg, siden Onepark-arkets bygg-liste (CC Vest P-hus, Carl. L.
// P-kontroll, Lilleakerveien 2, Lilleakerveien 2 Ute, Granfos Næringspark, Lilleakerveien 31,
// Lilleakerveien 8) ikke er 1:1 med Fazile sine 6 byggGrupper for Onepark AS - ville krevd en
// bygg-alias-tabell som ikke er bekreftet.
const ONEPARK_LEIETAKER_KEY = "onepark as";
const ONEPARK_ESTIMAT_2026 = 9457370.44; // Kilde: 2026_08_04_Inntektsprognose_Juli_2026.xlsx, fane "Onepark", rad "Estimert inntekt 2025"-linjen (P40)

// Interne Mustad-selskaper som noen ganger opptrer som "leietaker" i Fazile-data (egne
// lokaler/administrative posteringer) - ikke reelle eksterne leieforhold. Flagges separat
// (status "intern-mustad") i stedet for å telles som et vanlig usikkert avvik.
const INTERN_MUSTAD_NAMES = new Set(["mustad eiendom as", "mustad eiendomsdrift as"]);

function isDelB(seksjon) {
  const s = seksjon.toLowerCase();
  return s.includes("garasje") || s.includes("parkering") || s.includes("p-hus") || s.includes("p-bro");
}

function resolveNxtBuilding(fazileSeksjon, nxtBuildingSet) {
  const norm = normalizeName(fazileSeksjon);
  if (BUILDING_ALIASES[norm]) return BUILDING_ALIASES[norm];
  for (const b of nxtBuildingSet) if (normalizeName(b) === norm) return b;
  // Uteparkering/garasje/p-hus-fallback: prøv "X Uteparkering" eller basenavnet uten suffiks.
  const withoutSuffix = norm.replace(/\s*(uteparkering|garasje|p-hus)$/i, "").trim();
  if (withoutSuffix !== norm) {
    for (const b of nxtBuildingSet) {
      const bn = normalizeName(b);
      if (bn === withoutSuffix + " uteparkering" || bn === withoutSuffix) return b;
    }
  }
  return null; // ikke funnet - allerede fakturert=0, hele beløpet telles som gjenstår
}

function daysBetweenInclusive(start, end) {
  return Math.round((end - start) / 86400000) + 1;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function main() {
  loadEnvLocal();

  const yearStart = new Date("2026-01-01");
  const yearEnd = new Date("2026-12-31");
  const daysInYear = daysBetweenInclusive(yearStart, yearEnd);

  const nxtData = JSON.parse(fs.readFileSync(NXT_BOOKED_SNAPSHOT, "utf8"));
  const nxtBuildingSet = new Set();
  for (const t of nxtData.tenants) for (const l of t.lines) nxtBuildingSet.add(l.bygg);
  const nxtGroups = new Map(); // "tenant||bygg" -> { alleredeA, alleredeB }
  for (const t of nxtData.tenants) {
    for (const l of t.lines) {
      const key = normalizeName(t.navn) + "||" + normalizeName(l.bygg);
      if (!nxtGroups.has(key)) nxtGroups.set(key, { alleredeA: 0, alleredeB: 0 });
      const g = nxtGroups.get(key);
      if ([3640, 3641, 3642].includes(l.accountNo)) g.alleredeB += l.belop;
      else g.alleredeA += l.belop;
    }
  }

  // Kjerne-navn-indeks (uten selskapsform/tegnsetting) - fallback-nøkkel når eksakt
  // normalisert navn ikke matcher (f.eks. et leietakernavn skrevet med "A/S" vs "AS").
  // Kun brukt når kjerne-navnet peker til NØYAKTIG ÉN reell NXT-leietaker (unngår
  // feilkobling ved tvetydighet).
  const nxtCoreNameIndex = new Map(); // coreName -> Set(reelt NXT-navn)
  for (const t of nxtData.tenants) {
    const c = coreName(t.navn);
    if (!nxtCoreNameIndex.has(c)) nxtCoreNameIndex.set(c, new Set());
    nxtCoreNameIndex.get(c).add(t.navn);
  }
  function resolveNxtTenantName(fazileLeietaker) {
    const candidates = nxtCoreNameIndex.get(coreName(fazileLeietaker));
    if (candidates && candidates.size === 1) return [...candidates][0];
    return null;
  }

  const files = fs
    .readdirSync(FAZILE_DIR)
    .filter((f) => f.endsWith(".json") && f !== "meta.json" && f !== "properties.json");

  // key = "leietaker||bygg (fazile-navn)" -> { leietaker, bygg, resolvedBygg, fullA, fullB, lines[] }
  const leieforhold = new Map();

  for (const file of files) {
    const rows = JSON.parse(fs.readFileSync(path.join(FAZILE_DIR, file), "utf8"));
    for (const row of rows) {
      const lineStart = row.start_dato ? new Date(row.start_dato) : yearStart;
      const lineEnd = row.slutt_dato ? new Date(row.slutt_dato) : yearEnd;
      const effectiveStart = lineStart > yearStart ? lineStart : yearStart;
      const effectiveEnd = lineEnd < yearEnd ? lineEnd : yearEnd;
      const days = daysBetweenInclusive(effectiveStart, effectiveEnd);
      if (days <= 0) continue; // linjen overlapper ikke 2026 i det hele tatt

      let belop = (row.arsleie_nok * days) / daysInYear;
      if (row.eiendom === STRANDVEIEN_4_8_MANUAL_HALVING) belop *= 0.5;
      belop = round2(belop);

      const del = isDelB(row.seksjon) ? "B" : "A";
      const resolvedBygg = resolveNxtBuilding(row.seksjon, nxtBuildingSet);
      const buildingForMatch = resolvedBygg || row.seksjon;
      const key = normalizeName(row.leietaker) + "||" + normalizeName(buildingForMatch);

      if (!leieforhold.has(key)) {
        leieforhold.set(key, {
          leietaker: row.leietaker.trim(),
          bygg: row.seksjon,
          resolvedBygg,
          fullA: 0,
          fullB: 0,
          lines: [],
        });
      }
      const g = leieforhold.get(key);
      g.lines.push({
        eiendom: row.eiendom,
        bygg: row.seksjon,
        linjetype: row.linjetype,
        beskrivelse: row.beskrivelse,
        del,
        fullArsverdi2026: belop,
      });
      if (del === "A") g.fullA += belop;
      else g.fullB += belop;
    }
  }

  // Bygg leieforhold-nivå-resultater (for REMAINING-aggregatet) og grupper samtidig opp til
  // leietaker-nivå (for Redis-snapshotet - hver leietaker kan ha flere byggGrupper).
  const tenantMap = new Map(); // normalisert leietakernavn -> { navn, byggGrupper[], lines[] }
  let sumTotalDelA = 0,
    sumTotalDelB = 0;
  let countMatched = 0,
    countUnmatched = 0,
    countAvsluttet = 0,
    countOmsetning = 0,
    countKontraktsendring = 0,
    countIkkeMatchetFlagget = 0,
    countInternMustad = 0,
    countMatchedViaCoreName = 0;

  for (const [, g] of leieforhold) {
    const bygg = normalizeName(g.resolvedBygg || g.bygg);
    let nxt = nxtGroups.get(normalizeName(g.leietaker) + "||" + bygg);
    if (!nxt) {
      const resolvedName = resolveNxtTenantName(g.leietaker);
      if (resolvedName) {
        const viaCoreName = nxtGroups.get(normalizeName(resolvedName) + "||" + bygg);
        if (viaCoreName) {
          nxt = viaCoreName;
          countMatchedViaCoreName++;
        }
      }
    }
    const alleredeA = nxt ? nxt.alleredeA : 0;
    const alleredeB = nxt ? nxt.alleredeB : 0;
    if (nxt) countMatched++;
    else countUnmatched++;

    const fullA = round2(g.fullA);
    const fullB = round2(g.fullB);
    // Del A/B-metodikken er ikke identisk på tvers av kilder (Fazile: seksjonsnavn-heuristikk,
    // NXT: accountNo) - for et gitt leieforhold representerer Fazile-siden ENTEN leie ELLER
    // parkering (aldri begge i samme leietaker+bygg-gruppe i praksis), mens NXT sin
    // accountNo-splitt av "allerede fakturert" for SAMME leieforhold noen ganger havner i det
    // andre Del-et (f.eks. en kontorleiekontrakt der NXT har bokført noe under en
    // parkeringskonto). Uten justering ga dette store, meningsløse kunstige avvik i Del A/B
    // hver for seg (f.eks. Del B endte netto negativ for hele porteføljen) selv om SUMMEN
    // (Del A + Del B) er riktig. Fiks: når leieforholdet entydig er ett Del (Fazile-siden har
    // kun full-verdi i én av delene), netter vi HELE "allerede fakturert" (begge NXT-kontoer)
    // mot akkurat det Del-et, i stedet for å la NXT sin kontosplitt lekke over i det andre.
    let gjenstarA, gjenstarB;
    const alleredeTotal = alleredeA + alleredeB;
    if (fullA > 0 && fullB === 0) {
      gjenstarA = round2(fullA - alleredeTotal);
      gjenstarB = 0;
    } else if (fullB > 0 && fullA === 0) {
      gjenstarB = round2(fullB - alleredeTotal);
      gjenstarA = 0;
    } else {
      // Begge deler 0 (uten treff-flagget) eller reelt blandet - behold per-del-subtraksjon.
      gjenstarA = round2(fullA - alleredeA);
      gjenstarB = round2(fullB - alleredeB);
    }

    let status = "ok";
    let forklaring = null;
    const kontraktAvsluttet = fullA === 0 && fullB === 0 && (alleredeA > 0 || alleredeB > 0);
    if (INTERN_MUSTAD_NAMES.has(normalizeName(g.leietaker))) {
      // Mustad Eiendom AS/Mustad Eiendomsdrift AS opptrer selv som "leietaker" i Fazile for
      // egne lokaler/administrative posteringer - ikke et reelt eksternt leieforhold. Beløpet
      // beholdes som beregnet (ingen antagelse om at det skal nulles), men flagges tydelig
      // adskilt fra ekte usikre leieforhold.
      status = "intern-mustad";
      forklaring = "Leietaker er Mustad selv (egne lokaler/administrativ postering i Fazile) - ikke et reelt eksternt leieforhold.";
      countInternMustad++;
    } else if (kontraktAvsluttet) {
      gjenstarA = 0;
      gjenstarB = 0;
      status = "avsluttet";
      forklaring =
        "Leieforholdet er avsluttet i Fazile (ingen aktiv kontrakt i dag) - allerede fakturert i NXT tidligere i år regnes som ferdig, ikke gjenstående.";
      countAvsluttet++;
    } else if (!nxt && (fullA > 0 || fullB > 0)) {
      // Ingen tilsvarende bokføring funnet i NXT i år - kan bety en ny kontrakt (ingen
      // fakturering ennå i år er reelt og forventet), ELLER en bygg-/navnematch-feil som gjør
      // at reell fakturering ikke ble funnet. Ikke skilt fra hverandre automatisk - Morten må
      // sjekke manuelt, derfor egen kategori i gjennomgangslisten.
      status = "ikke-matchet-i-nxt";
      forklaring =
        "Ingen tilsvarende bokføring funnet i NXT for dette leietaker+bygg-paret i år. Kan være en ny kontrakt (ingen fakturering ennå i 2026 er normalt), eller en bygg-/navnematch-feil mellom Fazile og NXT - se bygg-navn-alias-tabellen i scripts/build-remaining-summary.js.";
      countIkkeMatchetFlagget++;
    } else if ((gjenstarA < -100 || gjenstarB < -100) && normalizeName(g.resolvedBygg || g.bygg) === normalizeName(CC_VEST_NXT_BYGG)) {
      status = "forklart-omsetningsleie";
      forklaring =
        "CC Vest-leieforhold: NXT har trolig bokført en omsetningsleie-/minimumsleie-avregning (periodisk 'Overført fra Fazile'-beløp) i tillegg til grunnleien - fanges ikke opp av Fazile sin kontraktslinje-baserte årsverdi (verifisert mot faktiske NXT-transaksjoner for én CC Vest-leietaker, 2026-08-24).";
      countOmsetning++;
    } else if (gjenstarA < -100 || gjenstarB < -100) {
      status = "forklart-kontraktsendring";
      forklaring =
        "Fazile viser kun dagens aktive kontrakt brukt for hele 2026 - leieforholdet ble trolig endret/indeksregulert i løpet av året (verifisert mot faktiske NXT-transaksjoner for én leietaker på Lilleakerveien 10, 2026-08-24).";
      countKontraktsendring++;
    }

    sumTotalDelA += gjenstarA;
    sumTotalDelB += gjenstarB;

    const tenantKey = normalizeName(g.leietaker);
    if (!tenantMap.has(tenantKey)) {
      tenantMap.set(tenantKey, { navn: g.leietaker, byggGrupper: [], lines: [] });
    }
    const tenant = tenantMap.get(tenantKey);
    tenant.byggGrupper.push({
      bygg: g.bygg,
      fullArsverdi2026DelA: fullA,
      fullArsverdi2026DelB: fullB,
      alleredeFakturertDelA: round2(alleredeA),
      alleredeFakturertDelB: round2(alleredeB),
      gjenstarTotal: round2(gjenstarA + gjenstarB),
      status,
      forklaring,
    });
    tenant.lines.push(...g.lines);
  }

  let oneparkKorreksjon = 0;
  const oneparkTenant = tenantMap.get(ONEPARK_LEIETAKER_KEY);
  if (oneparkTenant) {
    const alleredeFakturertOnepark = round2(
      oneparkTenant.byggGrupper.reduce((s, b) => s + b.alleredeFakturertDelA + b.alleredeFakturertDelB, 0),
    );
    oneparkKorreksjon = Math.max(0, round2(ONEPARK_ESTIMAT_2026 - alleredeFakturertOnepark));
    oneparkTenant.byggGrupper.push({
      bygg: "Onepark - parkeringsestimat 2026 (hele porteføljen, ikke bygg-fordelt)",
      fullArsverdi2026DelA: 0,
      fullArsverdi2026DelB: round2(ONEPARK_ESTIMAT_2026),
      alleredeFakturertDelA: 0,
      alleredeFakturertDelB: alleredeFakturertOnepark,
      gjenstarTotal: oneparkKorreksjon,
      status: "forklart-parkering-onepark",
      forklaring: `Onepark-parkering faktureres etter omsetningsrapport, utenfor vanlig Fazile-kontrakt (derfor "avsluttet" på de 6 byggene over). Årsestimat fra Inntektsprognose-arket: ${ONEPARK_ESTIMAT_2026.toLocaleString("nb-NO")} kr, minus allerede fakturert i NXT i år (${alleredeFakturertOnepark.toLocaleString("nb-NO")} kr) = ${oneparkKorreksjon.toLocaleString("nb-NO")} kr gjenstår. Lagt til Del B som ett samlet tillegg, ikke bygg-fordelt.`,
    });
    sumTotalDelB += oneparkKorreksjon;
  } else {
    console.log('ADVARSEL: fant ikke "Onepark AS" i leieforhold-datasettet - Onepark-korreksjonen ble IKKE lagt til.');
  }

  const tenantList = [...tenantMap.values()]
    .map((t) => {
      const fullArsverdi2026 = round2(t.byggGrupper.reduce((s, b) => s + b.fullArsverdi2026DelA + b.fullArsverdi2026DelB, 0));
      const alleredeFakturertNxt2026 = round2(
        t.byggGrupper.reduce((s, b) => s + b.alleredeFakturertDelA + b.alleredeFakturertDelB, 0),
      );
      const totalBelop = round2(t.byggGrupper.reduce((s, b) => s + b.gjenstarTotal, 0));
      return {
        navn: t.navn,
        fullArsverdi2026,
        alleredeFakturertNxt2026,
        totalBelop,
        byggGrupper: t.byggGrupper.sort((a, b) => b.gjenstarTotal - a.gjenstarTotal),
        lines: t.lines.sort((a, b) => b.fullArsverdi2026 - a.fullArsverdi2026),
      };
    })
    .sort((a, b) => b.totalBelop - a.totalBelop);

  const snapshot = {
    sistOppdatert: "2026-08-25",
    ar: 2026,
    totalBelop: round2(sumTotalDelA + sumTotalDelB),
    antallLeietakere: tenantList.length,
    tenants: tenantList,
  };

  console.log(`Leieforhold: ${leieforhold.size} (matchet=${countMatched}, ikke matchet=${countUnmatched})`);
  console.log(`  hvorav matchet via kjerne-navn-fallback (stavevariant AS/A/S osv.): ${countMatchedViaCoreName}`);
  console.log(`Avsluttede kontrakter nullstilt: ${countAvsluttet}`);
  console.log(`Intern Mustad (ikke reelt leieforhold): ${countInternMustad}`);
  console.log(`Flagget "ikke matchet i NXT" (ny kontrakt eller navnematch-feil - sjekk manuelt): ${countIkkeMatchetFlagget}`);
  console.log(`Forklart omsetningsleie (CC Vest): ${countOmsetning}`);
  console.log(`Forklart kontraktsendring/indeksregulering: ${countKontraktsendring}`);
  console.log(`Onepark-parkeringskorreksjon lagt til Del B: ${oneparkKorreksjon.toLocaleString("nb-NO")} kr`);
  console.log(`REMAINING-aggregat (lim inn i lib/incomeForecast.local.ts/.anon.ts):`);
  console.log(`  totalDelA: ${round2(sumTotalDelA)},`);
  console.log(`  totalDelB: ${round2(sumTotalDelB)},`);
  console.log(`  antallLeieforhold: ${leieforhold.size},`);
  console.log(`  antallIkkeMatchetFlagget: ${countIkkeMatchetFlagget},`);
  console.log(`  antallForklartOmsetningsleie: ${countOmsetning},`);
  console.log(`  antallForklartKontraktsendring: ${countKontraktsendring},`);
  console.log(`  antallAvsluttetNullstilt: ${countAvsluttet},`);
  console.log(`  antallInternMustad: ${countInternMustad},`);
  console.log(`Redis-snapshot: ${tenantList.length} leietakere, totalt ${snapshot.totalBelop} kr`);

  return pushToRedis(REDIS_HASH_KEY, REDIS_FIELD, snapshot, "remaining-tenants-snapshot.json");
}

main();
