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
//   4. Kjør: node scripts/build-new-expiries.js scripts/refresh-data/utlop-<dato>-raw.json
//      scripts/refresh-data/utlop-<dato>-lines-raw.json (andre argumentet er valgfritt - uten det
//      hoppes erstattet-sjekken over og alle linjer regnes som reell eksponering).
//   5. Sjekk konsoll-outputen for leietakere scriptet IKKE fant en eksisterende
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

function beregnUtlop(raw, erstattetMap = new Map()) {
  const byTenant = new Map();
  for (const r of raw.rows) {
    if (!byTenant.has(r.customer_id)) byTenant.set(r.customer_id, { leietaker: r.leietaker, customerId: r.customer_id, lines: [] });
    byTenant.get(r.customer_id).lines.push(r);
  }

  const tenants = [...byTenant.values()].map((t) => {
    const totalArsleie = Math.round(t.lines.reduce((s, l) => s + l.total_arsleie, 0) * 100) / 100;
    const alleReforhandlet = t.lines.every((l) => l.reforhandlet);
    let status = alleReforhandlet ? "Reforhandlet" : "Ingen varsel";
    let statusKilde;
    const override = MANUELLE_STATUS_OVERRIDES[t.customerId];
    if (override) {
      status = override.status;
      statusKilde = override.statusKilde;
    }
    const nearestSlutt = t.lines.reduce((a, b) => (a.linje_slutt <= b.linje_slutt ? a : b)).linje_slutt;
    return {
      leietaker: t.leietaker,
      customerId: t.customerId,
      bygg: hovedbygg(t.lines),
      totalArsleie,
      status,
      statusKilde,
      nearestSlutt,
      lines: t.lines.map((l) => {
        const erstattetInfo = erstattetMap.get(l.linje_id);
        return {
          linjeId: l.linje_id,
          beskrivelse: l.linje_beskrivelse,
          bygg: l.bygg,
          arealtype: l.arealtype,
          leietype: l.leietype,
          slutt: l.linje_slutt,
          dagerTilUtlop: l.dager_til_utlop,
          totalArsleie: l.total_arsleie,
          reforhandlet: l.reforhandlet,
          nyKontraktsnokkel: l.ny_kontraktsnokkel,
          nyKontraktStart: l.ny_kontrakt_start,
          gapDager: l.gap_dager,
          erstattet: !!erstattetInfo,
          erstattesAvBeskrivelse: erstattetInfo?.beskrivelse,
          erstattesAvStart: erstattetInfo?.startdato,
        };
      }),
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
  if (!rawPath) {
    console.error("Bruk: node scripts/build-new-expiries.js <sti-til-raw.json> [sti-til-lines-raw.json]");
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
  const tenants = beregnUtlop(raw, erstattetMap);
  console.log(
    `${raw.rows.length} linjer, ${tenants.length} leietakere i uttrekket (${raw.aggregat.fra_dato} til ${raw.aggregat.til_dato}).`,
  );
  if (erstattetMap.size > 0) {
    console.log(`${erstattetMap.size} linje(r) er erstattet av en ny linje i samme kontrakt (se erstattet-feltet).`);
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

module.exports = { beregnUtlop, hovedbygg, serOmSomSelskap, detectErstattetLinjer, baseBeskrivelse };
