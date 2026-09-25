// Erstatter HELE EXPIRIES-arrayen i lib/widgets.local.ts og lib/widgets.anon.ts med et ferskt
// uttrekk fra Fazile sitt kontraktsutlop-verktøy. I motsetning til build-new-contracts.js (som
// APPENDER nye rader) er dette en full erstatning: Utløpsliste er et rullerende 30-dagersvindu,
// ikke en kumulativ historikk - forrige uttrekk er rett og slett ikke lenger "de neste 30 dagene".
//
// VIKTIG: dette scriptet henter ALDRI data selv - Fazile er kun tilgjengelig via MCP-verktøy i en
// Claude-økt, ikke via et frittstående API-kall. Prosedyren for NESTE runde:
//
//   1. Kjør (i en Claude-økt, med Fazile-MCP lastet): mcp__claude_ai_Fazile_intern__kontraktsutlop
//      med maneder_frem=1 (default), hele porteføljen (ingen bygg-/leietaker-filter).
//   2. Lagre HELE rå-resultatet ({rows, aggregat, chart, warnings}) i
//      scripts/refresh-data/utlop-<dato>-raw.json (gitignored, trygt for ekte navn).
//   3. ERSTATTET-LINJE-SJEKK (2026-09-25, se detectErstattetLinjer under for hvorfor): hent ut de
//      unike kontrakt_id-verdiene fra rows, og kjør (maks 100 om gangen, se
//      fazile_graphql_query-feilmelding):
//        contract_lines(first: 500, filter: { c_id: { in: [<kontrakt_id-ene>] } }) {
//          items { cl_id c_id parent_line_id description type start_date end_date total_yearly_price }
//        }
//      Lagre `items`-lista i scripts/refresh-data/utlop-<dato>-lines-raw.json som { "items": [...] }.
//      (parent_line_id viste seg IKKE å være satt på noen av kandidatene testet 2026-09-25 - stol på
//      beskrivelse+dato-matchen i detectErstattetLinjer, ikke på det feltet.)
//   4. KONTRAKTS-ETTERFØLGER-SJEKK (2026-09-25, se detectKontraktEtterfolger under): hent ut de
//      unike customer_id-verdiene fra rows, og kjør:
//        contract_customers(first: 200, filter: { customer_id: { in: [<customer_id-ene>] },
//          customer_type: { eq: "TENANT" }, main: { eq: true } }) { items { contract_id customer_id } }
//      Ta alle unike contract_id fra resultatet (maks 100 om gangen) og kjør:
//        contracts(first: 200, filter: { contract_id: { in: [<contract_id-ene>] } }) {
//          items { contract_id key status start_date end_date renewed_contract_id }
//        }
//      Lagre begge i scripts/refresh-data/utlop-<dato>-contracts-raw.json som
//      { "contractCustomers": [[contract_id, customer_id], ...], "contracts": [...] }.
//   5. Kjør: node scripts/build-new-expiries.js scripts/refresh-data/utlop-<dato>-raw.json
//      scripts/refresh-data/utlop-<dato>-lines-raw.json scripts/refresh-data/utlop-<dato>-contracts-raw.json
//      (andre og tredje argument er valgfrie - uten dem hoppes hhv. erstattet- og
//      kontrakts-etterfølger-sjekken over).
//   6. Sjekk konsoll-outputen for leietakere scriptet IKKE fant en eksisterende
//      Demokunde-tildeling for - vurder manuelt om navnet er en privatperson (ingen org-suffiks)
//      eller et selskap, scriptet gjetter konservativt (se serOmSomSelskap), men kjenner ikke
//      navn det ikke har sett før.
//   6. Status (Reforhandlet/Terminert/Mulig endring/Reforhandling pågår/Ingen varsel) er IKKE i
//      Fazile-uttrekket for de fleste linjer - default er "Reforhandlet" hvis ALLE linjer for
//      leietakeren har reforhandlet=true fra Fazile selv (ekte, kryssjekket mot ny kontraktsnøkkel),
//      ellers "Ingen varsel". Manuelle unntak (kjente saker uten Fazile-flagg ennå, f.eks. muntlig
//      bekreftet reforhandling) legges i MANUELLE_STATUS_OVERRIDES nedenfor - IKKE i selve
//      datafilene, slik at de overlever neste kjøring av dette scriptet uendret.
//
// Anonymisering: gjenbruker et eksisterende Demokunde-nummer i to trinn - (1) samme Fazile
// customer_id finnes fra FØR i EXPIRIES-arrayen som blir erstattet (mest pålitelig - se
// 2026-09-25-kommentaren i widgets.anon.ts for hvorfor customer_id, i motsetning til
// RECEIVABLES sine r-IDer, faktisk ER stabilt mellom de to filene og over tid), (2) samme
// kundenavn finnes i CONTRACTS-arrayen (matchet via delt "cN"-ID, samme mønster som
// build-new-contracts.js). Finner scriptet ingen av delene, får kunden et FERSKT Demokunde-nummer.
//
// ERSTATTET-LINJER (2026-09-25): Morten flagget at kontraktsutlop-verktøyets reforhandlet-flagg
// kun ser på KONTRAKT-nivå etterfølgere (contract.renewed_contract_id) - en linje som utløper
// fordi SAMME kontrakt får en NY linje som viderefører saken (typisk Kantinebidrag, som Fazile
// reindekserer etter antall ansatte - "(38)" kan bli "(20)", tallet er en ansatt-terskel, ikke et
// versjonsnummer) blir ikke fanget opp. Bekreftet reelt 2026-09-25: 5 av 110 linjer (3 av 30
// leietakere - SGM Technology AS, Scandinavian Cosmetics AS, Pandion Energy AS) hadde en
// nystartet linje i SAMME kontrakt med samme beskrivelse (uten (N)-suffiks) dagen etter. For to av
// de tre leietakerne var dette den ENESTE linjen deres - uten denne sjekken hadde de fremstått som
// reell risiko i lista når de i realiteten bare fortsetter uendret.
//
// UOFFISIELL KONTRAKTS-ETTERFØLGER (2026-09-25, se detectKontraktEtterfolger): Morten spurte
// eksplisitt om kontrakter kan være reforhandlet UTEN at Fazile sitt eget renewed_contract_id-felt
// er satt. Verifisert reelt for Corvita AS (kontrakt 82058/RS9012, slutt 2026-09-30): en ny,
// SIGNED_BY_BOTH_PARTIES-kontrakt (138866/TU9305) for SAMME kunde starter 2026-10-01, men har
// renewed_contract_id=null - et reelt hull i Fazile sin egen datafangst, ikke i metoden vår.
// Sjekket GRUNDIG mot alle 30 leietakere 2026-09-25 (se scripts/refresh-data/utlop-2026-09-25-
// contracts-raw.json): kun Corvita AS hadde dette gapet. Norcap AS og Erco Lighting Ab Norsk
// Filial NUF SÅ ut til å ha samme problem ved første/naive sjekk, men viste seg begge å være
// korrekt fanget opp av den OFFISIELLE mekanismen (en søsken-kontrakt peker riktig TILBAKE via
// renewed_contract_id) - retningen på den koblingen er lett å sjekke feil vei, se
// detectKontraktEtterfolger. De resterende ~22 leietakerne har INGEN kontrakt (signert eller
// under forhandling) i Fazile som starter i nærheten av utløpsdatoen - enten reelt på vei ut,
// eller en forhandling som ikke er formalisert i Fazile ennå (som Lyreco, se
// MANUELLE_STATUS_OVERRIDES). Denne sjekken finner IKKE sistnevnte - det krever et Salesforce-
// søk per leietaker, ikke gjort 2026-09-25, ikke automatisert i dette scriptet.

const fs = require("fs");
const path = require("path");

const LOCAL_FILE = path.join(__dirname, "..", "lib", "widgets.local.ts");
const ANON_FILE = path.join(__dirname, "..", "lib", "widgets.anon.ts");

const ORG_SUFFIKS_REGEX = /\b(AS|ASA|DA|ANS|BA|NUF|ENK|SA|KS)\b/i;
function serOmSomSelskap(navn) {
  return ORG_SUFFIKS_REGEX.test(navn);
}

// Kjente unntak der Fazile sitt reforhandlet-flagg ennå ikke reflekterer virkeligheten
// (se prosedyre-kommentaren over). Nøkkel = Fazile customer_id.
const MANUELLE_STATUS_OVERRIDES = {
  67122: {
    status: "Reforhandling pågår",
    statusKilde:
      "Morten (bekreftet muntlig, se prosjektnotat 2026-09-04/24): reforhandling er avtalt, ny kontrakt ikke signert i Fazile ennå.",
  },
};

function esc(s) {
  return String(s).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function hovedbygg(lines) {
  const kandidater = lines.filter((l) => l.bygg !== "(ukjent bygg)");
  if (kandidater.length === 0) return "(ukjent bygg)";
  return kandidater.reduce((a, b) => (b.total_arsleie > a.total_arsleie ? b : a)).bygg;
}

function baseBeskrivelse(d) {
  // Strips et evt. avsluttende "(N)" - det tallet er en ansatt-terskel for Kantinebidrag
  // (eller lignende reindekserte linjer), ikke en del av selve saksbeskrivelsen.
  return d.replace(/\s*\(\d+\)\s*$/, "").trim();
}

// Finner linjer som utløper fordi SAMME kontrakt får en ny linje som viderefører saken (se
// filhode-kommentaren for hvorfor kontraktsutlop-verktøyets reforhandlet-flagg ikke fanger dette).
// contractLines = alle contract_lines for de samme kontraktene som rows (steg 3 i prosedyren).
// Returnerer Map<linje_id, {beskrivelse, startdato}> for linjer som er erstattet.
function detectErstattetLinjer(rows, contractLines) {
  const erstattet = new Map();
  if (!contractLines || contractLines.length === 0) return erstattet;

  const linjerPerContract = new Map();
  for (const l of contractLines) {
    if (!linjerPerContract.has(l.c_id)) linjerPerContract.set(l.c_id, []);
    linjerPerContract.get(l.c_id).push(l);
  }

  for (const r of rows) {
    const soskenLinjer = linjerPerContract.get(r.kontrakt_id) || [];
    const base = baseBeskrivelse(r.linje_beskrivelse);
    const sluttDato = new Date(r.linje_slutt);
    for (const s of soskenLinjer) {
      if (s.cl_id === r.linje_id) continue;
      if (baseBeskrivelse(s.description) !== base) continue;
      const startDato = new Date(s.start_date);
      const diffDager = (startDato - sluttDato) / 86400000;
      // Etterfølgeren må starte PÅ eller RETT ETTER at denne linjen slutter (0-5 dager) - en
      // etterfølger som starter måneder/år unna er sannsynligvis noe annet (feilaktig treff på
      // en generisk beskrivelse som "Husleie avg.pl." som går igjen i mange, urelaterte linjer).
      if (diffDager >= 0 && diffDager <= 5) {
        erstattet.set(r.linje_id, { beskrivelse: s.description, startdato: s.start_date });
        break;
      }
    }
  }
  return erstattet;
}

// Finner kontrakter som er reelt reforhandlet uten at Fazile sitt eget renewed_contract_id-felt
// er satt på etterfølgeren (se filhode-kommentaren for hvorfor - bekreftet reelt for Corvita AS).
// contractCustomers = [[contract_id, customer_id], ...], contracts = rå contract-rader (steg 4).
// Returnerer Map<kontrakt_id, {nyKontraktsnokkel, nyKontraktStart, gapDager}> for kontrakter med en
// slik uoffisiell etterfølger. Kontrakter der Fazile ALLEREDE har koblingen riktig (en søsken-
// kontrakt peker TILBAKE via renewed_contract_id) er IKKE med her - de er allerede reforhandlet=true
// på linjenivå fra kontraktsutlop-verktøyet selv, og skal ikke telles/vises to ganger.
function detectKontraktEtterfolger(rows, contractCustomers, contracts) {
  const etterfolger = new Map();
  if (!contractCustomers || !contracts) return etterfolger;

  const contractById = new Map(contracts.map((c) => [c.contract_id, c]));
  const byCustomer = new Map();
  for (const [contractId, customerId] of contractCustomers) {
    if (!byCustomer.has(customerId)) byCustomer.set(customerId, []);
    byCustomer.get(customerId).push(contractId);
  }

  const alleredeSjekket = new Set();
  for (const r of rows) {
    const kontraktId = r.kontrakt_id;
    if (alleredeSjekket.has(kontraktId) || r.reforhandlet) continue; // Fazile fant den allerede
    alleredeSjekket.add(kontraktId);

    const kontrakt = contractById.get(kontraktId);
    if (!kontrakt) continue;
    const sosken = byCustomer.get(r.customer_id) || [];

    // Er kontrakten allerede den OFFISIELLE etterfølgeren til noe (renewed_contract_id peker ut fra
    // den), er den ikke selv utløpende i reell forstand - urelatert her, hopp over.
    const harOffisiellEtterfolger = sosken.some((sid) => {
      const s = contractById.get(sid);
      return s && s.renewed_contract_id === kontraktId && (s.status === "ACTIVE" || s.status === "SIGNED_BY_BOTH_PARTIES");
    });
    if (harOffisiellEtterfolger) continue;

    let beste = null;
    for (const sid of sosken) {
      if (sid === kontraktId) continue;
      const s = contractById.get(sid);
      if (!s || s.status === "EXPIRED" || s.renewed_contract_id) continue;
      const gapDager = Math.round((new Date(s.start_date) - new Date(kontrakt.end_date)) / 86400000);
      // Samme vindu som detectErstattetLinjer, men noe romsligere (45 dager) - kontrakts-signering
      // kan administrativt henge noen uker etter linje-nivå-fornyelser som skjer månedlig.
      if (gapDager >= -5 && gapDager <= 45) {
        if (!beste || Math.abs(gapDager) < Math.abs(beste.gapDager)) beste = { key: s.key, start: s.start_date, gapDager };
      }
    }
    if (beste) etterfolger.set(kontraktId, { nyKontraktsnokkel: beste.key, nyKontraktStart: beste.start, gapDager: beste.gapDager });
  }
  return etterfolger;
}

function beregnUtlop(raw, erstattetMap = new Map(), kontraktEtterfolgerMap = new Map()) {
  const byTenant = new Map();
  for (const r of raw.rows) {
    if (!byTenant.has(r.customer_id)) byTenant.set(r.customer_id, { leietaker: r.leietaker, customerId: r.customer_id, lines: [] });
    byTenant.get(r.customer_id).lines.push(r);
  }

  const tenants = [...byTenant.values()].map((t) => {
    const totalArsleie = Math.round(t.lines.reduce((s, l) => s + l.total_arsleie, 0) * 100) / 100;
    const nearestSlutt = t.lines.reduce((a, b) => (a.linje_slutt <= b.linje_slutt ? a : b)).linje_slutt;

    const linjer = t.lines.map((l) => {
      const erstattetInfo = erstattetMap.get(l.linje_id);
      const uoffisiellEtterfolger = !l.reforhandlet ? kontraktEtterfolgerMap.get(l.kontrakt_id) : undefined;
      const reforhandlet = l.reforhandlet || !!uoffisiellEtterfolger;
      return {
        linjeId: l.linje_id,
        beskrivelse: l.linje_beskrivelse,
        bygg: l.bygg,
        arealtype: l.arealtype,
        leietype: l.leietype,
        slutt: l.linje_slutt,
        dagerTilUtlop: l.dager_til_utlop,
        totalArsleie: l.total_arsleie,
        reforhandlet,
        nyKontraktsnokkel: l.ny_kontraktsnokkel ?? uoffisiellEtterfolger?.nyKontraktsnokkel,
        nyKontraktStart: l.ny_kontrakt_start ?? uoffisiellEtterfolger?.nyKontraktStart,
        gapDager: l.gap_dager ?? uoffisiellEtterfolger?.gapDager,
        erstattet: !!erstattetInfo,
        erstattesAvBeskrivelse: erstattetInfo?.beskrivelse,
        erstattesAvStart: erstattetInfo?.startdato,
      };
    });

    // VIKTIG: leses fra de KORRIGERTE linjene (linjer), ikke rå t.lines - ellers overses en
    // uoffisiell kontrakts-etterfølger her selv om selve linje-feltet over er riktig rettet
    // (fant dette 2026-09-25: Corvita AS fikk reforhandlet:true på alle 5 linjer, men status ble
    // stående som "Ingen varsel" fordi denne sjekket den URØRTE rå-arrayen).
    const alleReforhandlet = linjer.every((l) => l.reforhandlet);
    let status = alleReforhandlet ? "Reforhandlet" : "Ingen varsel";
    let statusKilde;
    const override = MANUELLE_STATUS_OVERRIDES[t.customerId];
    if (override) {
      status = override.status;
      statusKilde = override.statusKilde;
    }
    return {
      leietaker: t.leietaker,
      customerId: t.customerId,
      bygg: hovedbygg(t.lines),
      totalArsleie,
      status,
      statusKilde,
      nearestSlutt,
      lines: linjer,
    };
  });

  tenants.sort((a, b) => a.nearestSlutt.localeCompare(b.nearestSlutt));
  return tenants;
}

function renderLine(l) {
  let s = `      { linjeId: ${l.linjeId}, beskrivelse: "${esc(l.beskrivelse)}", bygg: "${esc(l.bygg)}", arealtype: "${esc(l.arealtype)}", leietype: "${esc(l.leietype)}", slutt: "${l.slutt}", dagerTilUtlop: ${l.dagerTilUtlop}, totalArsleie: ${l.totalArsleie}, reforhandlet: ${l.reforhandlet}`;
  if (l.reforhandlet && l.nyKontraktsnokkel) {
    s += `, nyKontraktsnokkel: "${esc(l.nyKontraktsnokkel)}", nyKontraktStart: "${l.nyKontraktStart}"`;
    if (l.gapDager !== null && l.gapDager !== undefined) s += `, gapDager: ${l.gapDager}`;
  }
  if (l.erstattet) {
    s += `, erstattet: true, erstattesAvBeskrivelse: "${esc(l.erstattesAvBeskrivelse)}", erstattesAvStart: "${l.erstattesAvStart}"`;
  }
  s += " },";
  return s;
}

function renderTenant(t, leietaker) {
  let out = `  {\n    leietaker: "${esc(leietaker)}", customerId: ${t.customerId}, bygg: "${esc(t.bygg)}", totalArsleie: ${t.totalArsleie},\n`;
  out += `    status: "${t.status}",\n`;
  if (t.statusKilde) out += `    statusKilde: "${esc(t.statusKilde)}",\n`;
  out += "    lines: [\n";
  out += t.lines.map(renderLine).join("\n") + "\n";
  out += "    ],\n";
  out += "  },";
  return out;
}

// Trinn 1: gjenbruk fra EXPIRIES-arrayen som blir erstattet, matchet på Fazile customer_id
// (stabilt mellom local/anon OG over tid - se filhode-kommentaren).
function byggIdTilAnonFraGamleExpiries(gammelLocalTekst, gammelAnonTekst) {
  const lokal = new Map(
    [...gammelLocalTekst.matchAll(/leietaker: "([^"]+)", customerId: (\d+),/g)].map((m) => [Number(m[2]), m[1]]),
  );
  const anon = new Map(
    [...gammelAnonTekst.matchAll(/leietaker: "([^"]+)", customerId: (\d+),/g)].map((m) => [Number(m[2]), m[1]]),
  );
  const idTilAnonNavn = new Map();
  for (const [customerId, anonNavn] of anon) {
    if (lokal.has(customerId)) idTilAnonNavn.set(customerId, anonNavn);
  }
  return idTilAnonNavn;
}

// Trinn 2 (fallback): gjenbruk fra CONTRACTS-arrayen, matchet på delt "cN"-ID (samme mønster
// som finnEksisterendeDemokunde i build-new-contracts.js).
function byggNavnTilAnonFraContracts(localTekst, anonTekst) {
  const idTilKundeLocal = new Map([...localTekst.matchAll(/id: "(c\d+)", kunde: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const idTilKundeAnon = new Map([...anonTekst.matchAll(/id: "(c\d+)", kunde: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const navnTilAnonNavn = new Map();
  for (const [id, kunde] of idTilKundeLocal) {
    const anonKunde = idTilKundeAnon.get(id);
    if (anonKunde) navnTilAnonNavn.set(kunde, anonKunde);
  }
  return navnTilAnonNavn;
}

function nesteDemokundeNummer(tekst) {
  const alle = [...tekst.matchAll(/Demokunde (\d+)/g)].map((m) => Number(m[1]));
  return Math.max(...alle) + 1;
}

function main() {
  const rawPath = process.argv[2];
  const linesRawPath = process.argv[3];
  const contractsRawPath = process.argv[4];
  if (!rawPath) {
    console.error(
      "Bruk: node scripts/build-new-expiries.js <sti-til-raw.json> [sti-til-lines-raw.json] [sti-til-contracts-raw.json]",
    );
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));
  let erstattetMap = new Map();
  if (linesRawPath) {
    const linesRaw = JSON.parse(fs.readFileSync(linesRawPath, "utf8"));
    erstattetMap = detectErstattetLinjer(raw.rows, linesRaw.items);
  } else {
    console.warn("Ingen lines-raw.json oppgitt - hopper over erstattet-linje-sjekken (se filhode-kommentaren).");
  }
  let kontraktEtterfolgerMap = new Map();
  if (contractsRawPath) {
    const contractsRaw = JSON.parse(fs.readFileSync(contractsRawPath, "utf8"));
    kontraktEtterfolgerMap = detectKontraktEtterfolger(raw.rows, contractsRaw.contractCustomers, contractsRaw.contracts);
  } else {
    console.warn("Ingen contracts-raw.json oppgitt - hopper over kontrakts-etterfølger-sjekken (se filhode-kommentaren).");
  }
  const tenants = beregnUtlop(raw, erstattetMap, kontraktEtterfolgerMap);
  console.log(
    `${raw.rows.length} linjer, ${tenants.length} leietakere i uttrekket (${raw.aggregat.fra_dato} til ${raw.aggregat.til_dato}).`,
  );
  if (erstattetMap.size > 0) {
    console.log(`${erstattetMap.size} linje(r) er erstattet av en ny linje i samme kontrakt (se erstattet-feltet).`);
  }
  if (kontraktEtterfolgerMap.size > 0) {
    console.log(`${kontraktEtterfolgerMap.size} kontrakt(er) har en uoffisiell etterfølger Fazile ikke selv koblet.`);
  }

  let localTekst = fs.readFileSync(LOCAL_FILE, "utf8");
  let anonTekst = fs.readFileSync(ANON_FILE, "utf8");

  const gammelLocalMatch = localTekst.match(/export const EXPIRIES: ExpiringTenant\[\] = \[[\s\S]*?\n\];/);
  const gammelAnonMatch = anonTekst.match(/export const EXPIRIES: ExpiringTenant\[\] = \[[\s\S]*?\n\];/);
  if (!gammelLocalMatch || !gammelAnonMatch) {
    console.error("Fant ikke EXPIRIES-arrayen i en av filene - avbryter uten å skrive noe.");
    process.exit(1);
  }

  const idTilAnonFraGammel = byggIdTilAnonFraGamleExpiries(gammelLocalMatch[0], gammelAnonMatch[0]);
  const navnTilAnonFraContracts = byggNavnTilAnonFraContracts(localTekst, anonTekst);
  let demokundeTeller = nesteDemokundeNummer(anonTekst);

  const ikkeGjenfunnet = [];
  const localBlokker = [];
  const anonBlokker = [];
  for (const t of tenants) {
    localBlokker.push(renderTenant(t, t.leietaker));

    let anonNavn = idTilAnonFraGammel.get(t.customerId) || navnTilAnonFraContracts.get(t.leietaker);
    if (!anonNavn) {
      anonNavn = `Demokunde ${demokundeTeller++}` + (serOmSomSelskap(t.leietaker) ? " AS" : "");
      ikkeGjenfunnet.push(t.leietaker);
    }
    anonBlokker.push(renderTenant(t, anonNavn));
  }

  const nyLocalArray = `export const EXPIRIES: ExpiringTenant[] = [\n${localBlokker.join("\n")}\n];`;
  const nyAnonArray = `export const EXPIRIES: ExpiringTenant[] = [\n${anonBlokker.join("\n")}\n];`;

  localTekst = localTekst.replace(gammelLocalMatch[0], nyLocalArray);
  anonTekst = anonTekst.replace(gammelAnonMatch[0], nyAnonArray);

  localTekst = localTekst.replace(
    /export const EXPIRIES_WINDOW = \{ fraDato: "[\d-]+", tilDato: "[\d-]+" \};/,
    `export const EXPIRIES_WINDOW = { fraDato: "${raw.aggregat.fra_dato}", tilDato: "${raw.aggregat.til_dato}" };`,
  );
  anonTekst = anonTekst.replace(
    /export const EXPIRIES_WINDOW = \{ fraDato: "[\d-]+", tilDato: "[\d-]+" \};/,
    `export const EXPIRIES_WINDOW = { fraDato: "${raw.aggregat.fra_dato}", tilDato: "${raw.aggregat.til_dato}" };`,
  );

  fs.writeFileSync(LOCAL_FILE, localTekst);
  fs.writeFileSync(ANON_FILE, anonTekst);
  console.log(`Skrev ${tenants.length} leietakere til begge filer, EXPIRIES_WINDOW satt til ${raw.aggregat.fra_dato}–${raw.aggregat.til_dato}.`);
  if (ikkeGjenfunnet.length > 0) {
    console.log(
      `\nIngen tidligere Demokunde-tildeling funnet for ${ikkeGjenfunnet.length} leietaker(e) - fikk et FERSKT nummer. Sjekk manuelt om selskapsgjetningen (org-suffiks) er riktig:`,
    );
    for (const navn of ikkeGjenfunnet) console.log(`  - ${navn}`);
  }
  console.log("\nHusk: grep gjennom widgets.anon.ts etter ekte navn FØR commit (se ANONYMISERING.md).");
}

if (require.main === module) main();

module.exports = {
  beregnUtlop,
  hovedbygg,
  serOmSomSelskap,
  detectErstattetLinjer,
  baseBeskrivelse,
  detectKontraktEtterfolger,
};
