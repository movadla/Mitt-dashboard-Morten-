// Bygger lib/leietakerFacts.local.ts og lib/leietakerFacts.anon.ts fra fire rå JSON-uttrekk i
// scripts/refresh-data/ (leietaker-facts-contracts.json, -cc.json, -customers.json,
// -properties.json). Se AGENTS.md sitt mønster for de 6 pekerfilene - dette er et 7. par.
//
// DATAHENTING (samme mønster som scripts/build-guarantees.js/refresh-fazile-kontrakt-crosswalk.js
// - ingen frittstående API, Fazile MCP er kun tilgjengelig i en Claude-økt):
//   1. contracts(filter: { status: { eq: "ACTIVE" } }, orderBy: { contract_id: ASC }) paginert med
//      contract_id: { gt: <forrige max> } til en batch < 500 rader kommer tilbake.
//      -> scripts/refresh-data/leietaker-facts-contracts.json ({contract_id, property_id,
//      start_date, end_date}).
//   2. Batch contract_customers(filter: { contract_id: { in: [...] }, main: { eq: true },
//      customer_type: { eq: "TENANT" } }) - maks 100 ID-er pr. "in"-filter (Fabric svarer
//      "IN operator filter object cannot process more than 100 values at a time" over dette,
//      IKKE 20-25 som refresh-fazile-kontrakt-crosswalk.js sin gamle advarsel - grensen er
//      tydeligvis økt siden 2026-08-26).
//      -> scripts/refresh-data/leietaker-facts-cc.json ({contract_id, customer_id}[]).
//   3. Batch customers(filter: { c_id: { in: [...] } }) for full_name + erp_code.
//      -> scripts/refresh-data/leietaker-facts-customers.json ({c_id, full_name, erp_code}[]).
//   4. properties(filter: { p_id: { in: [...] } }) for eiendomsnavn - distinkte property_id fra
//      steg 1 (typisk <40 stk portefølje-bredt, ett kall holder).
//      -> scripts/refresh-data/leietaker-facts-properties.json ({p_id, name}[]).
//
// "Bygg" er EIENDOMSNAVN (property.name), ikke seksjonsnavn - en bevisst forenkling (2026-09-27)
// for å unngå en 5. spørrings-runde via rental_object->section. Eiendomsnavn har alltid en
// "_E"-suffiks og noen ganger doble mellomrom i Fazile sin masterdata - begge vaskes bort her
// (se rensBygg()), IKKE i selve dataene, så rå-uttrekket forblir en tro kopi av kilden.
//
// "kontraktStart"/"kontraktSlutt" er datoene til leietakerens ELDST STARTENDE aktive kontrakt
// (representerer det opprinnelige leieforholdet best, ikke et blandet gjennomsnitt av f.eks.
// en parkeringskontrakt inngått senere) - ALDRI et mikset par fra to ulike kontrakter.
// Leietakere med flere kontrakter beholder bare dette ene paret.
//
// Kjør: node scripts/build-leietaker-facts.js
//
// NESTE OPPDATERING: gjenta steg 1-4 i en ny Claude-økt (les denne kommentaren for spørringene),
// lagre over de fire JSON-filene, kjør scriptet på nytt. Det overskriver BEGGE lib/leietakerFacts.
// local.ts og .anon.ts i sin helhet - ingen manuell redigering av disse to filene består et rerun.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "refresh-data");
const LOCAL_FILE = path.join(__dirname, "..", "lib", "leietakerFacts.local.ts");
const ANON_FILE = path.join(__dirname, "..", "lib", "leietakerFacts.anon.ts");
const WIDGETS_LOCAL = path.join(__dirname, "..", "lib", "widgets.local.ts");
const WIDGETS_ANON = path.join(__dirname, "..", "lib", "widgets.anon.ts");

function esc(s) {
  return String(s).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
function jsVal(v) {
  if (v === null || v === undefined) return "null";
  return `"${esc(v)}"`;
}

// "Lilleakerveien  2AB_E" -> "Lilleakerveien 2AB" (fjern _E-suffiks + kollaps doble mellomrom -
// begge er kjente Fazile-masterdata-artefakter, se fazile_schema_guide sin "Datatype-fallgruver".
function rensBygg(navn) {
  return navn.replace(/_E$/, "").replace(/\s+/g, " ").trim();
}

// Samme anonymiserings-gjenbruk som scripts/build-guarantees.js sin byggNavnTilAnon - matcher
// leietakernavn mot allerede tildelte "Demokunde N"-numre i widgets.anon.ts via delt id
// (cN+kunde, rN+leietaker, customerId+leietaker, hgN/mgN+leietaker), slik at samme leietaker får
// samme anonyme navn på tvers av ALLE anon-datasett i appen.
function byggNavnTilAnon(widgetsLocalTekst, widgetsAnonTekst) {
  const map = new Map();
  const cLocal = new Map([...widgetsLocalTekst.matchAll(/id: "(c\d+)", kunde: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const cAnon = new Map([...widgetsAnonTekst.matchAll(/id: "(c\d+)", kunde: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  for (const [id, kunde] of cLocal) if (cAnon.has(id)) map.set(kunde, cAnon.get(id));

  const rLocal = new Map([...widgetsLocalTekst.matchAll(/id: "(r\d+)", leietaker: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const rAnon = new Map([...widgetsAnonTekst.matchAll(/id: "(r\d+)", leietaker: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  for (const [id, navn] of rLocal) if (rAnon.has(id) && !map.has(navn)) map.set(navn, rAnon.get(id));

  const eLocal = new Map([...widgetsLocalTekst.matchAll(/leietaker: "([^"]+)", customerId: (\d+),/g)].map((m) => [Number(m[2]), m[1]]));
  const eAnon = new Map([...widgetsAnonTekst.matchAll(/leietaker: "([^"]+)", customerId: (\d+),/g)].map((m) => [Number(m[2]), m[1]]));
  for (const [id, navn] of eLocal) if (eAnon.has(id) && !map.has(navn)) map.set(navn, eAnon.get(id));

  const hgLocal = new Map([...widgetsLocalTekst.matchAll(/id: "(hg\d+)", leietaker: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const hgAnon = new Map([...widgetsAnonTekst.matchAll(/id: "(hg\d+)", leietaker: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  for (const [id, navn] of hgLocal) if (hgAnon.has(id) && !map.has(navn)) map.set(navn, hgAnon.get(id));

  const mgLocal = new Map([...widgetsLocalTekst.matchAll(/id: "(mg\d+)", leietaker: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const mgAnon = new Map([...widgetsAnonTekst.matchAll(/id: "(mg\d+)", leietaker: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  for (const [id, navn] of mgLocal) if (mgAnon.has(id) && !map.has(navn)) map.set(navn, mgAnon.get(id));

  return map;
}

function nesteDemokundeNummer(tekst) {
  const alle = [...tekst.matchAll(/Demokunde (\d+)/g)].map((m) => Number(m[1]));
  return (alle.length ? Math.max(...alle) : 0) + 1;
}

function looksLikeOrganization(navn) {
  return /\b(AS|ASA|DA|ANS|BA|NUF|ENK|SA|KS)\b|kommune|forening|klubb|sameie|selskap|stiftelse|menighet|departementet|direktoratet|universitet|skole|kirke|idrettslag|musikkorps|borettslag|komit[eè]|nemnda|byr[åa]|etat|turistforening|gmbh|ltd\.?/i.test(
    navn,
  );
}

function main() {
  const contracts = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "leietaker-facts-contracts.json"), "utf8"));
  const cc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "leietaker-facts-cc.json"), "utf8"));
  const customers = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "leietaker-facts-customers.json"), "utf8"));
  const properties = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "leietaker-facts-properties.json"), "utf8"));

  const contractById = new Map(contracts.map((c) => [c.contract_id, c]));
  const customerById = new Map(customers.map((c) => [c.c_id, c]));
  const propertyById = new Map(properties.map((p) => [p.p_id, p.name]));

  // Grupper kontrakt-koblinger per kunde, plukk den med tidligst start_date.
  const beste = new Map(); // customer_id -> { contract, }
  for (const link of cc) {
    const contract = contractById.get(link.contract_id);
    if (!contract || !contract.start_date) continue;
    const gjeldende = beste.get(link.customer_id);
    if (!gjeldende || contract.start_date < gjeldende.start_date) {
      beste.set(link.customer_id, contract);
    }
  }

  const rows = [];
  for (const [customerId, contract] of beste) {
    const customer = customerById.get(customerId);
    if (!customer || !customer.full_name) continue; // ingen gjettet navn
    rows.push({
      leietaker: customer.full_name,
      bygg: propertyById.has(contract.property_id) ? rensBygg(propertyById.get(contract.property_id)) : null,
      kontraktStart: contract.start_date,
      kontraktSlutt: contract.end_date ?? null,
      kundenummer: customer.erp_code ?? null,
      erPrivatperson: !looksLikeOrganization(customer.full_name),
    });
  }
  rows.sort((a, b) => a.leietaker.localeCompare(b.leietaker));

  const widgetsLocalTekst = fs.readFileSync(WIDGETS_LOCAL, "utf8");
  const widgetsAnonTekst = fs.readFileSync(WIDGETS_ANON, "utf8");
  const navnTilAnon = byggNavnTilAnon(widgetsLocalTekst, widgetsAnonTekst);
  let demokundeTeller = nesteDemokundeNummer(widgetsAnonTekst);
  let gjenbrukt = 0;
  let nye = 0;

  function anonNavnFor(ektNavn, erPrivatperson) {
    if (navnTilAnon.has(ektNavn)) {
      gjenbrukt++;
      return navnTilAnon.get(ektNavn);
    }
    nye++;
    return `Demokunde ${demokundeTeller++}` + (erPrivatperson ? "" : " AS");
  }

  function renderRow(navn, r, id) {
    return `  { id: "${id}", leietaker: "${esc(navn)}", bygg: ${jsVal(r.bygg)}, kontraktStart: ${jsVal(r.kontraktStart)}, kontraktSlutt: ${jsVal(r.kontraktSlutt)}, kundenummer: ${jsVal(r.kundenummer)}, kilde: "Fazile contract+customer, hentet 2026-09-27" },`;
  }

  const localLines = [];
  const anonLines = [];
  rows.forEach((r, i) => {
    const id = `lf${i + 1}`;
    localLines.push(renderRow(r.leietaker, r, id));
    const anonNavn = anonNavnFor(r.leietaker, r.erPrivatperson);
    anonLines.push(renderRow(anonNavn, r, id));
  });

  const HEADER_TYPES = `export interface LeietakerFact {
  id: string;
  leietaker: string;
  bygg: string | null;
  kontraktStart: string | null;
  kontraktSlutt: string | null;
  kundenummer: string | null;
  kilde: string;
}

export const LEIETAKER_FACTS_SIST_OPPDATERT = "2026-09-27";
`;

  const distinkteKunder = beste.size;
  const droppetUtenNavn = distinkteKunder - rows.length;
  const localHeaderComment = `/**
 * EKTE DATA fra Fazile (contracts + contract_customers + customers + properties, hentet
 * 2026-09-27). Delt fakta-tabell (bygg + kontraktstart/-slutt + kundenummer) for oppslag på
 * tvers av seksjoner (Garantioversikt, Kundefordringer, Kontrakter/Utløp osv.) i stedet for at
 * hver seksjon finner opp sin egen leietaker->bygg/dato-matching - se lib/leietakerFactsLookup.ts.
 *
 * DEKNING: kun AKTIVE kontrakter (status "ACTIVE" i Fazile) - ${distinkteKunder} distinkte
 * hovedleietakere funnet på ${contracts.length} aktive kontrakter portefølje-bredt (én leietaker
 * kan ha flere kontrakter, f.eks. husleie + parkering - de ${cc.length} kontrakt->hovedleietaker-
 * koblingene slår altså sammen til ${distinkteKunder} unike leietakere), ${rows.length} av dem
 * fikk en rad her${droppetUtenNavn > 0 ? ` (${droppetUtenNavn} droppet pga. manglende navn i kilden - IKKE gjettet inn)` : ""}.
 * Dette er IKKE hele Mustads leietakerportefølje (andre seksjoner, f.eks. Kundefordringer,
 * opererer med ~400+ inkl. utløpte/historiske) - kun det som var praktisk å hente i én runde.
 * Rader mangler helt for leietakere denne runden ikke nådde - \`finnLeietakerFact()\` returnerer
 * null for dem, IKKE en gjettet verdi. "Bygg" er eiendomsnavn (property.name), ikke seksjonsnavn -
 * se build-leietaker-facts.js sin filhode-kommentar for hvorfor. En leietaker med flere aktive
 * kontrakter har kun fått datoene fra sin ELDST STARTENDE kontrakt (aldri et blandet par fra to
 * ulike kontrakter) - se scriptet for metodikk. Oppdater ved å kjøre
 * scripts/build-leietaker-facts.js på nytt etter en frisk Fazile-runde (se scriptets filhode for
 * spørringene).
 */
`;

  const anonHeaderComment = `/**
 * ANONYMISERT — se lib/leietakerFacts.local.ts sin kommentar for metodikk (2026-09-27).
 * Leietakernavn gjenbruker et eksisterende "Demokunde N"-nummer der samme leietaker allerede
 * opptrer i CONTRACTS/RECEIVABLES/EXPIRIES/HAR_GARANTI/MANGLER_GARANTI (widgets.anon.ts) -
 * ${gjenbrukt} gjenbrukt, ${nye} fikk et ferskt nummer her.
 */
`;

  const localOut = `${localHeaderComment}${HEADER_TYPES}export const LEIETAKER_FACTS: LeietakerFact[] = [\n${localLines.join("\n")}\n];\n`;
  const anonOut = `${anonHeaderComment}${HEADER_TYPES}export const LEIETAKER_FACTS: LeietakerFact[] = [\n${anonLines.join("\n")}\n];\n`;

  fs.writeFileSync(LOCAL_FILE, localOut);
  fs.writeFileSync(ANON_FILE, anonOut);

  console.log(`Skrev ${rows.length} rader til ${LOCAL_FILE} og ${ANON_FILE}.`);
  console.log(`Anonymisering: ${gjenbrukt} gjenbrukte Demokunde-numre, ${nye} nye.`);
}

main();
