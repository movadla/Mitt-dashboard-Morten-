// Slår sammen et rått Fazile-uttrekk (kontrakter signert siden forrige runde) inn i den
// eksisterende, hardkodede CONTRACTS-arrayen i lib/widgets.local.ts og lib/widgets.anon.ts.
//
// VIKTIG: dette scriptet henter ALDRI data selv - Fazile er kun tilgjengelig via MCP-verktøy i en
// Claude-økt (mcp__claude_ai_Fazile_intern__fazile_graphql_query), ikke via et API-nøkkel-basert
// REST-kall et frittstående Node-script kan gjøre (i motsetning til NXT, som har ekte
// programmatisk tilgang - se refresh-nxt-booked-tenants.js). Prosedyren for NESTE runde:
//
//   1. Finn siste CONTRACTS_SIST_OPPDATERT i lib/widgets.local.ts.
//   2. Kjør (i en Claude-økt, med Fazile-MCP lastet):
//        contracts(first: 100, orderBy: { created_at: DESC }, filter: { status: { neq: "draft" } })
//      Behold kun rader med created_at > forrige CONTRACTS_SIST_OPPDATERT.
//   3. For de kontrakt-IDene: hent contract_lines (type: RENT), contract_areas (via ro_id),
//      contract_customers (main=true, customer_type=TENANT) + customers - se
//      scripts/refresh-data/kontrakter-2026-09-26-raw.json for eksakt skjema/mønster.
//   4. Lagre resultatet i scripts/refresh-data/kontrakter-<dato>-raw.json (samme struktur som
//      2026-09-26-fila - gitignored, trygt for ekte navn).
//   5. Kjør: node scripts/build-new-contracts.js scripts/refresh-data/kontrakter-<dato>-raw.json
//
// Filtreringsregler (se full begrunnelse i lib/widgets.local.ts sin CONTRACTS-kommentar):
//  - Ekskluder status som inneholder "DRAFT".
//  - Ekskluder rader der |start_date - created_at| > 60 dager (migrasjons-/bakgrunnsregistrerte
//    kontrakter, IKKE nye signeringer - denne regelen fanget fortsatt opp ekte støy 2026-09-26:
//    tre "Forvaltningshonorar"-kontrakter på property "Øvrige _E" med start_date over ett år unna).
//  - Ekskluder rader der summen av RENT-linjer er 0 kr (administrative tillegg til en EKSISTERENDE
//    leieavtale, typisk et "Kantinebidrag (N)"-tillegg - ikke en ny inntektsgivende leieavtale).
//    NY denne runden (2026-09-26) - fantes ikke i det opprinnelige engangsuttrekket.
//
// Anonymisering (kun .anon.ts): et selskapsnavn (gjenkjent på AS/ASA/NUF/ASA-suffiks) får
// "Demokunde <nytt tall> AS" (alltid " AS" uansett opprinnelig selskapsform, matcher 220-277-
// serien sitt mønster). Et navn UTEN kjent suffiks (privatperson-mistanke, samme konservative
// standard som lib/tenantAnonymize.ts) får "Demokunde <nytt tall>" uten suffiks. Scriptet
// gjenbruker et eksisterende Demokunde-nummer KUN hvis nøyaktig samme kundenavn allerede finnes
// i CONTRACTS-arrayen selv (samme fil) - IKKE via RECEIVABLES/andre datasett, se
// 2026-09-26-kommentaren i widgets.anon.ts for hvorfor kryssreferanse dit viste seg upålitelig
// (r-IDer der er ikke stabile mellom filene).

const fs = require("fs");
const path = require("path");

const LOCAL_FILE = path.join(__dirname, "..", "lib", "widgets.local.ts");
const ANON_FILE = path.join(__dirname, "..", "lib", "widgets.anon.ts");

const ORG_SUFFIKS_REGEX = /\b(AS|ASA|DA|ANS|BA|NUF|ENK|SA|KS)\b/i;
function serOmSomSelskap(navn) {
  return ORG_SUFFIKS_REGEX.test(navn);
}

function kanoniskBygg(propertyName) {
  return propertyName
    .replace(/_E$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function utledLeietype(descriptions) {
  const kjente = [
    ["Kontorleie", /kontorleie/i],
    ["Husleie", /husleie/i],
    ["Parkering", /parkering/i],
    ["Garasje/El-bil", /garasje|el-bil|ladestrøm/i],
    ["Lagerleie", /lagerleie/i],
    ["Minimumsleie", /minimumsleie/i],
  ];
  const funnet = [];
  for (const [navn, regex] of kjente) {
    if (descriptions.some((d) => regex.test(d)) && !funnet.includes(navn)) funnet.push(navn);
  }
  return funnet.length > 0 ? funnet.join("/") : descriptions[0] || "Ukjent";
}

function beregnKontrakter(raw) {
  const linjerPerContract = new Map();
  for (const l of raw.contractLinesRentOnly) {
    if (!linjerPerContract.has(l.c_id)) linjerPerContract.set(l.c_id, []);
    linjerPerContract.get(l.c_id).push(l);
  }
  const arealPerRo = new Map();
  for (const a of raw.contractAreas) {
    arealPerRo.set(a.rental_object_id, (arealPerRo.get(a.rental_object_id) || 0) + (a.exclusive_area || 0));
  }
  const kundeNavnPerContract = new Map();
  const customerById = new Map(raw.customers.map((c) => [c.c_id, c.full_name]));
  for (const t of raw.mainTenants) {
    kundeNavnPerContract.set(t.contract_id, customerById.get(t.customer_id));
  }

  const ut = [];
  for (const c of raw.contracts) {
    if (/draft/i.test(c.status)) continue;
    // Fazile sin created_at-streng ("... +00") mangler minutter i UTC-offset - Node sin
    // Date-parser gir stille "Invalid Date" (NaN) av det, ALDRI en feil - som igjen gjorde at
    // 60-dagers-sjekken under aldri klarte å ekskludere noe (NaN > 60 er false). Fant dette ved å
    // teste scriptet mot 2026-09-26-uttrekket: kontrakter som burde vært luket ut av datoregelen
    // (start_date over ett år unna created_at) slapp gjennom og ble stoppet av en helt annen,
    // urelatert sjekk (manglende leietaker-data) i stedet - ren flaks, ikke at regelen virket.
    const opprettet = new Date(c.created_at.replace(" ", "T").replace(/\+00$/, "+00:00"));
    const start = new Date(c.start_date);
    const dagerFraOpprettelse = Math.abs((start.getTime() - opprettet.getTime()) / 86400000);
    if (dagerFraOpprettelse > 60) continue;

    const linjer = linjerPerContract.get(c.contract_id) || [];
    const arsbelop = linjer.reduce((s, l) => s + l.total_yearly_price, 0);
    if (Math.round(arsbelop) === 0) continue; // administrativt tillegg, ikke ny leieavtale

    const kunde = kundeNavnPerContract.get(c.contract_id);
    if (!kunde) {
      console.warn(`ADVARSEL: fant ingen hovedleietaker for kontrakt ${c.contract_id} - hoppet over.`);
      continue;
    }
    const kvm = round1(linjer.reduce((s, l) => s + (arealPerRo.get(l.ro_id) || 0), 0));
    const leietype = utledLeietype(linjer.map((l) => l.description));
    ut.push({
      kunde,
      signeringsdato: c.created_at.slice(0, 10),
      startdato: c.start_date,
      arsbelop: round2(arsbelop),
      bygg: kanoniskBygg(c.property_name),
      kvm,
      leietype,
      sfUrl: null,
    });
  }
  ut.sort((a, b) => b.signeringsdato.localeCompare(a.signeringsdato));
  return ut;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

function nesteId(tekst) {
  const alle = [...tekst.matchAll(/id: "c(\d+)"/g)].map((m) => Number(m[1]));
  return Math.max(...alle) + 1;
}

function nesteDemokundeNummer(tekst) {
  const alle = [...tekst.matchAll(/Demokunde (\d+)/g)].map((m) => Number(m[1]));
  return Math.max(...alle) + 1;
}

function finnEksisterendeDemokunde(tekst, ektNavn) {
  // v1-forsøk (2026-09-26) matchet på RÅ linjeindeks - antok at widgets.local.ts og
  // widgets.anon.ts har identisk linjetall FØR CONTRACTS-arrayen. Det stemmer ikke (ulike
  // kommentarblokker/historikk i de to filene forskyver linjenumrene) - c1 lå på linje 200 i
  // local.ts, men linje 178 i anon.ts, så oppslaget traff en helt annen, tilfeldig rad og ga
  // "Demokunde 112" i stedet for den riktige "Demokunde 29". Matcher nå på den delte "cN"-IDen
  // (garantert samme i begge filer, se filhode-kommentaren i widgets.local.ts) i stedet for
  // linjeposisjon.
  const idTilKundeLocal = new Map(
    [...tekst.local.matchAll(/id: "(c\d+)", kunde: "([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );
  const idTilKundeAnon = new Map(
    [...tekst.anon.matchAll(/id: "(c\d+)", kunde: "([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );
  for (const [id, kunde] of idTilKundeLocal) {
    if (kunde === ektNavn) {
      const anonKunde = idTilKundeAnon.get(id);
      if (anonKunde) return anonKunde;
    }
  }
  return null;
}

function main() {
  const rawPath = process.argv[2];
  if (!rawPath) {
    console.error("Bruk: node scripts/build-new-contracts.js <sti-til-raw.json>");
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));
  const nye = beregnKontrakter(raw);
  console.log(`${raw.contracts.length} kontrakter i uttrekket, ${nye.length} kvalifiserer som nye reelle leieavtaler.`);

  let localTekst = fs.readFileSync(LOCAL_FILE, "utf8");
  let anonTekst = fs.readFileSync(ANON_FILE, "utf8");
  let id = nesteId(localTekst);
  let demokundeTeller = nesteDemokundeNummer(anonTekst);

  const localLinjer = [];
  const anonLinjer = [];
  for (const k of nye) {
    const idStr = `c${id++}`;
    localLinjer.push(
      `  { id: "${idStr}", kunde: "${k.kunde}", signeringsdato: "${k.signeringsdato}", startdato: "${k.startdato}", arsbelop: ${k.arsbelop}, bygg: "${k.bygg}", kvm: ${k.kvm}, leietype: "${k.leietype}", sfUrl: null },`,
    );
    let anonKunde = finnEksisterendeDemokunde({ local: localTekst, anon: anonTekst }, k.kunde);
    if (!anonKunde) {
      anonKunde = `Demokunde ${demokundeTeller++}` + (serOmSomSelskap(k.kunde) ? " AS" : "");
    }
    anonLinjer.push(
      `  { id: "${idStr}", kunde: "${anonKunde}", signeringsdato: "${k.signeringsdato}", startdato: "${k.startdato}", arsbelop: ${k.arsbelop}, bygg: "${k.bygg}", kvm: ${k.kvm}, leietype: "${k.leietype}", sfUrl: null },`,
    );
  }

  const dato = raw.hentetDato;
  localTekst = localTekst
    .replace(/export const CONTRACTS_SIST_OPPDATERT = "[\d-]+";/, `export const CONTRACTS_SIST_OPPDATERT = "${dato}";`)
    .replace(/(\n];\n\nexport type GuaranteeStatus)/, `\n${localLinjer.join("\n")}${"$1"}`);
  anonTekst = anonTekst
    .replace(/export const CONTRACTS_SIST_OPPDATERT = "[\d-]+";/, `export const CONTRACTS_SIST_OPPDATERT = "${dato}";`)
    .replace(/(\n];\n\nexport type GuaranteeStatus)/, `\n${anonLinjer.join("\n")}${"$1"}`);

  fs.writeFileSync(LOCAL_FILE, localTekst);
  fs.writeFileSync(ANON_FILE, anonTekst);
  console.log(`Lagt til ${nye.length} rader i begge filer, CONTRACTS_SIST_OPPDATERT satt til ${dato}.`);
  console.log("Husk: grep gjennom widgets.anon.ts etter ekte navn FØR commit (se ANONYMISERING.md).");
}

if (require.main === module) main();

module.exports = { beregnKontrakter, kanoniskBygg, utledLeietype, serOmSomSelskap };
