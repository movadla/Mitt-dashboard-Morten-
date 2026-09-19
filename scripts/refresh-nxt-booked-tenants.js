// Bygger og oppdaterer Redis-snapshotet for Inntektsprognose > "Bokført per leietaker".
//
// DETTE SCRIPTET GJØR IKKE SELVE DATAHENTINGEN — det kan det ikke, siden NXT-tilgangen går
// gjennom Claude sin interaktive MCP-tilkobling (samme mønster som all annen NXT/Fazile-data
// i denne appen, se ANONYMISERING.md og CLAUDE.md). Når Morten ber om et nytt øyeblikksbilde:
//
// 1. Be Claude hente på nytt: for hvert av de 9 aktive selskapene (Mustad Eiendom AS 2397991,
//    Fåbro Eiendom AS 4489957, Lilleaker Næring AS 4507424, Lilleaker Sentrum AS 4495995,
//    Lilleakerveien 14 AS 5732083, Lilleakerveien 32B AS 4898918, Mustadboliger AS 4489956,
//    Strandveien 10 AS 4489969, Strandveien 4-8 AS 4489967) kjør via
//    mcp__claude_ai_Visma_BNXT__businessnxt-execute_graphql_query:
//
//    query TenantDrilldown($cid: Int!) {
//      useCompany(no: $cid) {
//        generalLedgerTransaction(
//          filter: { _and: [
//            { accountNo: { _gte: 3600 } }
//            { accountNo: { _lte: 3699 } }
//            { year: { _eq: <ÅR> } }
//          ] }
//          groupBy: [{ customerNo: DEFAULT }, { accountNo: DEFAULT }, { orgUnit3: DEFAULT }]
//          orderBy: [{ customerNo: ASC }, { orgUnit3: ASC }, { accountNo: ASC }]
//          first: 2000
//        ) {
//          items { customerNo accountNo orgUnit3 aggregates { sum { postedAmountDomestic } } }
//        }
//      }
//    }
//
//    MERK: ingen customerNo-filter denne gangen (i motsetning til første runde) - customerNo=0
//    tas med og får navnet "Andre (bokført uten leietakerreferanse)" i tenantNames, se under.
//    Hvis responsen blir for stor (skjer for Mustad Eiendom AS), lagre til fil og kjør en
//    engangs node-kommando som trekker ut kun customerNo/accountNo/orgUnit3/beløp til en
//    kompakt CSV/JSON - se historikken i git for eksempel (commit som la til dette scriptet).
//
// 1b. OBLIGATORISK ved HVER kjøring (lagt til v63, 2026-09-19, Morten: "kan det lages en regel
//     for å sikre dette automatisk?"): steg 1 sin generalLedgerTransaction-spørring er GRUPPERT
//     og har derfor ingen bilagstekst - det gjør at ad-hoc møterom-/auditorium-/lokalutleie
//     (konto 3650) som deler byggkode med en leietakers ordinære kontorleie, kan bli summert inn
//     i "allerede fakturert" for feil leieforhold uten at noen merker det (se v63-notatet i
//     build-remaining-summary.js for hele funnet). Siden datahentingen uansett er manuell/
//     interaktiv (kan ikke skedule-automatiseres, se toppen av denne filen), er "automatisk" her:
//     gjør denne sjekken til en FAST, gjentakende del av SAMME oppskrift, ikke en engangs-
//     undersøkelse - da fanges nye tilfeller opp av seg selv hver gang steg 1 uansett kjøres på
//     nytt, uten at noen må huske å tenke på det spesifikt.
//
//     For HVERT av de 9 selskapene (samme liste som steg 1 - ikke bare de som hadde treff sist
//     gang, et NYTT selskap kan begynne å fakturere møterom når som helst), kjør:
//
//     query MoteromDetalj($cid: Int!) {
//       useCompany(no: $cid) {
//         generalLedgerTransaction(
//           filter: { _and: [
//             { accountNo: { _eq: 3650 } }
//             { year: { _eq: <ÅR> } }
//             { _or: [
//               { text: { _like: "%øterom%" } }
//               { text: { _like: "%uditor%" } }
//               { text: { _like: "%okalutleie%" } }
//             ] }
//           ] }
//           orderBy: [{ customerNo: ASC }, { orgUnit3: ASC }]
//           first: 200
//         ) {
//           items { customerNo orgUnit3 postedAmountDomestic text voucherDate }
//         }
//       }
//     }
//
//     Skriv treffene (kun for selskap med treff - de fleste vil returnere tomt) til
//     scripts/refresh-data/nxt-moterom-detalj/<companyNo>.json, SAMME fasong som filene der i
//     dag: { companyNo, selskap, sistOppdatert, ar, kilde, transaksjoner: [{ customerNo, orgUnit3,
//     belop (sign-flippet, IKKE ta -postedAmountDomestic direkte - se eksisterende filer), text,
//     voucherDate: "YYYY-MM-DD" }] }. Oppdater deretter
//     scripts/refresh-data/nxt-moterom-detalj/meta.json (sistOppdatert, sjekketSelskaper,
//     selskaperMedTreff). build-remaining-summary.js leser denne mappen automatisk - ingen
//     kodeendring nødvendig for et nytt treff, kun den ferske JSON-filen.
//
// 2. Hent leietakernavn separat (billigere, samme spørring men groupBy KUN customerNo, med
//    joinup_Associate_via_Customer { name }) - se samme fil for mønsteret.
//
// 3. Hent bygg-navn: gjenbruk BOOKED_3600_3699 sin perSelskap[].bygg-liste i
//    lib/incomeForecast.local.ts (samme orgUnit3 → navn-mapping, endres sjelden).
//
// 4. Skriv resultatet per selskap til scripts/refresh-data/nxt-booked-tenants/<companyNo>.json
//    med denne fasongen (se README.md i samme mappe):
//    {
//      "selskap": "Mustad Eiendom AS",
//      "buildings": { "16": "CC Vest Senter", ... },
//      "tenantNames": { "10105": "Black Cat Kaffe og Tehus AS", "0": "Andre (bokført uten leietakerreferanse)", ... },
//      "lines": [ { "customerNo": 10105, "accountNo": 3630, "orgUnit3": 16, "belop": -256739.42 }, ... ]
//    }
//    "belop" er RÅTALLET fra NXT (kredit/negativt = inntekt) - scriptet under snur fortegn.
//
// 5. Oppdater scripts/refresh-data/nxt-booked-tenants/meta.json: { "sistOppdatert": "YYYY-MM-DD", "ar": 2026 }
//
// 6. VIKTIG - EIERANDEL (lagt til 2026-08-24): Fåbro Eiendom AS (4489957), Strandveien 10 AS
//    (4489969) og Strandveien 4-8 AS (4489967) er 50 %-eide, men bokfører 100 % av
//    leieinntekten i sitt eget NXT-regnskap (verifisert kvantitativt mot Fazile sin halverte
//    rent_roll-verdi for kjente leietakere - se REMAINING sin metodikk-kommentar i
//    lib/incomeForecast.local.ts). Halver derfor ALLE "belop"-verdier i disse 3 selskapenes
//    filer FØR steg 7, f.eks.:
//      for (const f of ["4489957.json","4489967.json","4489969.json"]) {
//        const d = JSON.parse(fs.readFileSync(dir+"/"+f));
//        for (const l of d.lines) l.belop = Math.round(l.belop*0.5*100)/100;
//        fs.writeFileSync(dir+"/"+f, JSON.stringify(d, null, 2));
//      }
//    Sjekk om Fazile/NXT har fikset dette oppstrøms før du kjører på nytt - hvis de 3
//    selskapenes egne tall allerede reflekterer 50 %, IKKE halver på nytt (dobbelthalvering).
//
// 7. Kjør: node scripts/refresh-nxt-booked-tenants.js
//
// Scriptet grupperer leietakere PÅ TVERS av selskaper (normalisert navn, ikke customerNo -
// customerNo er selskaps-scoped i NXT, samme fysiske leietaker kan ha ulike numre i ulike
// selskaper). Se prosjekt-minnet "income-forecast-rebuild-roadmap" for full bakgrunn.
//
// ETTER at dette scriptet er kjørt (Redis er oppdatert): dump snapshotet til
// scripts/refresh-data/booked-tenants-snapshot.json (brukes av scripts/build-remaining-summary.js):
//   node -e "const Redis=require('ioredis');const r=new Redis(process.env.REDIS_URL);
//   r.hget('jobb:inntektsprognose-bokfort-leietakere','snapshot').then(v=>{require('fs')
//   .writeFileSync('scripts/refresh-data/booked-tenants-snapshot.json',v);r.disconnect();})"
// (last inn REDIS_URL fra .env.local først, se loadEnvLocal() under for mønsteret)

const fs = require("fs");
const path = require("path");
const Redis = require(path.join(__dirname, "..", "node_modules", "ioredis"));

const DATA_DIR = path.join(__dirname, "refresh-data", "nxt-booked-tenants");
const ENV_LOCAL = path.join(__dirname, "..", ".env.local");
const REDIS_HASH_KEY = "jobb:inntektsprognose-bokfort-leietakere";
const REDIS_FIELD = "snapshot";

function loadEnvLocal() {
  if (!fs.existsSync(ENV_LOCAL)) return;
  for (const line of fs.readFileSync(ENV_LOCAL, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function main() {
  loadEnvLocal();

  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Fant ikke ${DATA_DIR}. Se toppen av dette scriptet for hvordan input-filene skal se ut.`);
    process.exit(1);
  }

  const meta = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "meta.json"), "utf8"));
  const companyFiles = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json") && f !== "meta.json");
  if (companyFiles.length === 0) {
    console.error(`Ingen selskapsfiler funnet i ${DATA_DIR}.`);
    process.exit(1);
  }

  const tenants = new Map(); // normalisert navn -> { navn, lines: [] }
  let totalBelop = 0;

  for (const file of companyFiles) {
    const company = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
    for (const line of company.lines) {
      const rawName = company.tenantNames[String(line.customerNo)];
      if (!rawName) throw new Error(`Mangler navn for customerNo ${line.customerNo} i ${company.selskap} (${file})`);
      const bygg = company.buildings[String(line.orgUnit3)];
      if (!bygg) throw new Error(`Mangler bygg-navn for orgUnit3 ${line.orgUnit3} i ${company.selskap} (${file})`);

      const belop = -line.belop; // sign-flip: kredit/negativt i rådata = inntekt, vises positivt
      const key = normalizeName(rawName);
      if (!tenants.has(key)) tenants.set(key, { navn: rawName, lines: [] });
      tenants.get(key).lines.push({
        selskap: company.selskap,
        accountNo: line.accountNo,
        bygg,
        belop: Math.round(belop * 100) / 100,
      });
      totalBelop += belop;
    }
  }

  const tenantList = [...tenants.values()]
    .map((t) => ({
      navn: t.navn,
      totalBelop: Math.round(t.lines.reduce((s, l) => s + l.belop, 0) * 100) / 100,
      lines: t.lines.sort((a, b) => b.belop - a.belop),
    }))
    .sort((a, b) => b.totalBelop - a.totalBelop);

  const snapshot = {
    sistOppdatert: meta.sistOppdatert,
    ar: meta.ar,
    kontoFra: 3600,
    kontoTil: 3699,
    totalBelop: Math.round(totalBelop * 100) / 100,
    antallLeietakere: tenantList.length,
    tenants: tenantList,
  };

  const sumTenantTotals = tenantList.reduce((s, t) => s + t.totalBelop, 0);
  const diff = Math.abs(sumTenantTotals - snapshot.totalBelop);
  console.log(`Bygget snapshot: ${tenantList.length} leietakere, ${tenantList.reduce((s, t) => s + t.lines.length, 0)} linjer, totalt ${snapshot.totalBelop} kr`);
  console.log(`Avstemming: sum leietaker-totaler = ${sumTenantTotals.toFixed(2)}, differanse = ${diff.toFixed(2)}`);

  if (!process.env.REDIS_URL) {
    console.log("REDIS_URL ikke satt - hopper over Redis-push.");
    fs.writeFileSync(path.join(DATA_DIR, "..", "nxt-booked-tenants-snapshot.json"), JSON.stringify(snapshot, null, 2));
    return;
  }

  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  redis
    .hset(REDIS_HASH_KEY, REDIS_FIELD, JSON.stringify(snapshot))
    .then(() => {
      console.log(`Lagret i Redis under ${REDIS_HASH_KEY} / ${REDIS_FIELD}`);
      redis.disconnect();
    })
    .catch((err) => {
      console.error("Redis-feil:", err);
      process.exit(1);
    });
}

main();
