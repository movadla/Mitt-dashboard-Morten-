// Bygger Redis-snapshotet for "Kontrakter som utløper i 2026" (ny fane i
// Inntektsprognose, bygget 2026-08-24 etter Morten sitt spørsmål: "hvor mye
// utgjør kontrakter som løper ut ila. 2026 hvis de fornyes?").
//
// Kilde: Fazile MCP-verktøyet mcp__claude_ai_Fazile_intern__kontraktsutlop.
// Hent på nytt slik (uten scope = hele porteføljen, ingen øvre grense når
// inkluder_utlopte=true dekker hele 2026):
//   fra_dato: "2026-01-01", maneder_frem: 12, inkluder_utlopte: true, max_rader: 5000
// (Siden scriptet uansett filtrerer til linje_slutt >= i dag, er fra_dato = i dag og
// maneder_frem = antall måneder igjen av året ekvivalent og gir et langt mindre svar -
// brukt 2026-09-05: fra_dato "2026-09-05", maneder_frem 4, 455 rader.)
// Lagre RAW JSON-resultatet (objektet med "rows"-arrayet) som
// scripts/refresh-data/kontraktsutlop-raw-full.json - IKKE forhåndsfiltrer, dette
// scriptet gjør all filtrering/gruppering selv (repeterbart, se ANONYMISERING.md
// om hvorfor løse dump-filer i refresh-data/ er gitignored).
//
// Metodikk:
// - Filtrerer til linjer med linje_slutt i kalenderåret 2026 OG total_arsleie > 0
//   (0-kr-linjer er ofte felleskostnad-detaljlinjer uten egen verdi - støy).
// - Grupperer til KONTRAKT-nivå (leietaker + kontraktsnokkel), ikke linjenivå - én
//   kontrakt kan ha flere linjer (husleie, FK, parkering) som utløper samme dag.
// - "reforhandlet" (fra verktøyet, via contract.renewed_contract_id): kontrakten er
//   allerede sikret med en ny, aktiv/signert etterfølger - IKKE reell eksponering.
// - "reell eksponering" = åpne (ikke reforhandlede) kontrakter - dette er beløpet
//   som faktisk står på spill hvis de IKKE fornyes, altså komplementet til
//   spørsmålet "hvor mye utgjør de HVIS de fornyes" (som er totalsummen, se under).
//
// "Ekstra i 2026 hvis fornyet" (Morten, 2026-08-24): REMAINING/prognosetotalen
// (685,2 mill kr) teller Fazile sin arsleie_nok KUN frem til kontraktens faktiske
// sluttdato i 2026 - INGEN antagelse om fornyelse. For en ÅPEN (ikke reforhandlet)
// linje er derfor dagene fra dagen ETTER linje_slutt til 2026-12-31 ikke med i
// prognosen i det hele tatt. ekstraI2026 = (total_arsleie/365) × gjenværende dager
// - dette er beløpet som IKKE er i de 685,2 mill kr, og som blir reell ekstra
// 2026-inntekt HVIS (og bare hvis) leietaker faktisk fornyer til samme sats.
// Reforhandlede linjer får ekstraI2026=0 - den nye kontrakten er allerede en egen
// linje i Fazile og dermed allerede talt med i prognosetotalen.
//
// EIERANDEL (rettet 2026-08-24): kontraktsutlop-verktøyet auto-halverer IKKE for
// Strandveien 4-8/10/Lilleakerveien 20-22, i motsetning til rent_roll/leietakerliste
// (bekreftet: `eierandel`-feltet i rådata er 1 for ALLE rader). Fant 4 linjer (2
// leietakere på Strandveien 4-8) som IKKE var halvert - overstatte totalArsleie/
// reell eksponering med ca. 272 663 kr og ekstraI2026 med ca. 48 256 kr før denne fiksen.
// Halveres nå PER LINJE via den delte lib/data/ownership-shares.json (samme kilde som
// build-nxt-budget.js), FØR gruppering til kontrakt-nivå.
//
// Kjør: node scripts/build-contract-expiry-2026.js

const fs = require("fs");
const path = require("path");
const { loadEnvLocal, pushToRedis, getFromRedis, loadOwnershipShares, andelForBygg, normalizeName } = require("./lib/refresh-helpers");

const RAW_FILE = path.join(__dirname, "refresh-data", "kontraktsutlop-raw-full.json");
const REDIS_HASH_KEY = "jobb:inntektsprognose-kontraktsutlop-2026";
const REDIS_FIELD = "snapshot";
const REMAINING_HASH_KEY = "jobb:inntektsprognose-gjenstar-leietakere";
const REMAINING_FIELD = "snapshot";
const AR = 2026;
const AR_START = new Date(`${AR}-01-01T00:00:00Z`);
const AR_SLUTT = new Date(`${AR}-12-31T00:00:00Z`);

// v2 (2026-08-29, Morten): denne fila hentet råttall UTEN å filtrere bort felleskostnader/
// markedsbidrag/energi/eiendomsskatt/administrasjonsbidrag/driftsavtale/parkering-garasje - alt
// dette er allerede ekskludert fra "leieinntekter" (Del A) i build-remaining-summary.js (samme
// regex-sett, duplisert her - se der for full begrunnelse/historikk pr. kategori). Denne fila
// skal vise "det samme som leietakerlisten", så samme eksklusjon må gjelde her.
const PARKERING_LINJE_REGEX = /garasje|parkering|\bparking\b/i;
const MARKEDSBIDRAG_REGEX = /markedsf.ringsbidrag|markedsbidrag/i;
const FELLESKOST_KANTINE_REGEX = /^à konto felleskost|^felleskost|kantinebidrag|^kantine(\s|$)|canteen contribution/i;
const ENERGI_REGEX = /energi|energy|electric|electrisity|ladestrøm|strøm/i;
const EIENDOMSSKATT_REGEX = /eiendomsskatt|eiendomskatt|property tax/i;
const ADMINISTRASJONSBIDRAG_REGEX = /administrasjonsbidrag/i;
const DRIFTSAVTALE_REGEX = /driftsavtale|vaktmester/i;
const SD_ANLEGG_REGEX = /sd.?anlegg/i;
function erKjerneleieLinje(beskrivelse) {
  const b = (beskrivelse || "").trim();
  if (PARKERING_LINJE_REGEX.test(b)) return false;
  if (MARKEDSBIDRAG_REGEX.test(b)) return false;
  if (FELLESKOST_KANTINE_REGEX.test(b)) return false;
  if (ENERGI_REGEX.test(b)) return false;
  if (EIENDOMSSKATT_REGEX.test(b)) return false;
  if (ADMINISTRASJONSBIDRAG_REGEX.test(b)) return false;
  if (DRIFTSAVTALE_REGEX.test(b)) return false;
  if (SD_ANLEGG_REGEX.test(b)) return false;
  return true;
}

function ekstraI2026ForLinje(linjeSlutt, totalArsleie, reforhandlet) {
  if (reforhandlet) return 0;
  const slutt = new Date(`${linjeSlutt}T00:00:00Z`);
  const dagerEtter = Math.max(0, Math.round((AR_SLUTT - slutt) / 86400000));
  return (totalArsleie / 365) * dagerEtter;
}

async function main() {
  loadEnvLocal();
  const raw = JSON.parse(fs.readFileSync(RAW_FILE, "utf8"));
  const shares = loadOwnershipShares();
  // v2 (2026-08-29, Morten): "denne listen må gjelde kontrakter med utløp fra i dag og ut resten
  // av året" - eksempel Jernia, som allerede er reforhandlet men fortsatt dukket opp fordi
  // status-baserte "reforhandlet"-deteksjonen har hull. Datofilter (linje_slutt >= i dag) er en
  // robust sperre UAVHENGIG av om status-feltet er korrekt - en linje som allerede er utløpt er
  // uansett ikke lenger en fremtidig reforhandlings-beslutning. I DAG regnes dynamisk (ikke en
  // hardkodet dato), så scriptet forblir riktig neste gang det kjøres.
  const I_DAG_ISO = new Date().toISOString().slice(0, 10);
  const rows = (raw.rows || []).filter(
    (r) =>
      r.linje_slutt >= I_DAG_ISO &&
      r.linje_slutt <= `${AR}-12-31` &&
      r.total_arsleie > 0 &&
      erKjerneleieLinje(r.linje_beskrivelse),
  );

  // Manuelt bekreftede tilfeller der en kontrakt ER reelt reforhandlet, men Fazile sitt eget
  // "reforhandlet"-flagg (contract.renewed_contract_id) ikke har fanget det opp ennå - typisk en
  // ALLEREDE SIGNED_BY_BOTH_PARTIES etterfølgerkontrakt som ikke er formelt LENKET til den gamle
  // kontrakten i Fazile sin egen masterdata (2026-08-29, Erco Lighting-funn: WN1289 -> FA0929).
  // Uten dette ville "ekstraI2026" her DOBBELTELLE samme beløp som allerede er lagt direkte inn i
  // REMAINING sin fullA via MANGLENDE_LINJE_KORREKSJON i build-remaining-summary.js - én gang som
  // reelt fakturert/gjenstår, én gang til som hypotetisk "hvis reforhandlet"-ekstra.
  const MANUELT_BEKREFTET_REFORHANDLET = new Map([
    ["WN1289", "FA0929"],
    // Møllefossen Cafe AS (2026-08-29, funnet ved å lete etter FLERE tilfeller av samme
    // dobbelttellingsmønster som Erco Lighting): NY8348 sin "Husleie avg.pl."-linje (101 081
    // kr/år, Lilleakerveien 2E, slutt 2026-10-18) er identisk i beløp med etterfølgeren -
    // kontrakt_id 135963 sin "Minimumsleie avg.pl. Eventlokale" (samme 101 081 kr/år, start
    // 2026-10-19 - dagen etter) i _additions-signed-not-active-2026-08-26.json, som allerede er
    // lagt inn i REMAINING sin fullA. Uten denne ville NY8348 sin ekstraI2026 (okt19-des31)
    // dobbelttalt akkurat den samme perioden.
    ["NY8348", "135963 (kontrakt_id, ikke-lenket fornyelse)"],
    // Follestad Trend AS (2026-08-29, funnet etter en fullstendig historisk rent_roll-henting):
    // DB5766 (kontrakt_id 81665) sin "Minimumsleie avg.pl. - 2"-linje slutter 2026-11-22, men
    // SAMME kontrakt_id har en ALLEREDE AVTALT "- 3"-linje (3 299 925,65 kr/år, en pre-avtalt
    // trinnvis leieøkning - IKKE en ny forhandling) fra 2026-11-23 til 2029-12-31. Denne var
    // usynlig for kontraktsutlop-uttrekket vårt fordi linjens EGEN sluttdato (2029) faller
    // utenfor "utløper i 2026"-vinduet - men den er allerede lagt inn i REMAINING sin fullA
    // (siden rent_roll fanger den uavhengig av dette vinduet). Uten denne ville ekstraI2026
    // dobbelttalt nov23-des31.
    ["DB5766", "81665, linje '- 3' (samme kontrakt, pre-avtalt trinnleie, ikke ny forhandling)"],
    // Scandinavian Cosmetics AS (2026-08-30, funnet under "reforhandling"-gjennomgangen): QN1867
    // (kontrakt_id 82130, Lilleakerveien 10, "Husleie avg.pl." m.fl., slutt 2026-08-31) har en
    // ulenket etterfølger - kontrakt_id 138800, "Husleie avg.pl." 1 986 400 kr/år, start
    // 2026-09-01 (dagen etter) - bekreftet direkte mot Fazile sin contract_line-tabell samme dag
    // (se [[project_income-forecast-gjenstar-topplevel-audit-2026-08-30]]), allerede lagt inn i
    // REMAINING sin fullA via en ny rad i fazile-remaining-tenants/Lilleakerveien-10-E.json. Uten
    // denne ville QN1867 sin ekstraI2026 (sep-des, ~822 848 kr) dobbelttalt samme periode.
    ["QN1867", "138800 (kontrakt_id, ikke-lenket fornyelse)"],
    // Revisjon 2026-09-04 av hele utløpslisten (se
    // [[project_income-forecast-contract-expiry-audit-2026-09-04]]): to ulenkede etterfølgere til.
    // RS9012 (kontrakt_id 82058, Lilleakerveien 8, slutt 2026-09-30): etterfølger 138409 fra
    // 2026-10-01 (SIGNED_BY_BOTH_PARTIES, husleie 1 200 000 kr/år) ligger allerede i REMAINING
    // (gjenstår 300 000 = 3/12) - ekstraI2026 okt-des ville dobbelttalt.
    ["RS9012", "138409 (kontrakt_id, ikke-lenket fornyelse)"],
    // UC8685 (Vollsveien 13B/13C, slutt 2026-11-30): leietakeren flytter til Vollsveien 17 på ny
    // kontrakt 127844 (start 2026-09-04, SIGNED_BY_BOTH_PARTIES, 2 028 695 kr/år minus rabatt),
    // som allerede ligger i REMAINING som egen byggGruppe (gjenstår ~500 800). Relokasjon innen
    // samme eiendom, ikke fornyelse av 13B/13C - ekstraI2026 des ville dobbelttalt. 60 %-signalet
    // i jobb:inntektsprognose-signaler gjaldt denne avtalen før den ble signert.
    ["UC8685", "127844 (kontrakt_id, relokasjon til Vollsveien 17, ikke-lenket)"],
  ]);

  // Mustad sine egne selskaper som "leietaker" er internleie (samme sett som INTERN_MUSTAD_NAMES i
  // build-remaining-summary.js) - aldri et reforhandlingspotensial. Fjernes helt fra listen
  // (2026-09-04: Mustad Eiendomsdrift ON2603, 12 704 kr lå inne som potensial).
  const INTERN_MUSTAD_NAMES = new Set(["mustad eiendom as", "mustad eiendomsdrift as"]);

  let antallEierandelKorrigert = 0;
  const groups = new Map();
  for (const r of rows) {
    if (INTERN_MUSTAD_NAMES.has(normalizeName(r.leietaker))) continue;
    const andel = r.bygg ? andelForBygg(r.bygg, shares) : 1;
    if (andel !== 1) antallEierandelKorrigert++;
    const totalArsleie = r.total_arsleie * andel;
    const manueltBekreftetNy = MANUELT_BEKREFTET_REFORHANDLET.get(r.kontraktsnokkel);
    const erReforhandlet = r.reforhandlet || Boolean(manueltBekreftetNy);

    const key = `${r.leietaker}||${r.kontraktsnokkel}`;
    if (!groups.has(key)) {
      groups.set(key, {
        leietaker: r.leietaker,
        kontraktsnokkel: r.kontraktsnokkel,
        byggSet: new Set(),
        totalArsleie: 0,
        minSlutt: r.linje_slutt,
        maxSlutt: r.linje_slutt,
        status: "apen",
        nyKontraktsnokkel: null,
        ekstraI2026: 0,
        lines: [],
      });
    }
    const g = groups.get(key);
    g.totalArsleie += totalArsleie;
    if (r.bygg && r.bygg !== "(ukjent bygg)") g.byggSet.add(r.bygg);
    if (r.linje_slutt < g.minSlutt) g.minSlutt = r.linje_slutt;
    if (r.linje_slutt > g.maxSlutt) g.maxSlutt = r.linje_slutt;
    if (erReforhandlet) {
      g.status = "reforhandlet";
      g.nyKontraktsnokkel = manueltBekreftetNy || r.ny_kontraktsnokkel;
    }
    const ekstraLinje = ekstraI2026ForLinje(r.linje_slutt, totalArsleie, erReforhandlet);
    g.ekstraI2026 += ekstraLinje;
    g.lines.push({
      linjenokkel: r.linjenokkel,
      linjeBeskrivelse: r.linje_beskrivelse,
      arealtype: r.arealtype,
      linjeSlutt: r.linje_slutt,
      totalArsleie,
      ekstraI2026: Math.round(ekstraLinje * 100) / 100,
    });
  }
  if (antallEierandelKorrigert > 0) {
    console.log(`Eierandel-korrigert: ${antallEierandelKorrigert} linjer halvert (Strandveien 4-8/10, Lilleakerveien 20/22).`);
  }

  const contracts = [...groups.values()]
    .map((g) => ({
      leietaker: g.leietaker,
      kontraktsnokkel: g.kontraktsnokkel,
      bygg: [...g.byggSet].join(", ") || "(ukjent bygg)",
      totalArsleie: Math.round(g.totalArsleie * 100) / 100,
      minSlutt: g.minSlutt,
      maxSlutt: g.maxSlutt,
      status: g.status,
      nyKontraktsnokkel: g.nyKontraktsnokkel,
      ekstraI2026: Math.round(g.ekstraI2026 * 100) / 100,
      lines: g.lines,
      muligAlleredeDekket: null, // fylles under
    }))
    .sort((a, b) => b.totalArsleie - a.totalArsleie);

  // v2 (2026-08-29, Morten - "tenk som en inntektskontroller"): varsel når leietakeren allerede
  // har fakturert MER i 2026 enn det kontraktens egen sluttdato skulle tilsi - kan bety at
  // ekstraI2026 dobbelttelles mot en allerede realisert engangs-/dobbel-kvartal-betaling
  // (bekreftet mønster for Follestad Trend AS tidligere i dag, Omsetningsavregning-arbeidet).
  // Enkelt-byggforhold sjekkes direkte (unngår bygg-navn-alias-fellen "Lilleakerveien 16"
  // (Fazile) vs. "CC Vest Senter" (NXT) som ellers ville skjult nettopp Follestad Trend);
  // fler-byggforhold krever et bygg-navn-treff, ellers IKKE flagget (konservativt - unngår
  // falske positiver fra multi-bygg-leietakere, se filhode).
  const remaining = await getFromRedis(REMAINING_HASH_KEY, REMAINING_FIELD);
  let antallFlagget = 0;
  if (remaining) {
    const remainingByNavn = new Map(remaining.tenants.map((t) => [normalizeName(t.navn), t]));
    for (const c of contracts) {
      if (c.status !== "apen" || c.ekstraI2026 <= 0) continue;
      const t = remainingByNavn.get(normalizeName(c.leietaker));
      if (!t) continue;
      const reelleGrupper = t.byggGrupper.filter((bg) => bg.status !== "intern-mustad");
      let faktiskFakturert = null;
      if (reelleGrupper.length === 1) {
        faktiskFakturert = reelleGrupper[0].alleredeFakturertDelA;
      } else if (reelleGrupper.length > 1) {
        const kontraktBygg = c.bygg.split(",").map((b) => normalizeName(b.trim()));
        const treff = reelleGrupper.filter((bg) => kontraktBygg.includes(normalizeName(bg.bygg)));
        if (treff.length > 0) faktiskFakturert = treff.reduce((s, bg) => s + bg.alleredeFakturertDelA, 0);
      }
      if (faktiskFakturert === null) continue;
      const sluttDato = new Date(`${c.maxSlutt}T00:00:00Z`);
      const daysThroughEnd = Math.round((sluttDato - AR_START) / 86400000) + 1;
      const forventetGjennomSlutt = c.totalArsleie * (daysThroughEnd / 365);
      if (faktiskFakturert > forventetGjennomSlutt * 1.1) {
        c.muligAlleredeDekket = {
          faktiskFakturert: Math.round(faktiskFakturert * 100) / 100,
          forventetGjennomSlutt: Math.round(forventetGjennomSlutt * 100) / 100,
          overskudd: Math.round((faktiskFakturert - forventetGjennomSlutt) * 100) / 100,
        };
        antallFlagget++;
      }
    }
  } else {
    console.warn("ADVARSEL: fant ikke REMAINING-snapshot - kunne ikke sjekke mulig dobbelttelling (muligAlleredeDekket forblir null for alle).");
  }
  if (antallFlagget > 0) console.log(`Flagget ${antallFlagget} kontrakt(er) som mulig allerede dekket av tidligere fakturering.`);

  const totalArsleie = contracts.reduce((sum, c) => sum + c.totalArsleie, 0);
  const reforhandlet = contracts.filter((c) => c.status === "reforhandlet");
  const apen = contracts.filter((c) => c.status === "apen");
  const reforhandletArsleie = reforhandlet.reduce((sum, c) => sum + c.totalArsleie, 0);
  const reellEksponeringArsleie = apen.reduce((sum, c) => sum + c.totalArsleie, 0);
  const totalEkstraI2026 = contracts.reduce((sum, c) => sum + c.ekstraI2026, 0);

  // Aggregat pr. leietaker av "ekstra i 2026 hvis fornyet" - Morten ba eksplisitt om
  // dette listet opp pr leietaker (én leietaker kan ha flere kontrakter/bygg som
  // hver bidrar til ekstraI2026).
  const perLeietakerMap = new Map();
  for (const c of contracts) {
    if (c.ekstraI2026 <= 0) continue;
    if (!perLeietakerMap.has(c.leietaker)) perLeietakerMap.set(c.leietaker, { leietaker: c.leietaker, ekstraI2026: 0, kontrakter: [] });
    const p = perLeietakerMap.get(c.leietaker);
    p.ekstraI2026 += c.ekstraI2026;
    p.kontrakter.push({ kontraktsnokkel: c.kontraktsnokkel, bygg: c.bygg, maxSlutt: c.maxSlutt, ekstraI2026: c.ekstraI2026 });
  }
  const ekstraI2026PerLeietaker = [...perLeietakerMap.values()]
    .map((p) => ({ ...p, ekstraI2026: Math.round(p.ekstraI2026 * 100) / 100 }))
    .sort((a, b) => b.ekstraI2026 - a.ekstraI2026);

  const snapshot = {
    sistOppdatert: new Date().toISOString().slice(0, 10),
    ar: AR,
    totalArsleie: Math.round(totalArsleie * 100) / 100,
    reforhandletArsleie: Math.round(reforhandletArsleie * 100) / 100,
    reellEksponeringArsleie: Math.round(reellEksponeringArsleie * 100) / 100,
    totalEkstraI2026: Math.round(totalEkstraI2026 * 100) / 100,
    antallKontrakter: contracts.length,
    antallReforhandlet: reforhandlet.length,
    antallApen: apen.length,
    contracts,
    ekstraI2026PerLeietaker,
  };

  console.log(`Kontrakter som utløper i ${AR}: ${snapshot.antallKontrakter}`);
  console.log(`  Total årsleie: ${snapshot.totalArsleie}`);
  console.log(`  Reforhandlet (sikret): ${snapshot.antallReforhandlet} stk, ${snapshot.reforhandletArsleie} kr`);
  console.log(`  Åpen (reell eksponering): ${snapshot.antallApen} stk, ${snapshot.reellEksponeringArsleie} kr`);
  console.log(`  Ekstra i 2026 hvis alle åpne fornyes: ${snapshot.totalEkstraI2026} (${ekstraI2026PerLeietaker.length} leietakere)`);

  return pushToRedis(REDIS_HASH_KEY, REDIS_FIELD, snapshot, "kontraktsutlop-2026-snapshot.json");
}

main();
