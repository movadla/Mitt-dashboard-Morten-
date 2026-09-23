// Kryssjekker Inntektsprognosen PÅ TVERS av byggeklossene, etter at hele pipelinen
// (build-remaining-summary.js -> build-tenant-budget.js -> build-tenant-forecast-table.js)
// har kjørt. De tre scriptene har allerede egne verifyTotal()-kontroller INNAD i seg selv
// (bygg- vs. leietaker/leietype-gruppering osv., kaster feil ved avvik) - dette scriptet
// dekker i stedet de kontrollene INGEN av dem gjør alene:
//
//  1) Er de hardkodede, manuelt limte-inn konstantene i lib/incomeForecast.local.ts/.anon.ts
//     (REMAINING, BOOKED_3600_3699/INVOICED) fortsatt i samsvar med det som faktisk ligger i
//     Redis/koden akkurat nå? Dette er den klart vanligste feilkilden denne høsten - "REMAINING
//     ble ikke limt inn på nytt etter siste kjøring" har alene gitt en feil toppboks i flere
//     dager ved minst én anledning.
//  2) Ble alle tre Redis-snapshotene faktisk oppdatert i SAMME kjørerunde (samme dato), eller
//     kjørte noen av dem for lenge siden mens andre er ferske (delvis kjørt pipeline)?
//  3) Budsjett-konstantene (OFFICIAL_LEIEINNTEKTER_BUDSJETT_2026/PARKERING) - kun en
//     påminnelse om at disse er årsspesifikke, se scripts/check-override-freshness.js for den
//     faktiske "trenger fornyelse"-sjekken.
//  4) Informativt (feiler ALDRI scriptet): leieforhold med budsjett men ~0 kr fakturert+gjenstår
//     ("0 kr tross budsjett"-mønsteret vi har brukt manuelt gjentatte ganger i høst for å finne
//     ekte feil), og leieforhold med stort negativt gjenstår UTEN en kjent forklaring.
//
// Kjør: node scripts/verify-income-forecast.js
// Exit code 1 hvis noe av (1)/(2) avviker utover toleransen - egnet for CI/manuell sjekk før
// man stoler på et nytt tall. (3)/(4) er kun informative og påvirker aldri exit code.

const fs = require("fs");
const path = require("path");
const { loadEnvLocal, getFromRedis } = require("./lib/refresh-helpers");

const INCOME_FORECAST_LOCAL = path.join(__dirname, "..", "lib", "incomeForecast.local.ts");
const INCOME_FORECAST_ANON = path.join(__dirname, "..", "lib", "incomeForecast.anon.ts");

const REMAINING_KEY = "jobb:inntektsprognose-gjenstar-leietakere";
const BUDGET_KEY = "jobb:inntektsprognose-leietaker-budsjett";
const TABLE_KEY = "jobb:inntektsprognose-leietaker-tabell";
const FIELD = "snapshot";

const TOLERANSE_PROSENT = 0.5; // samme terskel som verifyTotal() ellers i pipelinen
const STALENESS_VARSEL_DAGER = 7; // se hardingsplan-tiltak 8 i TENANT_REGLER.md

function round2(n) {
  return Math.round(n * 100) / 100;
}

function extractBlock(text, constName) {
  const startIdx = text.indexOf(`export const ${constName}`);
  if (startIdx === -1) throw new Error(`Fant ikke "export const ${constName}" i fila - er navnet endret?`);
  const rest = text.slice(startIdx);
  const nextIdx = rest.slice(1).search(/\nexport (const|interface|function)/);
  return nextIdx === -1 ? rest : rest.slice(0, nextIdx + 1);
}

function sumField(block, field) {
  const re = new RegExp(`\\b${field}:\\s*(-?[\\d.]+)`, "g");
  let m;
  let sum = 0;
  let count = 0;
  while ((m = re.exec(block))) {
    sum += Number(m[1]);
    count += 1;
  }
  if (count === 0) throw new Error(`Fant ikke feltet "${field}" i blokken.`);
  return { sum: round2(sum), count };
}

function extractString(block, field) {
  const m = block.match(new RegExp(`${field}:\\s*"([^"]*)"`));
  return m ? m[1] : null;
}

// Speiler lib/tenantForecastSystemRow.ts (kan ikke importeres direkte fra et CommonJS-script) -
// hold disse i sync manuelt hvis label-tekstene der endres.
const SYSTEM_ROW_LABELS = new Set([
  "Mustad Eiendom (intern bruk, ikke leieforhold)",
  "Avstemmingsdifferanse (Excel redigert etter at 'harde tall' ble limt inn i Oppsummering-arket)",
  "Dobbeltbudsjettert (trukket ut for å unngå dobbelttelling)",
  "Ukodet bokføring (uten kundenummer i NXT)",
]);
function isSystemRow(navn) {
  return SYSTEM_ROW_LABELS.has(navn) || navn.startsWith("Ledig");
}

function sjekkAvvik(feil, label, computed, independent, toleransePct = TOLERANSE_PROSENT) {
  if (!Number.isFinite(independent) || independent === 0) return;
  const avvikPct = (Math.abs(computed - independent) / Math.abs(independent)) * 100;
  const status = avvikPct > toleransePct ? "FEIL" : "OK";
  const linje = `  [${status}] ${label}: beregnet=${computed.toLocaleString("nb-NO")}, referanse=${independent.toLocaleString("nb-NO")} (${avvikPct.toFixed(3)}% avvik, toleranse ${toleransePct}%)`;
  console.log(linje);
  if (avvikPct > toleransePct) feil.push(label);
}

async function main() {
  loadEnvLocal();
  const feil = [];

  const tsFil = fs.existsSync(INCOME_FORECAST_LOCAL) ? INCOME_FORECAST_LOCAL : INCOME_FORECAST_ANON;
  console.log(`Leser hardkodede konstanter fra ${path.basename(tsFil)}\n`);
  const tsText = fs.readFileSync(tsFil, "utf8");

  const remainingBlock = extractBlock(tsText, "REMAINING");
  const bookedBlock = extractBlock(tsText, "BOOKED_3600_3699");
  const invoicedBlock = extractBlock(tsText, "INVOICED");

  const remainingConst = {
    totalDelA: sumField(remainingBlock, "totalDelA").sum,
    totalDelB: sumField(remainingBlock, "totalDelB").sum,
    sistOppdatert: extractString(remainingBlock, "sistOppdatert"),
  };
  const bookedConst = {
    totalDelA: sumField(bookedBlock, "totalDelA").sum,
    totalDelB: sumField(bookedBlock, "totalDelB").sum,
    sistOppdatert: extractString(bookedBlock, "sistOppdatert"),
  };
  const invoicedPeriods = { delA: sumField(invoicedBlock, "delA"), delB: sumField(invoicedBlock, "delB") };
  const invoicedConst = {
    totalDelA: invoicedPeriods.delA.sum,
    totalDelB: invoicedPeriods.delB.sum,
    antallPerioder: invoicedPeriods.delA.count,
    sistOppdatert: extractString(invoicedBlock, "sistOppdatert"),
  };

  console.log("1) Hardkodet-konstant selvkonsistens (INVOICED vs. BOOKED_3600_3699 - se TENANT_REGLER.md):");
  sjekkAvvik(
    feil,
    "INVOICED (periodesum) vs. BOOKED_3600_3699 (grand total, delA+delB)",
    round2(invoicedConst.totalDelA + invoicedConst.totalDelB),
    round2(bookedConst.totalDelA + bookedConst.totalDelB),
  );
  console.log("");

  console.log("2) Hardkodet REMAINING-konstant vs. faktisk Redis-snapshot (den vanligste \"glemt å lime inn\"-feilen):");
  const remainingSnap = await getFromRedis(REMAINING_KEY, FIELD);
  if (!remainingSnap) {
    console.log("  Ingen REMAINING-snapshot funnet i Redis (REDIS_URL mangler, eller build-remaining-summary.js er aldri kjørt) - hopper over denne kontrollen.");
  } else {
    let liveDelA = 0;
    let liveDelB = 0;
    for (const t of remainingSnap.tenants || []) {
      for (const g of t.byggGrupper || []) {
        liveDelA += g.gjenstarDelA || 0;
        liveDelB += g.gjenstarDelB || 0;
      }
    }
    sjekkAvvik(feil, "REMAINING.totalDelA (lib/incomeForecast.local.ts) vs. Redis (live sum av byggGrupper)", remainingConst.totalDelA, round2(liveDelA));
    sjekkAvvik(feil, "REMAINING.totalDelB (lib/incomeForecast.local.ts) vs. Redis (live sum av byggGrupper)", remainingConst.totalDelB, round2(liveDelB));
    console.log(`  Konstantens sistOppdatert: ${remainingConst.sistOppdatert} | Redis-snapshotets sistOppdatert: ${remainingSnap.sistOppdatert}`);
    if (remainingConst.sistOppdatert !== remainingSnap.sistOppdatert) {
      console.log(`  ADVARSEL: datoene er ulike - konstanten kan stamme fra en ELDRE kjøring enn det som ligger i Redis nå.`);
    }
  }
  console.log("");

  console.log("3) Pipeline-ferskhet:");
  const budgetSnap = await getFromRedis(BUDGET_KEY, FIELD);
  const tableSnap = await getFromRedis(TABLE_KEY, FIELD);
  console.log(`  REMAINING (steg 1, Fazile/NXT-basert): ${remainingSnap ? remainingSnap.sistOppdatert : "(ingen snapshot funnet)"}`);
  console.log(`  Budsjett (steg 2, Excel-fil-vintage - IKKE en daglig kjøredato, oppdateres kun når Morten sender nytt Excel-ark): ${budgetSnap ? budgetSnap.sistOppdatert : "(ingen snapshot funnet)"}`);
  console.log(`  Leietaker-tabell (steg 3, arver alltid REMAINING sin dato ved bygging - se build-tenant-forecast-table.js): ${tableSnap ? tableSnap.sistOppdatert : "(ingen snapshot funnet)"}`);
  // Steg 3 kopierer bokstavelig talt remaining.sistOppdatert PÅ BYGGETIDSPUNKTET - matcher
  // derfor alltid REMAINING sin dato HVIS tabellen ble bygget etter siste REMAINING-oppdatering.
  // Et avvik her betyr konkret at build-tenant-forecast-table.js ikke er kjørt på nytt etter
  // siste build-remaining-summary.js-kjøring - reell staleness, ikke en forventet forskjell slik
  // budsjett-datoen er.
  if (remainingSnap && tableSnap && remainingSnap.sistOppdatert !== tableSnap.sistOppdatert) {
    console.log(`  ADVARSEL: Leietaker-tabellen (steg 3) sin dato stemmer IKKE med REMAINING (steg 1) sin nåværende dato - build-tenant-forecast-table.js er ikke kjørt på nytt etter siste build-remaining-summary.js-kjøring. Kjør steg 3 på nytt.`);
    feil.push("Leietaker-tabell (steg 3) er bygget mot en eldre REMAINING-versjon enn den som ligger i Redis nå");
  }
  if (remainingSnap) {
    const dagerSiden = Math.floor((Date.now() - new Date(`${remainingSnap.sistOppdatert}T00:00:00Z`).getTime()) / 86400000);
    if (dagerSiden > STALENESS_VARSEL_DAGER) {
      console.log(`  ADVARSEL: REMAINING-snapshotet er ${dagerSiden} dager gammelt (over terskelen på ${STALENESS_VARSEL_DAGER}) - vurder å friske opp Fazile/NXT-rådata og kjøre pipelinen på nytt.`);
    }
  }
  console.log("");

  console.log("4) Budsjett-konstantenes årstall (kun en påminnelse - se scripts/check-override-freshness.js for full sjekk):");
  const budgetJsText = fs.readFileSync(path.join(__dirname, "build-tenant-budget.js"), "utf8");
  const budgetArMatch = budgetJsText.match(/OFFICIAL_LEIEINNTEKTER_BUDSJETT_(\d{4})/);
  console.log(`  Budsjett-konstantene er navngitt for ${budgetArMatch ? budgetArMatch[1] : "(ukjent år)"}. Sjekk at dette stemmer med inneværende prognoseperiode.`);
  console.log("");

  console.log("5) Informativt (feiler ALDRI scriptet - kun til manuell gjennomgang):");
  if (tableSnap) {
    const mistenkelige = [];
    for (const del of [tableSnap.delA, tableSnap.delB]) {
      if (!del) continue;
      for (const r of del.leietaker || []) {
        if (isSystemRow(r.navn)) continue; // Ledig/Mustad-intern/Avstemming/Dobbeltbudsjettert er PER DEFINISJON budsjett uten fakturert - ikke en anomali
        const budsjett = r.budsjett || 0;
        const fakturertPlusGjenstar = (r.fakturert || 0) + (r.gjenstar || 0);
        if (budsjett > 50000 && Math.abs(fakturertPlusGjenstar) < 1000) {
          mistenkelige.push({ navn: r.navn, budsjett, fakturertPlusGjenstar });
        }
      }
    }
    console.log(`  "Budsjett>0 men fakturert+gjenstår≈0" (mulig feil match/manglende leieforhold, se seksjon 4 i TENANT_REGLER.md-metodikken): ${mistenkelige.length} funn.`);
    for (const m of mistenkelige.slice(0, 20)) {
      console.log(`    ${m.navn}: budsjett ${m.budsjett.toLocaleString("nb-NO")} kr, fakturert+gjenstår ${m.fakturertPlusGjenstar.toLocaleString("nb-NO")} kr`);
    }
    if (mistenkelige.length > 20) console.log(`    ... og ${mistenkelige.length - 20} til.`);
  } else {
    console.log("  Ingen leietaker-tabell-snapshot funnet i Redis - hopper over denne sjekken.");
  }

  if (remainingSnap) {
    const uforklart = [];
    for (const t of remainingSnap.tenants || []) {
      for (const g of t.byggGrupper || []) {
        if (g.gjenstarTotal < -1000 && !g.forklaring) {
          uforklart.push({ navn: t.navn, bygg: g.bygg, belop: g.gjenstarTotal, status: g.status });
        }
      }
    }
    console.log(`\n  Stort negativt gjenstår UTEN forklaringstekst (bør ha en status/forklaring, se ENGANGSGEBYR_LEIETAKERE m.fl.): ${uforklart.length} funn.`);
    for (const u of uforklart.slice(0, 20)) {
      console.log(`    ${u.navn} | ${u.bygg}: ${u.belop.toLocaleString("nb-NO")} kr (status: ${u.status || "(ingen)"})`);
    }
    if (uforklart.length > 20) console.log(`    ... og ${uforklart.length - 20} til.`);
  }

  console.log(`\n${"=".repeat(50)}`);
  if (feil.length) {
    console.log(`FEILET: ${feil.length} kontroll(er) over toleransen:`);
    for (const f of feil) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log("Alle harde kontroller OK.");
  }
}

main().catch((err) => {
  console.error("\nverify-income-forecast.js feilet med en uventet feil:", err);
  process.exitCode = 1;
});
