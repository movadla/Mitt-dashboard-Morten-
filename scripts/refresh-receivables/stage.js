// Kundefordringer: stager NXT-svar (openCustomerEntry pr. selskap) fra én eller flere spilte
// MCP-resultatfiler (flere filer = flere sider av samme spørring, i rekkefølge).
//
// Framgangsmåte (2026-09-18, se README i denne mappa):
//   1. Kjør spørringen i README pr. selskap via Business NXT-MCP (én pr. tur, response_format json).
//      Svaret spilles til fil i .claude/projects/.../tool-results/ - det er den fila som stages.
//   2. node scripts/refresh-receivables/stage.js "<selskapsnavn>" <companyNo> <fil1> [fil2 ...]
//   3. Når alle 22 er staget: node scripts/refresh-receivables/build.js [--dry-run]
//
// Avviser hvis: totalCount != antall rader samlet, siste side har hasNextPage, duplikate
// (voucherJournalNo, auditNo), kontrollsum/-antall fra aggregat-søsteren avviker, org.nr i `firma`
// varierer mellom sidene, eller rader mangler kundenavn. `ballast`-søstrene (kun for å tvinge svaret
// til fil) ignoreres. Radene strippes til feltene build.js trenger.
//
// Stagede filer inneholder ekte kundenavn og ligger i scripts/refresh-data/_staging-receivables/
// (gitignored via scripts/refresh-data/**).
const fs = require("fs");
const path = require("path");

const [selskap, companyNo, ...files] = process.argv.slice(2);
if (!selskap || !companyNo || files.length === 0) {
  console.error('Bruk: node stage.js "<selskap>" <companyNo> <fil1> [fil2 ...]');
  process.exit(2);
}

function lesSvar(file) {
  const raw = fs.readFileSync(file, "utf8");
  const start = raw.indexOf("{");
  const json = JSON.parse(raw.slice(start));
  // Spilte filer inneholder useCompany-objektet direkte (nøkler poster/kontroll/...), inline-svar
  // kan være pakket i data.useCompany eller useCompany.
  const uc = json.poster ? json : json.data ? json.data.useCompany : json.useCompany;
  if (!uc) throw new Error(`Fant ikke useCompany i ${file}. Nøkler: ${Object.keys(json)}`);
  if (!uc.poster) throw new Error(`Fant ikke 'poster' i ${file}. Nøkler: ${Object.keys(uc)}`);
  return uc;
}

const problemer = [];
const items = [];
let totalCount = null;
let sumAgg = null;
let antallAgg = null;
let sisteHasNext = null;
let orgnr = null;
for (const f of files) {
  const uc = lesSvar(f);
  const firmaOrgnr = uc.firma && uc.firma.items && uc.firma.items[0] ? uc.firma.items[0].companyNo : null;
  if (firmaOrgnr) {
    if (orgnr === null) orgnr = firmaOrgnr;
    else if (orgnr !== firmaOrgnr) problemer.push(`org.nr varierer mellom sidene (${orgnr} vs ${firmaOrgnr})`);
  }
  if (totalCount === null) totalCount = uc.poster.totalCount;
  else if (uc.poster.totalCount !== totalCount) problemer.push(`totalCount varierer mellom sidene (${totalCount} vs ${uc.poster.totalCount})`);
  for (const r of uc.poster.items || []) {
    items.push({
      voucherJournalNo: r.voucherJournalNo,
      auditNo: r.auditNo,
      customerNo: r.customerNo,
      invoiceNo: r.invoiceNo,
      outstandingAmountDomestic: Number(r.outstandingAmountDomestic),
      dueDate: r.dueDate,
      debtCollectionCaseNo: r.debtCollectionCaseNo,
      navn: r.kunde ? r.kunde.name : null,
      orgnr: r.kunde ? r.kunde.companyNo : null,
    });
  }
  sisteHasNext = uc.poster.pageInfo ? uc.poster.pageInfo.hasNextPage : false;
  if (uc.kontroll && uc.kontroll.items && sumAgg === null) {
    sumAgg = uc.kontroll.items.reduce((a, k) => a + Number(k.aggregates.sum.outstandingAmountDomestic || 0), 0);
    antallAgg = uc.kontroll.items.reduce((a, k) => a + Number(k.aggregates.count.auditNo || 0), 0);
  }
}

if (totalCount !== items.length) problemer.push(`totalCount ${totalCount} != rader ${items.length}`);
if (sisteHasNext) problemer.push("siste side har hasNextPage = true (mangler side)");
const nokler = new Set();
for (const r of items) {
  const k = `${r.voucherJournalNo}|${r.auditNo}`;
  if (nokler.has(k)) problemer.push(`duplikat ${k}`);
  nokler.add(k);
}
const sumRader = items.reduce((s, r) => s + r.outstandingAmountDomestic, 0);
if (sumAgg !== null && Math.abs(sumAgg - sumRader) > 0.005) problemer.push(`kontrollsum ${sumAgg} != radsum ${sumRader.toFixed(2)}`);
if (antallAgg !== null && antallAgg !== items.length) problemer.push(`kontrollantall ${antallAgg} != rader ${items.length}`);
if (items.some((r) => !r.navn)) problemer.push(`${items.filter((r) => !r.navn).length} rader uten kundenavn`);

if (problemer.length) {
  console.error(`AVVIST ${selskap}: ${problemer.join("; ")}`);
  process.exit(1);
}
const out = {
  selskap,
  companyNo: Number(companyNo),
  orgnr,
  hentet: new Date().toISOString().slice(0, 10),
  antall: items.length,
  sumUtestaende: Math.round(sumRader * 100) / 100,
  rader: items,
};
const dir = path.join(__dirname, "..", "refresh-data", "_staging-receivables");
fs.mkdirSync(dir, { recursive: true });
const outFile = path.join(dir, `${companyNo}.json`);
fs.writeFileSync(outFile, JSON.stringify(out));
console.log(`OK ${selskap} (${companyNo}, org.nr ${orgnr}): ${items.length} rader, sum ${out.sumUtestaende.toLocaleString("nb-NO")} -> ${path.basename(outFile)}`);
