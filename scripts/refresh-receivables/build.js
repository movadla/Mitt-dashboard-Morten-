// Kundefordringer: bygger RECEIVABLES-blokken i lib/widgets.local.ts fra de 22 stagede selskapene
// i scripts/refresh-data/_staging-receivables/ (se stage.js og README).
//
// Regler (uendret siden 2026-08-14): leietakere matches på tvers av selskaper via org.nr
// (associate.companyNo), fallback normalisert navn når org.nr mangler; en kunde-selskap-relasjon
// telles kun når NETTO saldo i det selskapet er positiv (kreditsaldoer er ikke fordringer);
// underInkasso = minst én åpen post med debtCollectionCaseNo != 0; sortert etter størst utestående;
// id r1.. er posisjonsbasert (risikovurderinger/kommentarer knyttet til id kan flytte seg).
// Oppdaterer også RECEIVABLES_HENTET_DATO og header-kommentaren.
// Bruk: node scripts/refresh-receivables/build.js [--dry-run]
const fs = require("fs");
const path = require("path");

const DRY = process.argv.includes("--dry-run");
const ROOT = path.join(__dirname, "..", "..");
const WIDGETS = path.join(ROOT, "lib", "widgets.local.ts");
const STAGED_DIR = path.join(ROOT, "scripts", "refresh-data", "_staging-receivables");
const FORVENTET_SELSKAPER = 22;

const filer = fs.readdirSync(STAGED_DIR).filter((f) => f.endsWith(".json"));
if (filer.length !== FORVENTET_SELSKAPER) {
  console.error(`Forventet ${FORVENTET_SELSKAPER} stagede selskaper, fant ${filer.length}: ${filer.join(", ")}`);
  process.exit(1);
}
const staged = filer.map((f) => JSON.parse(fs.readFileSync(path.join(STAGED_DIR, f), "utf8")));
const hentetDatoer = new Set(staged.map((s) => s.hentet));
if (hentetDatoer.size !== 1) console.warn("Advarsel: stagede filer har ulike hentet-datoer:", [...hentetDatoer]);
const HENTET = [...hentetDatoer].sort().pop();

function isoDato(yyyymmdd) {
  const s = String(yyyymmdd);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}
function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}
const r2 = (n) => Math.round(n * 100) / 100;

// 1) Grupper rader pr. selskap pr. kunde (customerNo er selskaps-internt, aldri globalt).
const kundeSelskap = new Map();
let sumAlleRader = 0;
let antallRader = 0;
for (const s of staged) {
  for (const r of s.rader) {
    sumAlleRader += r.outstandingAmountDomestic;
    antallRader += 1;
    const key = `${s.selskap}|${r.customerNo}`;
    if (!kundeSelskap.has(key)) {
      kundeSelskap.set(key, { selskap: s.selskap, customerNo: r.customerNo, navn: r.navn, orgnr: (r.orgnr || "").trim(), rader: [] });
    }
    kundeSelskap.get(key).rader.push(r);
  }
}

// 2) Kun relasjoner med positiv netto saldo.
let sumNegativeNetto = 0;
let antallNegativeRelasjoner = 0;
const positive = [];
for (const ks of kundeSelskap.values()) {
  const netto = r2(ks.rader.reduce((a, r) => a + r.outstandingAmountDomestic, 0));
  if (netto <= 0) {
    sumNegativeNetto += netto;
    antallNegativeRelasjoner += 1;
    continue;
  }
  positive.push({ ...ks, netto });
}

// 3) Slå sammen på tvers av selskaper: org.nr først, navn som fallback.
const leietakere = new Map();
for (const ks of positive) {
  const key = ks.orgnr && /^\d{9}$/.test(ks.orgnr) ? `org:${ks.orgnr}` : `navn:${norm(ks.navn)}`;
  if (!leietakere.has(key)) leietakere.set(key, { key, navnKandidater: new Map(), selskaper: [] });
  const lt = leietakere.get(key);
  lt.navnKandidater.set(ks.navn, (lt.navnKandidater.get(ks.navn) || 0) + ks.netto);
  const underInkasso = ks.rader.some((r) => Number(r.debtCollectionCaseNo) !== 0);
  const fakturaer = ks.rader
    .slice()
    .sort((a, b) => a.dueDate - b.dueDate)
    .map((r) => {
      const f = { belop: r2(r.outstandingAmountDomestic), forfallsdato: isoDato(r.dueDate) };
      if (r.invoiceNo) f.fakturaNr = String(r.invoiceNo);
      if (Number(r.debtCollectionCaseNo) !== 0) f.underInkasso = true;
      return f;
    });
  lt.selskaper.push({ selskap: ks.selskap, belop: ks.netto, antallLinjer: ks.rader.length, underInkasso, fakturaer });
}

// 4) Navn = kandidaten med størst beløp; sorter og gi id.
const rows = [...leietakere.values()].map((lt) => {
  const navn = [...lt.navnKandidater.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const selskaper = lt.selskaper.sort((a, b) => b.belop - a.belop);
  return { leietaker: navn, utestaende: r2(selskaper.reduce((a, s) => a + s.belop, 0)), selskaper };
});
rows.sort((a, b) => b.utestaende - a.utestaende || a.leietaker.localeCompare(b.leietaker, "nb"));
rows.forEach((r, i) => (r.id = `r${i + 1}`));

const total = r2(rows.reduce((a, r) => a + r.utestaende, 0));
const flereSelskaper = rows.filter((r) => r.selskaper.length > 1).length;
const underInkasso = rows.filter((r) => r.selskaper.some((s) => s.underInkasso)).length;
console.log(`Stagede rader: ${antallRader}, sum alle rader ${sumAlleRader.toLocaleString("nb-NO")}`);
console.log(`Kunde/selskap-relasjoner: ${kundeSelskap.size}, hvorav ${antallNegativeRelasjoner} med netto <= 0 (sum ${r2(sumNegativeNetto).toLocaleString("nb-NO")}) er utelatt`);
console.log(`Kontroll: sum positive netto ${total.toLocaleString("nb-NO")} = sum alle rader - negative netto ${r2(sumAlleRader - sumNegativeNetto).toLocaleString("nb-NO")}`);
if (Math.abs(total - (sumAlleRader - sumNegativeNetto)) > 0.05) {
  console.error("AVVIK i kontrollsum - avbryter.");
  process.exit(1);
}
console.log(`Leietakere: ${rows.length}, ${flereSelskaper} skylder flere selskaper, ${underInkasso} under inkasso. Total utestående ${total.toLocaleString("nb-NO")}`);

// 5) Skriv TS-blokken.
function tsFaktura(f) {
  const deler = [];
  if (f.fakturaNr !== undefined) deler.push(`fakturaNr: ${JSON.stringify(f.fakturaNr)}`);
  deler.push(`belop: ${f.belop}`);
  deler.push(`forfallsdato: ${JSON.stringify(f.forfallsdato)}`);
  if (f.underInkasso) deler.push("underInkasso: true");
  return `{ ${deler.join(", ")} }`;
}
function tsSelskap(s) {
  const deler = [`selskap: ${JSON.stringify(s.selskap)}`, `belop: ${s.belop}`, `antallLinjer: ${s.antallLinjer}`];
  if (s.underInkasso) deler.push("underInkasso: true");
  deler.push(`fakturaer: [${s.fakturaer.map(tsFaktura).join(", ")}]`);
  return `{ ${deler.join(", ")} }`;
}
const linjer = rows.map(
  (r) => `  { id: ${JSON.stringify(r.id)}, leietaker: ${JSON.stringify(r.leietaker)}, utestaende: ${r.utestaende}, selskaper: [${r.selskaper.map(tsSelskap).join(", ")}] },`,
);
const blokk = `export const RECEIVABLES: Receivable[] = [\n${linjer.join("\n")}\n];`;

const kilde = fs.readFileSync(WIDGETS, "utf8");
const startMarkor = "export const RECEIVABLES: Receivable[] = [";
const start = kilde.indexOf(startMarkor);
if (start < 0) throw new Error("Fant ikke RECEIVABLES-blokken");
const slutt = kilde.indexOf("\n];", start);
if (slutt < 0) throw new Error("Fant ikke slutten av RECEIVABLES-blokken");
let ny = kilde.slice(0, start) + blokk + kilde.slice(slutt + 3);
const gammelDatoKonst = ny.match(/export const RECEIVABLES_HENTET_DATO = "(\d{4}-\d{2}-\d{2})";/);
if (!gammelDatoKonst) throw new Error("Fant ikke RECEIVABLES_HENTET_DATO");
ny = ny.replace(gammelDatoKonst[0], `export const RECEIVABLES_HENTET_DATO = "${HENTET}";`);
ny = ny.replace(
  /\* EKTE DATA fra Visma Business NXT \(hentet \d{4}-\d{2}-\d{2}, ALLE 22 Mustad-selskaper/,
  `* EKTE DATA fra Visma Business NXT (hentet ${HENTET}, ALLE 22 Mustad-selskaper`,
);
if (DRY) {
  console.log("--dry-run: skriver ikke. Første 3 linjer:");
  console.log(linjer.slice(0, 3).join("\n"));
} else {
  fs.writeFileSync(WIDGETS, ny, "utf8");
  console.log(`Skrev ${rows.length} rader til lib/widgets.local.ts, RECEIVABLES_HENTET_DATO = ${HENTET} (var ${gammelDatoKonst[1]})`);
}
