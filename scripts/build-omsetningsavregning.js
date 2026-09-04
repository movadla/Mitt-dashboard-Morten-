// Bygger Redis-snapshotet for "Omsetningsavregning" (forventet 2026-merleie for
// omsetningsbaserte leieforhold på CC Vest, dvs. Lilleakerveien 14 og 16).
//
// v5 (2026-09-04) - beregnes nå automatisk i stedet for et frosset datasett:
//   ekstrafakturering = MAX(0, omsetning × avtalt sats × andel av året − (fakturert + gjenstår))
//
// Kilder:
//  - Omsetning + sats: `refresh-data/omsetningsleie-cc-vest.json` (Mortens Omsetningsleie-fane,
//    manuelt oppdatert fra fenistra.net - rullerende 12 mnd). IKKE Fazile butikkomsetning.
//  - À konto-siden (fakturert + gjenstår 2026): REMAINING-snapshotet i Redis (v13, bokført NXT +
//    Fazile-fakturaplan) - samme tall som toppboksen, så avregningen kan ikke drifte fra
//    leietaker-tabellen. Kun KJERNELEIE regnes med (minimumsleie/omsetningsleie, konto
//    3630/3631), ikke lager/tillegg/kabinetter/garasje osv. - samme avgrensing som Amesto
//    bruker i sin "à konto leie" ved den faktiske avregningen.
//  - Kontraktsminimum 2026 (Fazile-linjenes årsverdi) brukes som GULV-KONTROLL: der
//    fakturert + gjenstår ligger under kontraktsminimum flagges `gulvavvik` - enten mangler
//    REMAINING noe, eller så er det gitt rabatt. Rettes i REMAINING, ikke her.
//  - 2025-fasit: `refresh-data/avregnet-omsetning-2025-amesto.json` (Amestos avregning) gir
//    omsetning 2025 og faktisk avregning 2025 pr. butikk, for sammenligning i drilldown.
//  - Koblingen butikk -> leietaker/bygg i REMAINING + evt. linjefilter, delt leieforhold og
//    Amesto-rad ligger i `refresh-data/omsetningsavregning-butikk-mapping.json` (gitignorert,
//    inneholder ekte navn). Nye butikker i Omsetningsleie-fanen må legges til der.
//
// Mekanisme å huske: CC Vest-kontraktene setter minimumsleie for året = realisert
// omsetningsleie året før. Derfor er forventet ≈ minimum for de fleste, og estimatet er svært
// følsomt for omsetningstallet - oppdater Omsetningsleie-fanen før hver innlevering.
//
// Kjør: node scripts/build-omsetningsavregning.js [--dry-run]

const fs = require("fs");
const path = require("path");
const { getFromRedis, pushToRedis } = require("./lib/refresh-helpers");

const OMSETNING_FILE = path.join(__dirname, "refresh-data", "omsetningsleie-cc-vest.json");
const MAPPING_FILE = path.join(__dirname, "refresh-data", "omsetningsavregning-butikk-mapping.json");
const AMESTO_FILE = path.join(__dirname, "refresh-data", "avregnet-omsetning-2025-amesto.json");
const REMAINING_HASH_KEY = "jobb:inntektsprognose-gjenstar-leietakere";
const REMAINING_FIELD = "snapshot";
const OUTPUT_HASH_KEY = "jobb:inntektsprognose-omsetningsavregning";
const OUTPUT_FIELD = "snapshot";

const AR = 2026;
// Fazile-linjebeskrivelser som utgjør kjerneleie for en omsetningsleietaker ...
const KJERNE_RE = /minimumsleie|omsetningsleie|omsetingsleie|omsetningsjustert|omsetningsbasert|leie handel|husleie/i;
// ... og tillegg som aldri er det, selv om de står på samme leieforhold.
const IKKE_KJERNE_RE = /lager|tillegg|garasje|parkering|antenne|pop.?up|konsern|kontor|utstillingsvindu|kjøkken|kabinett|basestasjon|uteareal/i;
// Konto-prefikser i REMAINING sin kontoFordelingDelA som er kjerneleie (inkl. den nøytraliserte
// avregnings-kreditnotaen, som REMAINING merker "3630 (kreditnota ...)").
const KJERNE_KONTI = ["3630", "3631"];
const GULVAVVIK_TERSKEL = 1000;

const round2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => Math.round(n).toLocaleString("nb-NO");
const normName = (s) =>
  s
    .toLowerCase()
    .replace(/[`'’´.,&/()-]/g, " ")
    .replace(/\b(as|a s|asa|cc vest|avd \d+|norge|drift|og|i)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Andel av 2026 leieforholdet er aktivt (tidligste start / seneste slutt blant kjernelinjene),
// i hele måneder. Brukes til å skalere forventet omsetningsleie for inn-/utflyttere.
function andelAvAr(linjer) {
  if (!linjer.length) return 1;
  const start = linjer.map((l) => l.startDato || `${AR}-01-01`).sort()[0];
  const slutt = linjer.map((l) => l.sluttDato || `${AR}-12-31`).sort().at(-1);
  const fra = start > `${AR}-01-01` ? Number(start.slice(5, 7)) : 1;
  const til = slutt < `${AR}-12-31` ? Number(slutt.slice(5, 7)) : 12;
  return Math.max(0, Math.min(12, til - fra + 1)) / 12;
}

function amestoRader(entry, rader) {
  if (Array.isArray(entry.amestoKontrakt)) return rader.filter((r) => entry.amestoKontrakt.includes(r.kontrakt));
  const toks = normName(entry.butikk).split(" ").filter((t) => t.length > 2);
  if (!toks.length) return [];
  let hits = rader.filter((r) => toks.every((t) => normName(r.kontrakt).includes(t)));
  if (!hits.length) hits = rader.filter((r) => normName(r.kontrakt).includes(toks[0]));
  return hits;
}

// Kjerneleie-tallene for én butikk i ett leieforhold/bygg i REMAINING.
function kjerneForButikk(entry, tenant, bg) {
  const alleA = tenant.lines.filter((l) => l.bygg === bg.bygg && l.del === "A");
  const inkluder = entry.inkluderLinjer ? new RegExp(entry.inkluderLinjer, "i") : null;
  const erKjerne = (l) => (KJERNE_RE.test(l.beskrivelse) && !IKKE_KJERNE_RE.test(l.beskrivelse)) || (inkluder && inkluder.test(l.beskrivelse));
  const kjerneAlle = alleA.filter(erKjerne);
  const filter = entry.linjeFilter ? new RegExp(entry.linjeFilter, "i") : null;
  const kjerne = filter ? kjerneAlle.filter((l) => filter.test(l.beskrivelse)) : kjerneAlle;

  const sum = (ls) => ls.reduce((s, l) => s + (l.fullArsverdi2026 || 0), 0);
  const totalA = sum(alleA);
  const kjerneArsverdi = sum(kjerne);
  const kjerneAlleArsverdi = sum(kjerneAlle);
  // Ved linjefilter (én leietaker, flere butikker) fordeles bokført kjerneleie etter årsverdi.
  const filterAndel = filter && kjerneAlleArsverdi > 0 ? kjerneArsverdi / kjerneAlleArsverdi : 1;

  const konti = [...KJERNE_KONTI, ...(entry.ekstraKjerneKonti || [])];
  const bokfortKjerne = (bg.kontoFordelingDelA || [])
    .filter((k) => konti.some((p) => String(k.konto).startsWith(p)))
    .reduce((s, k) => s + k.belop, 0);
  const fakturert = bokfortKjerne * filterAndel;
  const gjenstar = totalA > 0 ? (bg.gjenstarDelA || 0) * (kjerneArsverdi / totalA) : 0;

  return {
    fakturert,
    gjenstar,
    kontraktsminimum: kjerneArsverdi,
    andelAvAr: andelAvAr(kjerne),
    kjerneLinjer: kjerne.map((l) => l.beskrivelse.trim()),
    antallLinjerTotalt: alleA.length,
  };
}

async function main() {
  const oms = JSON.parse(fs.readFileSync(OMSETNING_FILE, "utf8"));
  const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, "utf8"));
  const amesto = JSON.parse(fs.readFileSync(AMESTO_FILE, "utf8"));
  const amestoRaderAlle = amesto.rader || amesto;
  const rem = await getFromRedis(REMAINING_HASH_KEY, REMAINING_FIELD);
  if (!rem || !Array.isArray(rem.tenants)) throw new Error("Fant ikke REMAINING-snapshotet i Redis - kjør build-remaining-summary.js først");

  const byButikk = new Map(mapping.butikker.map((e) => [e.butikk, e]));
  const rows = [];
  const advarsler = [];

  for (const b of oms.butikker) {
    const entry = byButikk.get(b.butikk);
    if (!entry) {
      advarsler.push(`${b.butikk}: mangler i mapping-fila - legg til`);
      continue;
    }
    const amRader = amestoRader(entry, amestoRaderAlle);
    const omsetning2025 = amRader.reduce((s, r) => s + (Number(r.omsetning2025) || 0), 0);
    const avregning2025 = amRader.reduce((s, r) => s + (Number(r.avregnetMerleie) || 0), 0);
    const akonto2025 = amRader.reduce((s, r) => s + (Number(r.akontoLeie) || 0), 0);

    const row = {
      butikk: b.butikk,
      bygg: entry.byggVisning,
      leietype: entry.leietype || "Minimumsleie",
      omsetningKorr: b.omsetningKorr,
      avtaltOmsProsent: b.avtaltOmsProsent,
      forventetOmsetningsleie: null,
      fakturertPlusGjenstar: null,
      ekstrafakturering: 0,
      matchStatus: "ikke-matchet i REMAINING",
      delerLeieforholdMed: [],
      fakturert2026: null,
      gjenstar2026: null,
      kontraktsminimum2026: null,
      gulvavvik: null,
      andelAvAr: 1,
      omsetning2025: omsetning2025 || null,
      avregning2025: amRader.length ? avregning2025 : null,
      akonto2025: akonto2025 || null,
      omsetningYoyPct: omsetning2025 > 0 ? round2(((b.omsetningKorr - omsetning2025) / omsetning2025) * 100) : null,
      remainingNavn: entry.remainingNavn,
      remainingStatus: null,
      kjerneLinjer: [],
      krevManuellSjekk: !!entry.krevManuellSjekk,
      kommentar: entry.kommentar || "",
      _gruppe: entry.gruppe || null,
      _kjerne: null,
    };

    if (entry.remainingNavn) {
      const tenant = rem.tenants.find((t) => t.navn === entry.remainingNavn);
      const bg = tenant && tenant.byggGrupper.find((g) => g.bygg === entry.bygg);
      if (!tenant || !bg) {
        advarsler.push(`${b.butikk}: "${entry.remainingNavn}" / ${entry.bygg} finnes ikke i REMAINING`);
        row.matchStatus = "ikke-matchet (mapping peker på leietaker/bygg som ikke finnes i REMAINING)";
      } else {
        const k = kjerneForButikk(entry, tenant, bg);
        if (!k.kjerneLinjer.length) advarsler.push(`${b.butikk}: ingen kjerneleie-linjer funnet hos ${tenant.navn} / ${bg.bygg}`);
        row._kjerne = k;
        row.remainingStatus = bg.status || null;
        row.kjerneLinjer = k.kjerneLinjer;
        row.andelAvAr = round2(k.andelAvAr);
        row.forventetOmsetningsleie = round2(b.omsetningKorr * b.avtaltOmsProsent * k.andelAvAr);
        row.fakturert2026 = round2(k.fakturert);
        row.gjenstar2026 = round2(k.gjenstar);
        row.kontraktsminimum2026 = round2(k.kontraktsminimum);
        row.matchStatus = entry.krevManuellSjekk
          ? "v5 automatisk - krever manuell sjekk (se kommentar)"
          : "v5 automatisk (REMAINING v13 + Omsetningsleie-fanen)";
        if (bg.delB && (bg.gjenstarDelB || bg.alleredeFakturertDelB)) advarsler.push(`${b.butikk}: har Del B-beløp som ikke regnes med`);
      }
    }
    rows.push(row);
  }

  // Butikker uten gruppe: F+G direkte. Butikker i samme gruppe deler ett leieforhold: F+G
  // beregnes én gang og fordeles etter forventet omsetningsleie, avregningen på gruppenivå.
  const grupper = new Map();
  for (const r of rows) {
    if (!r._kjerne) continue;
    if (!r._gruppe) {
      r.fakturertPlusGjenstar = round2(r.fakturert2026 + r.gjenstar2026);
      r.gulvavvik = round2(r.kontraktsminimum2026 - r.fakturertPlusGjenstar);
      r.ekstrafakturering = round2(Math.max(0, r.forventetOmsetningsleie - r.fakturertPlusGjenstar));
    } else {
      if (!grupper.has(r._gruppe)) grupper.set(r._gruppe, []);
      grupper.get(r._gruppe).push(r);
    }
  }
  for (const [navn, medl] of grupper) {
    const k = medl[0]._kjerne; // samme leieforhold -> samme tall for alle medlemmer
    const fg = k.fakturert + k.gjenstar;
    const forvSum = medl.reduce((s, r) => s + r.forventetOmsetningsleie, 0);
    const ekstra = Math.max(0, forvSum - fg);
    for (const r of medl) {
      const andel = forvSum > 0 ? r.forventetOmsetningsleie / forvSum : 1 / medl.length;
      r.fakturert2026 = round2(k.fakturert * andel);
      r.gjenstar2026 = round2(k.gjenstar * andel);
      r.kontraktsminimum2026 = round2(k.kontraktsminimum * andel);
      r.fakturertPlusGjenstar = round2(fg * andel);
      r.gulvavvik = round2((k.kontraktsminimum - fg) * andel);
      r.ekstrafakturering = round2(ekstra * andel);
      r.delerLeieforholdMed = medl.filter((x) => x !== r).map((x) => x.butikk);
      r.matchStatus += ` - delt leieforhold (${navn})`;
    }
  }
  for (const r of rows) {
    delete r._gruppe;
    delete r._kjerne;
  }

  const matchet = rows.filter((r) => r.fakturertPlusGjenstar !== null);
  const total = round2(matchet.reduce((s, r) => s + r.ekstrafakturering, 0));
  const gulv = matchet.filter((r) => r.gulvavvik > GULVAVVIK_TERSKEL);
  const manuell = rows.filter((r) => r.krevManuellSjekk);

  const snapshot = {
    sistOppdatert: new Date().toISOString().slice(0, 10),
    kilde: `Omsetning: ${oms.kilde} (hentet ${oms.hentetDato}). À konto: REMAINING v13 (${rem.sistOppdatert}, Fazile-plan ${rem.fazileFakturaplan?.uttrekksdato || "?"}). 2025: Amesto-avregning.`,
    buildingTurnoverNote:
      "v5: ekstrafakturering = MAX(0, omsetning × sats × andel av året − (fakturert + gjenstår kjerneleie)). Kjerneleie = minimumsleie/omsetningsleie (konto 3630/3631) fra REMAINING - lager, tillegg, kabinetter o.l. holdes utenfor, som i Amestos avregning. Kontraktsminimum (Fazile-årsverdi) er kun gulv-kontroll: positivt gulvavvik betyr at REMAINING ligger under kontrakten (mangler noe, eller rabatt). Minimumsleien på CC Vest settes hvert år lik fjorårets realiserte omsetningsleie, så estimatet er svært følsomt for omsetningstallet.",
    omsetningHentetDato: oms.hentetDato,
    remainingDato: rem.sistOppdatert,
    totalEkstrafakturering: total,
    antallButikker: rows.length,
    antallMatchet: matchet.length,
    antallIkkeMatchet: rows.length - matchet.length,
    antallUtelatt: 0,
    butikkerUtelatt: [],
    antallKrevManuellSjekk: manuell.length,
    antallGulvavvik: gulv.length,
    sumGulvavvik: round2(gulv.reduce((s, r) => s + r.gulvavvik, 0)),
    sumForventet: round2(matchet.reduce((s, r) => s + r.forventetOmsetningsleie, 0)),
    sumFakturertPlusGjenstar: round2(matchet.reduce((s, r) => s + r.fakturertPlusGjenstar, 0)),
    sumAvregning2025: round2(rows.reduce((s, r) => s + (r.avregning2025 || 0), 0)),
    butikker: rows.sort((a, b) => b.ekstrafakturering - a.ekstrafakturering || a.butikk.localeCompare(b.butikk, "nb")),
  };

  console.log(`Butikker: ${rows.length} (matchet=${matchet.length}, ikke matchet=${rows.length - matchet.length})`);
  console.log(`Forventet omsetningsleie: ${fmt(snapshot.sumForventet)} | F+G kjerne: ${fmt(snapshot.sumFakturertPlusGjenstar)} | avregning 2025 (Amesto): ${fmt(snapshot.sumAvregning2025)}`);
  console.log(`Sum avregning 2026: ${fmt(total)} kr (${matchet.filter((r) => r.ekstrafakturering > 0).length} butikker > 0)`);
  for (const r of matchet.filter((r) => r.ekstrafakturering > 0)) {
    console.log(`  ${r.butikk.padEnd(30)} ${fmt(r.ekstrafakturering).padStart(10)}  (forv ${fmt(r.forventetOmsetningsleie)}, F+G ${fmt(r.fakturertPlusGjenstar)}${r.andelAvAr < 1 ? `, ${Math.round(r.andelAvAr * 12)}/12 mnd` : ""})`);
  }
  if (gulv.length) {
    console.log(`\nGULVAVVIK (F+G under kontraktsminimum, ${gulv.length} stk, sum ${fmt(snapshot.sumGulvavvik)}):`);
    for (const r of gulv.sort((a, b) => b.gulvavvik - a.gulvavvik)) console.log(`  ${r.butikk.padEnd(30)} ${fmt(r.gulvavvik).padStart(10)}  (min ${fmt(r.kontraktsminimum2026)}, F+G ${fmt(r.fakturertPlusGjenstar)}, status ${r.remainingStatus})`);
  }
  if (manuell.length) console.log(`\nKREVER MANUELL SJEKK: ${manuell.map((r) => `${r.butikk} (${fmt(r.ekstrafakturering)})`).join(", ")}`);
  if (advarsler.length) console.log(`\nADVARSLER:\n  ${advarsler.join("\n  ")}`);

  if (process.argv.includes("--dry-run")) {
    const ut = path.join(__dirname, "refresh-data", "omsetningsavregning-snapshot.json");
    fs.writeFileSync(ut, JSON.stringify(snapshot, null, 2));
    console.log(`\n--dry-run: ikke lagret i Redis, skrevet til ${ut}`);
    return;
  }
  return pushToRedis(OUTPUT_HASH_KEY, OUTPUT_FIELD, snapshot, "omsetningsavregning-snapshot.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
