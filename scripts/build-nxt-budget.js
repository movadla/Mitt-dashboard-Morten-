// Bygger Redis-snapshotet for "Budsjett 2026 (NXT, konto 3600-3699)" - ny fane i
// Inntektsprognose, bygget 2026-08-24 etter Morten sitt spørsmål "kan du også hente
// budsjettet (konto 3600-3699) fra NXT i egen fane?".
//
// Kilde: Visma Business NXT MCP-verktøyet (businessnxt-execute_graphql_query), tabellene
// `budget`/`budgetLine`. Ett budsjett funnet for 2026: budgetNo=202601 "Budsjett 2026".
// Spurt PER SELSKAP (samme 22-selskaps-liste som businessnxt-init returnerer), gruppert
// på orgUnit3 (bygg), filtrert til generalLedgerAccountNo 3600-3699, year=2026:
//
//   query BudgetLines($cid: Int!, $b: [Int!] = [-1]) {
//     useCompany(no: $cid) {
//       budgetLine(
//         filter: {_and: [{generalLedgerAccountNo: {_gte: 3600}}, {generalLedgerAccountNo: {_lte: 3699}}, {year: {_eq: 2026}}]}
//         groupBy: [{orgUnit3: DEFAULT}]
//         orderBy: [{_sum: {creditAmountInvoicedDomestic: DESC}}]
//       ) { items { orgUnit3 @export(as: "b") aggregates { sum { creditAmountInvoicedDomestic debitAmountIncurredDomestic } } } }
//       orgUnit3(filter: {orgUnit3No: {_in: $b}}) { items { orgUnit3No name } }
//     }
//   }
//
// company_no kan settes direkte per kall (ingen ny init_company nødvendig per selskap,
// bekreftet - samme tenantId=510903 for alle 22). 13 av 22 selskaper har ingen
// budsjettlinjer i 3600-3699 (rene drift-/prosjektselskaper uten egen leieinntekt) -
// se selskaperUtenBudsjettI3600_3699 i rådatafilen, ikke en feil.
//
// Lagre rådataene i scripts/refresh-data/nxt-budget-3600-3699-raw.json (gitignored,
// ingen persondata - kun selskap/bygg/beløp) - IKKE forhåndskorriger eierandel der,
// dette scriptet gjør eierandel-halveringen selv (samme 3 selskaper som ellers i
// prosjektet: Fåbro Eiendom AS, Strandveien 10 AS, Strandveien 4-8 AS).
//
// Kjør: node scripts/build-nxt-budget.js

const fs = require("fs");
const path = require("path");
const { loadEnvLocal, pushToRedis, loadOwnershipShares, andelForBygg, andelForSelskap } = require("./lib/refresh-helpers");

const RAW_FILE = path.join(__dirname, "refresh-data", "nxt-budget-3600-3699-raw.json");
const REDIS_HASH_KEY = "jobb:inntektsprognose-nxt-budsjett";
const REDIS_FIELD = "snapshot";

function main() {
  loadEnvLocal();
  const raw = JSON.parse(fs.readFileSync(RAW_FILE, "utf8"));
  const shares = loadOwnershipShares();

  const perSelskap = raw.selskaper.map((s) => {
    // Kontroll: eierandel er satt PER SELSKAP i rådatafilen (s.eierandel). Sjekk selskaps-
    // nivå-regelen i den delte lib/data/ownership-shares.json FØRST (siden en generisk
    // bygg-etikett som "Adm felles" kan tilhøre flere selskaper med ulik eierandel) - fall
    // tilbake til bygg-nivå-regelen kun for selskaper uten en egen selskaps-regel.
    const forventetAndelSelskap = andelForSelskap(s.selskap, shares);
    const bygg = s.bygg.map((b) => {
      const forventetAndel = forventetAndelSelskap !== null ? forventetAndelSelskap : andelForBygg(b.bygg, shares);
      if (Math.abs(forventetAndel - s.eierandel) > 0.001) {
        throw new Error(
          `Eierandel-avvik for "${b.bygg}" (${s.selskap}): rådatafilen sier ${s.eierandel}, ` +
            `lib/data/ownership-shares.json sier ${forventetAndel}. Sjekk hvilken som er riktig før du fortsetter.`,
        );
      }
      return { bygg: b.bygg, belop: Math.round(b.belop * s.eierandel * 100) / 100 };
    });
    return {
      selskap: s.selskap,
      eierandel: s.eierandel,
      belop: Math.round(bygg.reduce((sum, b) => sum + b.belop, 0) * 100) / 100,
      bygg,
    };
  });

  const perByggMap = new Map();
  for (const s of perSelskap) {
    for (const b of s.bygg) {
      perByggMap.set(b.bygg, (perByggMap.get(b.bygg) || 0) + b.belop);
    }
  }
  const perBygg = [...perByggMap.entries()]
    .map(([bygg, belop]) => ({ bygg, belop: Math.round(belop * 100) / 100 }))
    .sort((a, b) => b.belop - a.belop);

  const totalBelop = Math.round(perSelskap.reduce((sum, s) => sum + s.belop, 0) * 100) / 100;

  const snapshot = {
    sistOppdatert: raw.hentetDato,
    ar: raw.ar,
    budgetNo: raw.budgetNo,
    totalBelop,
    perSelskap: perSelskap.sort((a, b) => b.belop - a.belop),
    perBygg,
    selskaperUtenBudsjett: raw.selskaperUtenBudsjettI3600_3699,
  };

  console.log(`Budsjett ${raw.ar} (konto 3600-3699), eierandel-korrigert: ${totalBelop}`);
  console.log(`  ${perSelskap.length} selskaper med budsjett, ${perBygg.length} bygg`);
  console.log(`  ${raw.selskaperUtenBudsjettI3600_3699.length} selskaper uten budsjett i 3600-3699`);

  return pushToRedis(REDIS_HASH_KEY, REDIS_FIELD, snapshot, "nxt-budget-snapshot.json");
}

main();
