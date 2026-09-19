// Bygger Leieinntekter/Parkering-tabellene som Inntektsprognose-hovedvisningen bruker, i tre
// parallelle grupperinger pr. Del: Leietaker | Bygg | Leietype. Alle med samme kolonner
// (Fakturert | Gjenstår | Budsjett | +/-) og - viktigst - alle Del A-grupperinger summerer til
// NØYAKTIG samme totalsum (bekreftet med Morten 2026-08-25, etter at budsjett-totalen ikke
// stemte med hans forventede ~725 mnok). v2 av det som var en ren leietaker-tabell.
//
// v3 (2026-08-26): Del B (parkering) har INGEN pr.-rad-budsjett lenger (Morten: "Parkering er
// budsjettert kun på en totallinje, så den sammenlignes bare mot alt som er ført på
// parkeringkonto(er) og gjenstår å fakturere på parkeringslinjer") - hver Del B-rad får nå
// budsjett=null/avvik=null (vises som "—" i UI, se `budsjett: number | null` i
// lib/tenantForecastTable.ts), og en egen `delBBudsjettTotal`-verdi eksporteres for at UI-en kan
// vise ÉN samlet Totalt-rad (budsjett vs. SUM av fakturert+gjenstår på tvers av alle
// parkeringsleietakere/-bygg/-leietyper), uavhengig av hvilken gruppering som er valgt.
//
// Kilde 1: jobb:inntektsprognose-gjenstar-leietakere (build-remaining-summary.js) - fakturert
// + gjenstår pr. leietaker, allerede Del A/B-splittet pr. byggGruppe (gjenstarDelA/DelB der er
// POST-korreksjon - IKKE regn ut gjenstår på nytt her, bruk feltene direkte).
// Kilde 2: jobb:inntektsprognose-leietaker-budsjett (build-tenant-budget.js v5) - Del A-budsjett
// i tre grupperinger (leietaker/bygg/leietype), hver med en "Avstemmingsdifferanse"-rad (kun
// ~1,4 mill kr / 0,2 % - IKKE en matchefeil, se filhode der) som gjør at budsjett-summen alltid
// er nøyaktig lik den offisielle totalen (665 780 066 kr). Del B-grupperingene er tomme arrays
// der - kun `totalDelB` (58 970 570,16 kr) brukes, se v3-avsnitt over.
//
// LEIETYPE FOR FAKTURERT/GJENSTÅR: REMAINING sine linjer har ingen leietype-kategori direkte
// (kun fritekst-beskrivelse). Klassifiserer her med enkle nøkkelord (kontorleie/minimumsleie/
// lagerleie/garasje/parkering - dekker de klare tilfellene), med fallback til samme
// bygg+beskrivelse->leietype-oppslag som budsjett-scriptet allerede har bygget fra Excel-
// arket "Budsjett 2026" (gjenbruker eksisterende data i stedet for en ny Fazile-henting).
// Rest (~9,5 % av total kr-verdi i en testkjøring 2026-08-25) havner som "Uklassifisert" -
// dette er en pragmatisk klassifisering, IKKE hentet fra Fazile sin egen Arealtype-kolonne
// (som ville krevd en ny rå-henting via leietakerliste/rent_roll - vurdert for stor jobb for
// denne runden, se plan-filen).
//
// "Mustad Eiendom AS" (intern-mustad-status) er ekskludert fra leietaker-grupperingen (ikke et
// reelt eksternt leieforhold) - bygg/leietype-grupperingen tar den derimot med (samme prinsipp
// som budsjett-scriptet: bygg/leietype dekker ALT, uavhengig av om det er en navngitt ekstern
// leietaker). v55 (2026-09-18, Morten: "kun Mustad Eiendom klassifiseres som intern. Resten
// skal gi leieinntekter"): Mustad Eiendomsdrift AS er en vanlig leietakerrad fra nå av.
//
// Kjør: node scripts/build-tenant-forecast-table.js (etter build-remaining-summary.js OG
// build-tenant-budget.js)

const fs = require("fs");
const path = require("path");
const { getFromRedis, pushToRedis, normalizeName, coreName, verifyTotal, konsernGrupper } = require("./lib/refresh-helpers");

const REMAINING_KEY = "jobb:inntektsprognose-gjenstar-leietakere";
const BUDGET_KEY = "jobb:inntektsprognose-leietaker-budsjett";
const OUT_KEY = "jobb:inntektsprognose-leietaker-tabell";
const FIELD = "snapshot";

// v17 (2026-09-07): samler ADVARSEL-linjene som tidligere kun gikk til konsollen (synlig bare
// for den som kjørte scriptet) i en array som legges ved i snapshotet - se
// lib/tenantForecastTable.ts sitt `advarsler`-felt og ReconciliationPanel i
// app/IncomeForecastSection.tsx, som viser dem som "Live varsler" i avstemmingspanelet.
const ADVARSLER = [];
function varsel(msg) {
  console.warn(msg);
  ADVARSLER.push(msg);
}
const EXCEL_RAW_FILE = path.join(__dirname, "refresh-data", "budsjett-2026-excel-raw.json");

// Må matche MUSTAD_INTERN_LABEL i build-tenant-budget.js. Denne raden har budsjett men ALDRI
// fakturert/gjenstår (internleie - Mustad sine egne lokaler, ekskludert fra
// buildLeietakerMap() sin REMAINING-basert fakturert/gjenstår, se der) - Morten (2026-08-26):
// vis den som fullt fakturert (fakturert=budsjett, gjenstår=0, avvik=0) i stedet for å se ut
// som 100 % under budsjett, men marker den tydelig som internleie (egen farge + hover-forklaring
// i UI-en, se `internleie`-feltet på TenantForecastRow / app/IncomeForecastSection.tsx).
const MUSTAD_INTERN_LABEL = "Mustad Eiendom (intern bruk, ikke leieforhold)";
// v28 (2026-09-08): samlerad for budsjett trukket ut av en Ledig-rad uten at noen leietakerrad
// tok imot det (MANUAL_UNTRACKED_OVERTAKELSER uten `overforTil`). Syntetisk radnavn på linje med
// de to andre - må holdes i sync med SYSTEM_ROW_LABELS i lib/tenantForecastSystemRow.ts.
const USPORET_OVERTAKELSE_LABEL = "Usporede overtakelser (ledig areal overtatt, mottaker ukjent)";

function round2(n) {
  return Math.round(n * 100) / 100;
}

// v9 (2026-08-29) - samme kanonisering som i build-tenant-budget.js (se der for full
// begrunnelse): kollapser dobbelt-mellomrom-varianter ("Lilleakerveien  4A") og slår sammen
// "CC Vest senter" (Excel sitt navn)/"Lilleakerveien 16" (Fazile/NXT sitt navn) til ett bygg i
// bygg-grupperingen - ellers splittes samme fysiske bygg i flere rader.
// v45 (2026-09-11): bygg-navn som skrives ULIKT i Excel-budsjettet og i Fazile/NXT. Uten alias
// havner de som to separate rader - én med budsjett og null inntekt, én med inntekt og null
// budsjett - og avviket pr. bygg blir meningsløst i begge. Funnet ved å liste bygg som har
// budsjett uten inntekt mot bygg som har inntekt uten budsjett (Morten bekreftet parene
// 2026-09-11). Nøkkelen er budsjettsidens skrivemåte i lowercase, verdien er Fazile/NXT-navnet.
//   Mustadsvei 10/12: ett ord i Excel, "Mustads vei" med mellomrom i Fazile.
//   Skoda / Schlägergården: Excel bruker kortnavn, Fazile bruker gateadressen.
const BYGG_NAVN_ALIAS = {
  "cc vest senter": "Lilleakerveien 16",
  "mustadsvei 10 fåbro gård": "Mustads vei 10 Fåbro gård",
  "mustadsvei 12 hagebyen": "Mustads vei 12 Hagebyen",
  skoda: "Lilleakerveien 16 Skoda",
  "schlägergården": "Lilleakerveien 30",
  // v52: NXT-siden ("Ukodet bokføring"-raden) skriver Arnstein Arnebergs vei med mellomrom,
  // Excel og Fazile uten - lå igjen som eneste Uklassifisert-post i Del A.
  "arnstein arnebergs vei 4": "Arnstein Arnebergsvei 4",
};
function kanoniskByggNavn(bygg) {
  const trimmed = (bygg || "").replace(/\s+/g, " ").trim();
  return BYGG_NAVN_ALIAS[trimmed.toLowerCase()] || trimmed;
}

// Samme Redis-hash/nøkkel-mønster som lib/tenantForecastComments.ts (KommentarCell i UI-en) -
// leser/skriver DIREKTE her siden dette er et Node-script uten innlogget HTTP-sesjon.
// v15 (2026-09-06): auto-genererte kommentarer merkes `auto: true` og REGENERERES ved hver
// kjøring (tidligere "skriv kun hvis tom" lot dem bli stående utdaterte når koblingene endret
// seg - Ledig V13D/V21 viste f.eks. fortsatt "gjenstående vist som 0" lenge etter at gulvet var
// fjernet). Overskriver ALDRI en kommentar Morten har skrevet selv (UI-en setter ikke `auto`) -
// eldre auto-kommentarer fra før flagget fantes gjenkjennes på de faste innledningene under.
const KOMMENTAR_HASH_KEY = "jobb:inntektsprognose-leietaker-kommentarer";
const AUTO_KOMMENTAR_PREFIKSER = ["Bekreftet utleid areal (", "Tok over ledig areal (", "Utleid/trukket ut fra denne Ledig-raden", "Flyttet inn i ledig areal ("];
function erAutoKommentar(eksisterende) {
  if (!eksisterende || !eksisterende.kommentar) return true;
  if (eksisterende.auto === true) return true;
  return AUTO_KOMMENTAR_PREFIKSER.some((p) => eksisterende.kommentar.startsWith(p));
}
// `kommentar` = "" fjerner en utdatert auto-kommentar (UI-en viser tom kommentar som "ingen").
async function settAutoKommentar(navn, kommentar) {
  const felt = navn.trim().toLowerCase();
  const eksisterende = await getFromRedis(KOMMENTAR_HASH_KEY, felt);
  if (!erAutoKommentar(eksisterende)) return false;
  if ((eksisterende ? eksisterende.kommentar : "") === kommentar) return false; // uendret
  if (!eksisterende && !kommentar) return false;
  await pushToRedis(KOMMENTAR_HASH_KEY, felt, { navn, kommentar, sistOppdatert: new Date().toISOString().slice(0, 10), auto: true });
  return true;
}

// v55 (2026-09-18): når juridiske enheter slås sammen til en konsernrad (se konsernNavn() i
// lib/refresh-helpers.js), forsvinner radene kommentarene sto på. Mortens egne kommentarer på
// enhetsnavnene (uten `auto`/`forfatter`) flyttes derfor over på konsernraden - samlet, med
// enhetsnavnet som prefiks - hvis konsernraden ikke allerede har en manuell kommentar. De gamle
// oppføringene beholdes (harmløse; radene finnes ikke lenger). Claude-kommentarer ("||claude"-
// nøkler) genereres på nytt av analysen og migreres ikke.
async function migrerKonsernKommentarer() {
  const grupper = konsernGrupper();
  let flyttet = 0;
  for (const [visningsnavn, medlemmer] of Object.entries(grupper)) {
    const kanoniskFelt = visningsnavn.trim().toLowerCase();
    const eksisterende = await getFromRedis(KOMMENTAR_HASH_KEY, kanoniskFelt);
    if (!erAutoKommentar(eksisterende)) continue; // Morten har allerede skrevet noe på konsernraden
    const deler = [];
    for (const m of medlemmer) {
      const e = await getFromRedis(KOMMENTAR_HASH_KEY, normalizeName(m));
      if (e && e.kommentar && !erAutoKommentar(e)) deler.push(`${m}: ${e.kommentar.trim()}`);
    }
    if (deler.length === 0) continue;
    await pushToRedis(KOMMENTAR_HASH_KEY, kanoniskFelt, { navn: visningsnavn, kommentar: deler.join(" | "), sistOppdatert: new Date().toISOString().slice(0, 10) });
    flyttet++;
  }
  if (flyttet > 0) console.log(`Konsern-kommentarer: ${flyttet} manuelle kommentarer flyttet fra enhetsnavn til konsernrad.`);
}

// v15: Finance sin egen månedlige innflyttingslogg for Ledig-linjene (juli-prognosefila, se
// scratch-generatoren nevnt i _kommentar i fila). Gitignored (inneholder leietakernavn i
// fritekst). Brukes til å klassifisere gjenværende Ledig-linjer ("forventet" utleid i år vs.
// "nullet" av Finance = står ledig ut året) og vise Finance sin siste kommentar pr. linje.
const LEDIG_FINANCE_FILE = path.join(__dirname, "refresh-data", "ledig-finance-juli-2026.json");
// De 4 delt-eide byggene halveres i build-tenant-budget.js (HALVBYGG_50 der) - Finance-fila har
// hele beløpet, så matchingen på beløp må halvere tilsvarende. Hold i sync.
const HALVBYGG_50 = new Set(["Lilleakerveien 20 Audi", "Lilleakerveien 22 VW", "Strandveien 10", "Strandveien 4-8"]);
function lastFinanceLedigIndeks() {
  if (!fs.existsSync(LEDIG_FINANCE_FILE)) {
    varsel(`ADVARSEL: ${path.basename(LEDIG_FINANCE_FILE)} mangler - Ledig-linjene får ingen Finance-vurdering/-kommentar.`);
    return null;
  }
  const data = JSON.parse(fs.readFileSync(LEDIG_FINANCE_FILE, "utf8"));
  const indeks = new Map(); // "bygg||objekt" -> [linje, ...] (flere linjer kan ha samme objekt, f.eks. "2 etg 889X" x3)
  for (const l of data.linjer) {
    const key = normalizeName(kanoniskByggNavn(l.bygg)) + "||" + normalizeName(l.objekt || "");
    if (!indeks.has(key)) indeks.set(key, []);
    indeks.get(key).push({ ...l, _brukt: false });
  }
  return indeks;
}
// Finner Finance-linjen for en Ledig-linje: samme bygg + samme kontraktobjekt (teksten før
// " — " i beskrivelsen) + samme budsjettbeløp (skiller like objekter fra hverandre). Hver
// Finance-linje brukes maks én gang.
function finnFinanceLinje(indeks, linje) {
  if (!indeks) return null;
  // build-tenant-budget.js setter "<leietype> (uspesifisert areal)" der Excel-objektet er tomt.
  const objekt = (linje.beskrivelse || "").split(" — ")[0].replace(/^.*\(uspesifisert areal\)$/, "");
  const key = normalizeName(kanoniskByggNavn(linje.bygg)) + "||" + normalizeName(objekt);
  const kandidater = indeks.get(key) || [];
  const halv = HALVBYGG_50.has((linje.bygg || "").trim()) ? 0.5 : 1;
  const treff = kandidater.find((k) => !k._brukt && Math.abs(k.budsjett * halv - linje.fullArsverdi2026) < 1);
  if (!treff) return null;
  treff._brukt = true;
  return { ...treff, faktor: halv };
}

// v15: privatpersonnavn i Finance sine fritekster (både masterfilas kommentarInntekt, som
// allerede ligger i Ledig-linjenes beskrivelse, og juli-filas månedskommentarer) strippes før
// Redis-push - linjebeskrivelser anonymiseres IKKE i lib/tenantForecastTable.ts, og snapshotet
// leses også av den offentlige Vercel-siden. Gitignored fil, se ANONYMISERING.md.
const LEDIG_NAVNESTRIPP_FILE = path.join(__dirname, "refresh-data", "_private-ledig-navnestripp.json");
function lagNavnestripper() {
  if (!fs.existsSync(LEDIG_NAVNESTRIPP_FILE)) return (s) => s;
  const navn = JSON.parse(fs.readFileSync(LEDIG_NAVNESTRIPP_FILE, "utf8")).navn || [];
  const regexer = navn.map((n) => new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"));
  return (s) => {
    if (!s) return s;
    let ut = s;
    for (const re of regexer) ut = ut.replace(re, "[navn fjernet]");
    return ut;
  };
}

function buildBudgetLookup(rows) {
  const byNorm = new Map();
  const byCore = new Map();
  for (const r of rows) {
    if (r.kjerneNavn === undefined) continue; // Ufordelt-raden har ikke kjerneNavn - slås opp separat
    byNorm.set(normalizeName(r.navn), r);
    byCore.set(r.kjerneNavn, r);
  }
  return { byNorm, byCore };
}

// Returnerer { budsjett, via, excelNavn } eller null. v16 (2026-09-06): `via` = HELE matchekjeden
// - budsjettradens egen Excel->Fazile-metode (budsjettVia fra build-tenant-budget.js) pluss
// "kjerne-navn (tabell)" hvis oppslaget HER måtte gå via kjernenavn (et andre fuzzy-lag).
function lookupBudget(navn, lookup) {
  const norm = normalizeName(navn);
  const eksakt = lookup.byNorm.get(norm);
  if (eksakt) return { budsjett: eksakt.budsjett, via: eksakt.budsjettVia || [], excelNavn: eksakt.excelNavn };
  const core = coreName(navn);
  const viaCore = lookup.byCore.get(core);
  if (viaCore) return { budsjett: viaCore.budsjett, via: [...(viaCore.budsjettVia || []), "kjerne-navn (tabell)"], excelNavn: viaCore.excelNavn };
  return null;
}

// Må matche DEL_B_LEIETYPER i build-tenant-budget.js: leietypene Excel-budsjettet regner som
// parkering (Del B). Brukes i v52-fallbacken under til å holde Del A-linjer unna dem.
const DEL_B_LEIETYPER = new Set(["parkering", "garasje"]);

// `budsjettOppslag(navn)` = budgetLookupA.leietaker (fuzzyLookupFn) - gir { excelNavn: [...] } for
// leietakere budsjettsiden har alias-koblet (Norsk Medisinaldepot -> "Vitusapotek CC Vest",
// Rn Nordic -> "Skoda", Sats Norway -> "Sats CC Vest"), slik at leietypen deres i Excel finnes
// selv når Fazile-navnet ikke ligner Excel-navnet.
function buildLeietypeClassifier(budsjettOppslag) {
  const excelRows = JSON.parse(fs.readFileSync(EXCEL_RAW_FILE, "utf8"));
  const byggBeskrivelse = new Map(); // "bygg||beskrivelse" -> Set(leietype)
  for (const r of excelRows) {
    const key = normalizeName(r.bygg || "") + "||" + normalizeName(r.kontraktObjekt || "");
    if (!byggBeskrivelse.has(key)) byggBeskrivelse.set(key, new Set());
    byggBeskrivelse.get(key).add(r.leietype || "Uklassifisert");
  }
  // v52 (2026-09-11, Morten: "stor post på Uklassifisert" i Leietype-fanen - 81 mill i +/- fordi
  // fakturert/gjenstår havnet der uten budsjett, mens budsjettet lå på Kontor/Butikk/...). 157 av
  // 168 linjer het bare "Husleie avg.pl." - ingen av regex-ene over treffer, og bygg+beskrivelse-
  // oppslaget krever at Fazile-teksten er identisk med Excel-kolonnen "Kontrakt-objekt". Nytt
  // fallback-lag: LEIETAKERENS egen leietype i budsjettarket (pr. leietaker+bygg, så pr.
  // leietaker, så pr. kjernenavn), valgt etter størst budsjettbeløp når leietakeren har flere
  // (Onesubsea: Kontor 1,5 mill + Annet 20 000 -> Kontor). Del A-linjer ser bort fra Parkering/
  // Garasje og omvendt, slik at "Kontor/Parkering"-leietakere ikke blir tvetydige. Budsjettet
  // klassifiseres jo nettopp på denne kolonnen, så inntekt og budsjett måles nå på samme skala.
  const perLeietakerBygg = new Map(); // normNavn||normKanoniskBygg -> Map(leietype -> beløp)
  const perLeietaker = new Map(); // normNavn -> Map(leietype -> beløp)
  const perKjerne = new Map(); // coreName -> Map(leietype -> beløp)
  const perBygg = new Map(); // normKanoniskBygg -> Map(leietype -> beløp) - siste utvei, se under
  const legg = (m, key, r) => {
    if (!r.leietype || !key) return;
    if (!m.has(key)) m.set(key, new Map());
    const t = m.get(key);
    t.set(r.leietype, (t.get(r.leietype) || 0) + Math.abs(r.inntekt2026 ?? r.arsbelop ?? 0));
  };
  for (const r of excelRows) {
    if (r.bygg) legg(perBygg, normalizeName(kanoniskByggNavn(r.bygg)), r);
    if (!r.kontrakt) continue;
    legg(perLeietakerBygg, normalizeName(r.kontrakt) + "||" + normalizeName(kanoniskByggNavn(r.bygg)), r);
    legg(perLeietaker, normalizeName(r.kontrakt), r);
    legg(perKjerne, coreName(r.kontrakt), r);
  }
  const dominerende = (typer, del) => {
    if (!typer) return null;
    const kandidater = [...typer.entries()].filter(([t]) => (del === "B") === DEL_B_LEIETYPER.has(t.toLowerCase()));
    if (kandidater.length === 0) return null;
    kandidater.sort((a, b) => b[1] - a[1]);
    return kandidater[0][0];
  };
  const viaNavn = (navn, bygg, del) => {
    if (!navn) return null;
    const n = normalizeName(navn);
    return (
      dominerende(perLeietakerBygg.get(n + "||" + normalizeName(kanoniskByggNavn(bygg))), del) ||
      dominerende(perLeietaker.get(n), del) ||
      dominerende(perKjerne.get(coreName(navn)), del)
    );
  };
  // Oppsummering til konsollen etter kjøring: hvilke leietakere som fikk leietype fra
  // BYGGETS dominerende type (svakeste laget - verdt et blikk fra Morten) og hva som sto igjen.
  const oppsummering = { byggFallback: new Map(), uklassifisert: new Map() };
  const noter = (m, leietaker, bygg, leietype, belop) => {
    const key = `${leietaker} @ ${bygg}`;
    const e = m.get(key) || { leietype, belop: 0 };
    e.belop += belop || 0;
    m.set(key, e);
  };
  function classify(beskrivelse, bygg, leietaker, del, fullArsverdi2026) {
    const t = classifyRaa(beskrivelse, bygg, leietaker, del, fullArsverdi2026);
    // Del B ER parkeringskontoene (3640-3642) - alt der er parkering av ett eller annet slag.
    // "Lager kjøl/avfall" i P-broen eller Onepark-estimatet uten Fazile-linje skal ikke stå som
    // Lager/Annet/Uklassifisert ved siden av Garasje og Parkering.
    if (del === "B" && t !== "Garasje") return "Parkering";
    return t;
  }
  // `leietaker` kan være ÉN streng eller en liste [juridisk enhet, konsernrad] (v55): Excel
  // budsjetterer pr. selskap, så enhetens eget navn prøves først; konsernraden (som eier
  // budsjettoppslaget etter sammenslåingen) er fallback. For alle andre er lista ett navn.
  // v62 (2026-09-19, Morten: "en butikk registrert som kontor ville ikke vist seg" - stikkprøve
  // avdekket akkurat dette): FØR denne runden sto de "entydige" Fazile-beskrivelse-nøkkelordene
  // (garasje/parkering/lagerleie/kontorleie/minimumsleie) FØRST, og vant over Excel sin egen
  // leietype-kolonne. "Minimumsleie avg.pl." er IKKE et Butikk-ord, det er navnet Fazile bruker på
  // kjerneleien uansett bransje - flere restaurant-/kafé-/hurtigmatleietakere (til sammen ~8,6 mill
  // kr) sto derfor som Butikk i stedet for Restaurant, og Excel sin egen Restaurant/Service-helse/
  // Annet-kolonne for akkurat disse leieforholdene ble aldri konsultert. Stikkprøven fant dette ved
  // å sammenligne Excel-radenes EGEN leietype-kolonne mot hva nøkkelordene ville gitt - 22 rader
  // avvek, størst en enkeltleietaker på 2 099 792 kr. Rekkefølgen er nå snudd: Excel (steg 1-2,
  // Finance sin egen vurdering) vinner FØR nøkkelordene (steg 3-4), samme prinsipp som allerede
  // gjaldt for steg 4 sine "mindre entydige ord" - nå gjelder det konsekvent for ALLE nøkkelord,
  // ikke bare de svakeste.
  function classifyRaa(beskrivelse, bygg, leietaker, del, fullArsverdi2026) {
    const navneliste = [...new Set((Array.isArray(leietaker) ? leietaker : [leietaker]).filter(Boolean))];
    leietaker = navneliste[0] || null;
    const b = (beskrivelse || "").toLowerCase();
    // 1) Bygg + beskrivelse finnes ordrett som "Kontrakt-objekt" i Excel.
    const key = normalizeName(bygg || "") + "||" + normalizeName(beskrivelse || "");
    const types = byggBeskrivelse.get(key);
    if (types && types.size === 1) return [...types][0];
    // 2) Leietakerens egen leietype i Excel (direkte på navn, så via budsjettsidens alias) -
    //    juridisk enhet først, deretter konsernraden (v55, se navneliste over).
    for (const navn of navneliste) {
      const direkte = viaNavn(navn, bygg, del);
      if (direkte) return direkte;
    }
    for (const navn of navneliste) {
      const budsjett = budsjettOppslag ? budsjettOppslag(navn) : null;
      for (const excelNavn of (budsjett && budsjett.excelNavn) || []) {
        const t = viaNavn(excelNavn, bygg, del);
        if (t) return t;
      }
    }
    // 3) Entydige ord i Fazile-beskrivelsen - kun for leieforhold Excel ikke sier noe om.
    if (/garasje/.test(b)) return "Garasje";
    if (/parkering|p-plass/.test(b)) return "Parkering";
    if (/lagerleie/.test(b)) return "Lager";
    if (/kontorleie/.test(b)) return "Kontor";
    if (/minimumsleie|omsetningsbasert|butikkleie/.test(b)) return "Butikk";
    // 4) Mindre entydige ord.
    if (/omsetningsleie|omsetningsjustert|leie handel|pop up|tilleggsleie/.test(b)) return "Butikk";
    if (/kontor/.test(b)) return "Kontor";
    if (/lager/.test(b)) return "Lager";
    if (/basestasjon|vendesløyfe|annen inntekt|ladestasjon|enøk/.test(b)) return "Annet";
    // 5) Siste utvei: byggets dominerende leietype i budsjettet (Lilleakerveien 31 -> Kontor,
    //    CC Vest -> Butikk). Grovt, men riktigere enn "Uklassifisert" for en ubudsjettert leietaker
    //    som leier vanlige lokaler. Logges slik at Morten kan overprøve.
    const byggType = dominerende(perBygg.get(normalizeName(kanoniskByggNavn(bygg))), del);
    if (byggType) {
      noter(oppsummering.byggFallback, leietaker, bygg, byggType, fullArsverdi2026);
      return byggType;
    }
    noter(oppsummering.uklassifisert, leietaker, bygg, "Uklassifisert", fullArsverdi2026);
    return "Uklassifisert";
  }
  return { classify, oppsummering };
}

// Bygger en gruppering pr. Del: `keyFn(line, tenant)` avgjør hvilken rad linjen tilhører.
// `linesForDel` er ALLE (tenant, line)-par for gitt Del (A eller B), inkludert intern-mustad
// (bygg/leietype skal dekke alt) - leietaker-grupperingen filtrerer intern-mustad bort selv,
// se buildLeietakerGruppe.
function groupLines(linesForDel, keyFn) {
  const map = new Map(); // key -> { fakturert, gjenstar, linjer: [] }
  for (const { tenant, line, fakturertShare, gjenstarShare } of linesForDel) {
    const key = keyFn(line, tenant);
    if (!map.has(key)) map.set(key, { fakturert: 0, gjenstar: 0, linjer: [] });
    const g = map.get(key);
    g.fakturert = round2(g.fakturert + fakturertShare);
    g.gjenstar = round2(g.gjenstar + gjenstarShare);
    g.linjer.push({ ...line, leietaker: tenant.navn });
  }
  return map;
}

// `lookupFn(navn) => budsjett|null` - leietaker-grupperingen bruker fuzzy navnematching
// (lookupBudget, se under), bygg/leietype bruker eksakt streng-match (begge sider har samme,
// deterministiske nøkkel-univers - fuzzy matching gir kun falske treff der).
//
// `defaultBudsjett`: 0 for Del A (et reelt leieforhold uten budsjettlinje er et reelt 0 kr-
// budsjett - vises som en positiv/negativ avvik). `null` for Del B (parkering har INGEN
// pr.-rad-budsjett i det hele tatt - se filhode - så "ikke funnet" skal vises som "—", ikke 0).
function medBudsjett(map, lookupFn, budgetRowsForUfordelt, defaultBudsjett = 0, internMustadFakturert = null, internMustadGjenstar = 0) {
  const rows = [];
  for (const [navn, g] of map.entries()) {
    const budsjettMatch = lookupFn(navn);
    const budsjett = budsjettMatch !== null ? budsjettMatch.budsjett : defaultBudsjett;
    rows.push({
      navn,
      fakturert: g.fakturert,
      gjenstar: g.gjenstar,
      budsjett,
      avvik: budsjett === null ? null : round2(g.fakturert + g.gjenstar - budsjett),
      linjer: g.linjer.sort((a, b) => b.fullArsverdi2026 - a.fullArsverdi2026),
      // Kun satt av buildLeietakerMap() (leietaker-grupperingen) - bygg-/leietype-grupperingen
      // (groupLines()) blander sammen flere leietakeres kontoposteringer, som ikke gir mening å
      // vise som én kontoliste - derfor undefined der.
      kontoer: g.kontoer,
      // v16: REMAINING-statuser (utenom "ok") og NXT-matchemetode pr. byggGruppe - grunnlag for
      // årsakskode-forslag og match-kvalitet i UI/kontroller. Kun leietaker-grupperingen.
      ...(g.remainingStatuser && g.remainingStatuser.length ? { remainingStatuser: g.remainingStatuser } : {}),
      ...(g.nxtMatch ? { nxtMatch: g.nxtMatch } : {}),
      ...(budsjettMatch && budsjettMatch.via && budsjettMatch.via.length ? { budsjettVia: budsjettMatch.via } : {}),
      ...(budsjettMatch && budsjettMatch.excelNavn ? { excelNavn: budsjettMatch.excelNavn } : {}),
    });
  }
  // Rader fra budsjett-siden som ikke traff noen fakturert/gjenstår-gruppe i det hele tatt
  // (f.eks. Avstemmingsdifferanse-raden, eller en leietype/bygg som kun finnes i budsjettet) -
  // tas med med fakturert/gjenstår=0, slik at budsjett-summen for grupperingen alltid stemmer
  // eksakt (kun relevant for Del A - budgetRowsForUfordelt er alltid [] for Del B).
  const dekketNavn = new Set(rows.map((r) => normalizeName(kanoniskByggNavn(r.navn))));
  for (const b of budgetRowsForUfordelt) {
    if (dekketNavn.has(normalizeName(kanoniskByggNavn(b.navn)))) continue;
    if (b.navn === MUSTAD_INTERN_LABEL) {
      // v12 (2026-08-30, Morten: "fakturert viser korrekt total på tvers av leietakere, bygg og
      // leietype") - fakturert=budsjett var en ren display-erstatning (se filhode) som gjorde at
      // Leietaker-visningen manglet REELT NXT-fakturert for intern-mustad-byggGrupper (1 430 260,95
      // kr) sammenlignet med Bygg-/Leietype-visningen (som teller dem med direkte, uavhengig av
      // budsjett - se linesA/B-loopen over). Bruker nå det reelle tallet - UI-en fargelegger uansett
      // ALDRI internleie-radens avvik-kolonne rødt/grønt (se `row.internleie ? "text-ink-4" : ...`
      // i app/IncomeForecastSection.tsx), så Mortens opprinnelige bekymring (2026-08-26: "vis den
      // som fullt fakturert i stedet for å se ut som 100 % under budsjett") fortsatt unngås selv om
      // avvik nå kan bli negativt.
      //
      // v28 (2026-09-08): gjenstar var HARDKODET til 0 her. buildLeietakerMap() filtrerer bort
      // intern-mustad-byggGruppene i sin helhet, så denne raden er det ENESTE stedet deres
      // gjenstår kan komme inn i leietaker-grupperingen - og med 0 forsvant 434 061,75 kr (Del A)
      // ut av visningen. Bygg-/leietype-grupperingen teller dem med (linesA/B), så de tre
      // grupperingene av samme tabell summerte til ulike totaler, og "Leieinntekter"-seksjonen i
      // UI-en kom 434 062 kr lavere enn toppboksens gjenstår (som kommer fra REMAINING direkte).
      // Sammen med Del B-raden lenger nede utgjorde det et samlet avvik på 657 022 kr mellom
      // seksjonskortene og toppboksen (Morten så det i nettleseren 2026-09-08).
      const fakturert = internMustadFakturert ?? b.budsjett;
      rows.push({
        navn: b.navn,
        fakturert,
        gjenstar: internMustadGjenstar,
        budsjett: b.budsjett,
        avvik: round2(fakturert + internMustadGjenstar - b.budsjett),
        linjer: [],
        internleie: true,
      });
      continue;
    }
    // b.linjer finnes for de bygg-splittede "Ledig (vakante lokaler) – <bygg>"-radene (v6,
    // 2026-08-28, se build-tenant-budget.js) - la dem følge med som drilldown i stedet for å
    // kaste dem bort med en hardkodet tom liste.
    rows.push({
      navn: b.navn,
      fakturert: 0,
      gjenstar: 0,
      budsjett: b.budsjett,
      avvik: round2(-b.budsjett),
      linjer: b.linjer || [],
      ...(b.budsjettVia ? { budsjettVia: b.budsjettVia } : {}),
      ...(b.excelNavn ? { excelNavn: b.excelNavn } : {}),
    });
  }
  return rows;
}

function sortByAvvik(rows) {
  return rows.sort((a, b) => {
    if (a.avvik === null && b.avvik === null) return b.fakturert + b.gjenstar - (a.fakturert + a.gjenstar);
    if (a.avvik === null) return 1;
    if (b.avvik === null) return -1;
    return Math.abs(b.avvik) - Math.abs(a.avvik);
  });
}

async function main() {
  await migrerKonsernKommentarer();
  const remaining = await getFromRedis(REMAINING_KEY, FIELD);
  const budget = await getFromRedis(BUDGET_KEY, FIELD);
  if (!remaining) throw new Error(`Fant ikke snapshot i Redis: ${REMAINING_KEY}/${FIELD} - kjør build-remaining-summary.js først.`);
  if (!budget) throw new Error(`Fant ikke snapshot i Redis: ${BUDGET_KEY}/${FIELD} - kjør build-tenant-budget.js først.`);

  // classifyLeietype bygges lenger ned (v52), etter budgetLookupA - den trenger budsjettsidens
  // alias-oppslag (Fazile-navn -> Excel-navn) for å finne leietakerens leietype i Excel.

  // (tenant, line, fakturertShare, gjenstarShare) pr. Del - fakturert/gjenstår pr. linje finnes
  // ikke i REMAINING (kun pr. byggGruppe), så vi fordeler byggGruppens fakturert/gjenstår
  // proporsjonalt over linjene i den gruppen (kun brukt for bygg/leietype-summering - leietaker-
  // grupperingen bruker byggGruppe-tallene direkte, uendret fra v1).
  const linesA = [];
  const linesB = [];
  for (const tenant of remaining.tenants) {
    for (const bg of tenant.byggGrupper) {
      const linjerIGruppe = tenant.lines.filter((l) => normalizeName(l.bygg) === normalizeName(bg.bygg));
      const fullA = round2(linjerIGruppe.filter((l) => l.del === "A").reduce((s, l) => s + l.fullArsverdi2026, 0));
      const fullB = round2(linjerIGruppe.filter((l) => l.del === "B").reduce((s, l) => s + l.fullArsverdi2026, 0));
      for (const line of linjerIGruppe) {
        if (line.del === "A" && fullA > 0) {
          const andel = line.fullArsverdi2026 / fullA;
          linesA.push({ tenant, line, fakturertShare: round2(bg.alleredeFakturertDelA * andel), gjenstarShare: round2(bg.gjenstarDelA * andel) });
        } else if (line.del === "B" && fullB > 0) {
          const andel = line.fullArsverdi2026 / fullB;
          linesB.push({ tenant, line, fakturertShare: round2(bg.alleredeFakturertDelB * andel), gjenstarShare: round2(bg.gjenstarDelB * andel) });
        }
      }
      // Fallback når byggGruppen HAR et reelt fakturert/gjenstår-beløp fra NXT, men INGEN av
      // leietakerens Fazile-linjer i dette bygget er klassifisert med denne Del'en (typisk:
      // parkeringsinntekt bokført i NXT på byggGruppen uten egen "del: B"-kontraktslinje i
      // Fazile for akkurat denne leietakeren) - fant 2026-08-30 at fullA/fullB===0 da stille
      // droppet HELE bg-beløpet fra bygg/leietype-grupperingen (linesA/linesB), mens leietaker-
      // grupperingen (som leser bg.alleredeFakturert.../gjenstar... DIREKTE, uavhengig av linjer)
      // fortsatt viste det riktig - ga et ~10 mnok avvik mellom leietaker- og bygg-visningen,
      // nesten utelukkende på Del B. Legger til én syntetisk linje pr. byggGruppe/Del i stedet,
      // slik at bygg/leietype-summen alltid stemmer eksakt med leietaker-summen.
      if (fullA === 0 && (bg.alleredeFakturertDelA !== 0 || bg.gjenstarDelA !== 0)) {
        linesA.push({
          tenant,
          line: { eiendom: "", bygg: bg.bygg, linjetype: "", beskrivelse: "Fakturert/gjenstår uten egen Fazile-linje", del: "A", fullArsverdi2026: 0, startDato: null, sluttDato: null },
          fakturertShare: bg.alleredeFakturertDelA,
          gjenstarShare: bg.gjenstarDelA,
        });
      }
      if (fullB === 0 && (bg.alleredeFakturertDelB !== 0 || bg.gjenstarDelB !== 0)) {
        linesB.push({
          tenant,
          line: { eiendom: "", bygg: bg.bygg, linjetype: "", beskrivelse: "Fakturert/gjenstår uten egen Fazile-linje", del: "B", fullArsverdi2026: 0, startDato: null, sluttDato: null },
          fakturertShare: bg.alleredeFakturertDelB,
          gjenstarShare: bg.gjenstarDelB,
        });
      }
    }
  }

  // v7 (2026-08-28): "Ledig ..."-radene (build-tenant-budget.js) bærer et internt
  // _kommentarRaw-felt pr. areal-linje - Excel sin egen fritekstkommentar. Nester leietakere som
  // har flyttet inn i et slikt areal under riktig Ledig-rad i UI-en (i stedet for å vise dem som
  // løsrevne budsjett=0-rader), ved å matche kommentaren mot leietakernavn i SAMME bygg.
  // Konservativt: kommentaren må STARTE MED leietakerens kjerne-navn (fanger "Serendipity.
  // Arealene..."/"Medu. Arealene..."-mønsteret, ekskluderer automatisk alt som ikke har et navn
  // først, f.eks. "Tilbud avgitt til Appear"/"Delt areal på 653...").
  // v8 (2026-08-29): radnavnet er nå en kortkode ("Ledig V13D"), ikke det fulle byggnavnet - bruk
  // derfor "Ledig" som prefix, og finn en Ledig-rad for et gitt FULLT byggnavn via dens egne
  // linjer[].bygg (som fortsatt har det fulle navnet) i stedet for å rekonstruere kortkoden her.
  const LEDIG_LABEL_PREFIX = "Ledig";
  function finnLedigRad(ledigRader, fulltByggnavn) {
    return ledigRader.find((r) => r.linjer.some((l) => normalizeName(l.bygg) === normalizeName(fulltByggnavn)));
  }
  // avvik beregnes normalt ÉN gang i medBudsjett() - må regnes på nytt her hver gang budsjett
  // endres i etterkant (overføring til/fra en Ledig-rad), ellers blir avvik-feltet stående med
  // det GAMLE, nå feil, tallet.
  function oppdaterAvvik(rad) {
    if (rad.budsjett === null) return;
    rad.avvik = round2(rad.fakturert + rad.gjenstar - rad.budsjett);
  }
  // Morten bekreftet direkte 2026-08-28 (etter å ha fått presentert kandidater fra en automatisk
  // budsjett=0-i-samme-bygg-sweep) at disse har flyttet inn i et ledig lokale, selv om Excel sin
  // egen kommentarInntekt ikke nevner dem ved navn (så den tekst-baserte matchingen over ikke kan
  // finne dem selv). "Metesa AS" er for øvrig samme selskap som Medu AS - Morten: "Medu (metesa)
  // sin kontrakt startet 15.12.2025, og de ble til Metesa 01.07.2026" (et rebrand midt i
  // leieperioden; siden v15 slått sammen til én leietaker i build-remaining-summary.js).
  //
  // v15 (2026-09-06) - LINJEBASERT budsjettoverføring. Verdiformer:
  //   "Bygg"                                -> nestes under byggets Ledig-rad, INGEN overføring.
  //                                            Brukes når leietakeren ikke har noen budsjettert
  //                                            Ledig-linje (små enheter Excel ikke budsjetterte
  //                                            enkeltvis): budsjett 0, inntekten er ren oppside.
  //   { bygg, linjeMatch: "x" | ["x", ...] } -> nestes, og de Ledig-linjene i bygget hvis
  //                                            beskrivelse inneholder teksten (case-insensitivt)
  //                                            FJERNES fra Ledig-raden og blir leietakerens
  //                                            budsjett - nøyaktig linjeverdien(e).
  //   [ { bygg, linjeMatch }, ... ]          -> flere bygg (Rob Arnesen: LV4A + LV10).
  // Matcher flere leietakere samme linje (Lilleakerveien 26: én Excel-linje, fire leietakere),
  // deles linjeverdien likt mellom dem.
  // Erstatter v7-modellen "overfør summen av leietakerens egne Fazile-linjer" som ga negative
  // Ledig-budsjetter (v2 2026-09-01) når leietakerens faktiske leie oversteg det budsjetterte -
  // nå står hver Ledig-rad igjen med nøyaktig de linjene som IKKE er tatt, aldri negativ, og
  // over-/underdekning mot budsjett vises på leietakerens egen rad der den hører hjemme.
  // Linje-tilordningene under er hentet fra Finance sin juli-prognosefil (månedskommentarene
  // navngir hvem som tok hvilken linje) der den finnes, ellers fra masterfilas kommentarInntekt.
  const MANUAL_FLYTTET_INN_OVERRIDES = {
    "zeg power as": { bygg: "Lilleakerveien 2B", linjeMatch: "id 8827" }, // Finance mar: "Zeg Power fra 01.02"
    // Finance jun (rad 568): "Komplett.no fra 01.09. Budsjettert på 3 linjer. Budsjettert 1.785.000,-"
    // = 3.03 + 3.02b + 3.02a (1 004 400 + 428 170 + 352 964 = 1 785 534).
    // v52 (2026-09-11, Morten: "ble vi ikke enige om at det negative avviket skulle ligge under
    // ledighetslinjen?"): `ikkeBudsjett` gjør at linjene nestes under Ledig-raden som vanlig, men
    // at budsjettet BLIR LIGGENDE der i stedet for å følge med til leietakeren. Morten sitt
    // standpunkt er at Komplett er oppside vi fikk inn, ikke et mål de har sviktet.
    // NB: Finance budsjetterte dem faktisk - junikommentaren over er deres egen. Fjernes flagget,
    // får Komplett tilbake 1 785 534 i budsjett og et avvik på −1 510 534, og Ledig LV2B blir
    // tilsvarende mindre negativ. Kun dette flagget skiller de to tolkningene.
    "komplett asa": { bygg: "Lilleakerveien 2B", linjeMatch: ["husleie avg.fritt 3.03", "husleie avg.fritt 3.02b", "husleie avg.fritt 3.02a"], ikkeBudsjett: true },
    "metesa as": { bygg: "Lilleakerveien 2B", linjeMatch: "husleie avg.fritt 4.04" }, // Finance mar: "Medu/Metesa"
    // Rema: verkstedene + rest-delen av 1. etg (masterfila: "Delt areal på 653 til Head sine 285 og
    // denne som er rest"). Finance mar: "Sannsynligvis utsatt noe" - oppstart 2026-10-01 i Fazile.
    "rema 1000 norge as": { bygg: "Vollsveien 13D", linjeMatch: ["verksted 3", "verksted 4", "delt areal på 653"] },
    // Runde 4 (2026-08-31) - Morten bekreftet "Head Sport Gmbh" og "Head Norway AS" er samme
    // leietaker (se merge i build-remaining-summary.js) og at de har flyttet inn i det ledige
    // arealet i Vollsveien 13D sammen med Rema (masterfila: "Head tar 285kvm. 627k årssum 2026").
    "head norway as": { bygg: "Vollsveien 13D", linjeMatch: "head tar 285kvm" },
    "movr as": { bygg: "Vollsveien 13C", linjeMatch: "id 8177" }, // Finance mar: "Leid ut til Movr"
    "autismeforeningen i norge": "Vollsveien 21", // ingen budsjettert linje (A04-linjen ble tatt av ATD Design)
    // Finance mar (LV4A 4-1, 4-5): "Rob Arnesen. 621.230,-"; (LV10 U1-1 tidl OBH): "Kontrakt sendt Rob Arnesen fra 01.05."
    "rob arnesen as": [
      { bygg: "Lilleakerveien 4A", linjeMatch: "4-1, 4-5" },
      { bygg: "Lilleakerveien 10", linjeMatch: "tidl obh" },
    ],
    "higheredos as": "Lilleakerveien 4A",
    // Finance mar på samme linje (8721): "Woolland. 01.03. 554.400,- inkl. alt" - Woolland AS har
    // imidlertid allerede egen, full budsjettrad, mens Morten bekreftet Veidekke inn i LV2E-arealet
    // (2026-08-28). Beholdt på Veidekke inntil Morten avklarer hvem som faktisk tok 8721.
    "veidekke entreprenør as": { bygg: "Lilleakerveien 2E", linjeMatch: "8721" },
    "geothermal energy nordic as": "Lilleakerveien 2C",
    // Runde 2 (samme dag) - Morten presiserte at budsjettet ble satt i oktober 2025, så
    // leietakere med oppstart sen-2025 (ikke bare 2026) kan også ha flyttet inn i et ledig
    // lokale fra budsjettidspunktet. Bekreftet direkte, til tross for at Lilleakerveien 2C sine
    // 4 treff til sammen langt overstiger byggets ene ledige linje på 83 770 kr - bygget har
    // trolig flere små, ikke-individuelt budsjetterte enheter enn Excel sin ene "Ledig"-rad
    // fanger opp (samme mønster som en flex-/co-working-etasje).
    "gnativ bygg as": "Lilleakerveien 2C",
    "reltime as": "Lilleakerveien 2C",
    "urbanium eiendom as": "Lilleakerveien 2C",
    "k&c factory as": "Lilleakerveien 4D",
    "norsk elkraft kontroll as": { bygg: "Lilleakerveien 4C", linjeMatch: "husleie avg.fritt 1.1" }, // masterfila: "Norsk Elkraft Kontroll AS fra 15.11.2025"
    // Runde 3 (2026-08-29) - Morten bekreftet: Origon AS har en helt ny leielinje i Vollsveien 17
    // (Kontorleie avg.pl., start 2026-09-04) som IKKE finnes i Origon sitt eksisterende budsjett
    // (dekker kun Vollsveien 13B/13C). v15: knyttet til den ene V17-linjen "kontor id:8070"
    // (189 652 kr) - IKKE til den store "Kontor"-linjen (367 715 kr), som Finance i juni fortsatt
    // meldte "Ikke leid ut, få forespørsler" på. Resten av Origon sin nye V17-leie er oppside.
    "origon as": { bygg: "Vollsveien 17", linjeMatch: "kontor id:8070" },
    // Runde 5 (2026-08-31) - grundig gjennomgang av alle Ledig-bygg mot budsjett=0-i-samme-
    // bygg-sweepen. Morten bekreftet KUN de "sikre" treffene (nær eksakt beløpsmatch, eller
    // samme "flere små enheter i én Excel-linje"-mønster som allerede bekreftet for
    // Lilleakerveien 2C):
    "sway pilates as": { bygg: "Lilleakerveien 4D", linjeMatch: "butikk 1" }, // Finance mar: "Sway Pilates fra 01.09. 369.380,-" - sykkelbutikken er erstattet
    "halite as": "Lilleakerveien 2E",
    "arkitektkontoret lene frank as": "Lilleakerveien 2E",
    "foresight as": "Lilleakerveien 2E",
    // Resten av Lilleakerveien 2E-gruppen (Aina Griffin, Myndin Nerdrum, Grønset Kunst og
    // Illustrasjon) og hele Lilleakerveien 26-gruppen er PRIVATPERSONER (ingen selskapsform) -
    // holdes utenfor denne committede fila per ANONYMISERING.md, lastes fra en gitignored fil
    // i stedet (se MANUAL_FLYTTET_INN_PRIVATE_FILE under).
    // Runde 6 (2026-08-31) - Morten ba om å sjekke "Endring"/"Kommentar"-kolonnene (AN-AT/BB-BH)
    // i den eldre "2026_08_04_Inntektsprognose_Juli_2026.xlsx"-fila sitt "Prognose juli-2026"-ark
    // (Finance sin egen månedlige innflytting-logg, IKKE til stede i "Budsjett 2026 - Master.xlsx"
    // som resten av pipelinen bruker). Fant tre nye, navngitt-i-kommentar treff:
    "atd design as": "Vollsveien 21", // rad 916: "Utleid til ATD Design. 01.02.26. 15k mnd" - annen linje (kontor A04) enn "Fellesareal U.01"-linjen som ble sjekket (og forkastet) i runde 5
    "tjernsrud holding as": "Vollsveien 19", // rad 1270: "Kjensrud Holding fra 01.03. 7000 kr mnd" (stavevariant) - egen, ekte ekstern leielinje ("Husleie avg.fritt 8, 9, 11"), ikke samme linje som "Internleie"-kommentaren i dagens masterfil
    "inlumi as": "Vollsveien 19", // ikke eksplisitt navngitt i juli-kommentarene, men samme "flere små enheter i én Excel-linje"-mønster som Tjernsrud over - bygget har åpenbart mer enn én reell leietaker bak "Internleie"-linjen
    "løplabbet as": { bygg: "Lilleakerveien 6d Hus 3", linjeMatch: "id 3679" }, // rad 556: "Løplabbet fra 01.05 (åpning). 300.000,- i 2026"
    // v15 (2026-09-06) - Finance nullet Lilleakerveien 31 sine fire B3-kontorer (B3.8-B3.11, 4 x
    // 24 744 kr) i mars uten kommentar; Partikkel AS (budsjett 0, husleie + lager i LV31 fra
    // 2026-01-01, 98 550 kr/år) er den eneste nye LV31-leietakeren med oppstart som passer.
    "partikkel as": { bygg: "Lilleakerveien 31", linjeMatch: ["b3.8", "b3.9", "b3.10", "b3.11"] },
    // v55 (2026-09-18, Morten: "kun Mustad Eiendom klassifiseres som intern. Resten skal gi
    // leieinntekter"): Mustad Eiendomsdrift AS er en vanlig leietaker. De to Ledig-linjene som
    // til og med v54 ble flyttet til intern-raden via MANUAL_UNTRACKED_OVERTAKELSER (P-Bro-
    // lagrene, Finance mai 2026: "Skrevet kontrakt på 123.000/51.000/39.000 pr år"; garderobe/
    // trimrom i Vollsveien 19, masterfila: "Internleie") blir nå Eiendomsdrifts eget budsjett.
    // MERK: P-Bro-inntekten ligger i Del B (parkeringsseksjon i Fazile) mens budsjettet er
    // Del A - samme asymmetri som all annen parkering (Del B budsjetteres ikke pr. leietaker).
    "mustad eiendomsdrift as": [
      { bygg: "P-Bro", linjeMatch: "husleie avg.fritt" },
      { bygg: "Vollsveien 19", linjeMatch: "internleie" },
    ],
  };
  // Privatpersoner (og enkeltpersonforetak uten selskapsform) holdes i en gitignored fil - samme
  // verdiformer som over (streng eller objekt).
  const MANUAL_FLYTTET_INN_PRIVATE_FILE = path.join(__dirname, "refresh-data", "_private-flyttet-inn-overrides.json");
  if (fs.existsSync(MANUAL_FLYTTET_INN_PRIVATE_FILE)) {
    const privateOverrides = JSON.parse(fs.readFileSync(MANUAL_FLYTTET_INN_PRIVATE_FILE, "utf8"));
    for (const [key, value] of Object.entries(privateOverrides)) {
      if (key.startsWith("_")) continue; // "_comment"
      MANUAL_FLYTTET_INN_OVERRIDES[key] = value;
    }
  }
  // v8 (2026-08-29): Ledig-linjer som fjernes UTEN å overføres til noen ekstern leietaker-rad.
  // Situasjoner:
  //  1) DOBBELTBUDSJETTERT - Excel sin "Ledig"-linje er aldri fjernet etter at arealet faktisk ble
  //     leid ut, MENS leietakeren allerede har sin EGEN, fulle, separate budsjettlinje et annet
  //     sted i samme Excel-ark. Å overføre beløpet HIT i tillegg ville dobbelttalt det - oppdaget
  //     2026-08-29 (Morten): Vollsveien 21 sine linjer "Utleid til RCCL fra 01.01.2026" og "Uteleid
  //     til Eternal Clothing AS fra 01.01.2025" pekte begge på leietakere (RCL Cruises Ltd.,
  //     Eternal Clothing AS) som ALLEREDE har egne, komplette budsjettrader (457 917,81 kr og
  //     123 482,87 kr) - de to Ledig-linjene var rene, ikke-oppdaterte levninger i Excel-arket.
  //  2) Ikke utleibart areal Finance selv har nullet (V21 U.01 "Fellesareal").
  //  3) INTERNLEIE (v15, utgått i v55) - P-Bro-lagrene og garderobe/trimrom i Vollsveien 19 ble
  //     flyttet til MUSTAD_INTERN_LABEL-raden via `overforTil` så lenge Mustad Eiendomsdrift
  //     var intern. Fra v55 (Morten 2026-09-18) er Eiendomsdrift en vanlig leietaker, og de to
  //     linjene ligger i MANUAL_FLYTTET_INN_OVERRIDES over i stedet. `overforTil` beholdes som
  //     mekanisme for eventuelle senere tilfeller.
  // `linjeMatch`: delstreng (case-insensitive) som identifiserer HVILKEN/HVILKE linje(r) i
  // Ledig-radens linjer[] dette gjelder - kan matche flere linjer (f.eks. RCCL sine to rom).
  // Beløpet regnes ut fra de FAKTISKE linjeverdiene (ikke håndskrevet), og linjene fjernes fra
  // linjer[]. `kort` = etikett i Ledig-radens postliste/auto-kommentar, `beskrivelse` = full
  // begrunnelse (hover i UI).
  const MANUAL_UNTRACKED_OVERTAKELSER = {
    "Vollsveien 21": [
      {
        kort: "RCL Cruises Ltd. (egen budsjettrad)",
        beskrivelse: "Dobbeltbudsjettert: arealet er allerede utleid til RCL Cruises Ltd. (RCCL), som har sin egen, fulle budsjettlinje andre steder i tabellen - denne Ledig-linjen var en levning i Excel-arket.",
        linjeMatch: "utleid til rccl",
      },
      {
        kort: "Eternal Clothing AS (egen budsjettrad)",
        beskrivelse: "Dobbeltbudsjettert: arealet er allerede utleid til Eternal Clothing AS, som har sin egen, fulle budsjettlinje andre steder i tabellen - denne Ledig-linjen var en levning i Excel-arket.",
        linjeMatch: "uteleid til eternal clothing",
      },
      // U.01 "Fellesareal" (20 140 kr) fjernes IKKE her selv om Finance nullet den i mars - den er
      // et reelt budsjettbeløp som ikke kommer, og skal vises som "nullet" Ledig-linje (mangel mot
      // budsjett), ikke forsvinne fra budsjettsummen slik de dobbeltbudsjetterte linjene gjør.
    ],
    "Lilleakerveien 2C": [
      {
        kort: "Parkly AS (egen budsjettrad)",
        beskrivelse: "Dobbeltbudsjettert: Finance (mars 2026): \"Parkly leier her.\" - Parkly AS har egen, full budsjettrad andre steder i tabellen.",
        linjeMatch: "rom nr 7",
      },
    ],
  };
  // v55c: oppføringer som navngir leietakere i `kort`/`beskrivelse` holdes i en gitignored fil
  // (ANONYMISERING.md), samme mønster som MANUAL_FLYTTET_INN_PRIVATE_FILE. Form: { "<fullt
  // byggnavn>": [ { kort, beskrivelse, linjeMatch, maksLinjer?, overforTil? } ] } - slås sammen med
  // (legges etter) de committede oppføringene for samme bygg.
  const MANUAL_UNTRACKED_PRIVATE_FILE = path.join(__dirname, "refresh-data", "_private-untracked-overtakelser.json");
  if (fs.existsSync(MANUAL_UNTRACKED_PRIVATE_FILE)) {
    const privateUntracked = JSON.parse(fs.readFileSync(MANUAL_UNTRACKED_PRIVATE_FILE, "utf8"));
    for (const [bygg, poster] of Object.entries(privateUntracked)) {
      if (bygg.startsWith("_") || !Array.isArray(poster)) continue;
      MANUAL_UNTRACKED_OVERTAKELSER[bygg] = [...(MANUAL_UNTRACKED_OVERTAKELSER[bygg] || []), ...poster];
    }
  }

  // Kjører async pga. kommentar-oppslag/skriving mot Redis (overskriver aldri en kommentar
  // Morten har skrevet manuelt, se settAutoKommentar).
  async function kobleFlyttetInnOgTrekkFra(delALeietakerRader) {
    const ledigRader = delALeietakerRader.filter((r) => r.navn.startsWith(LEDIG_LABEL_PREFIX));
    const koblede = new Set(); // leietaker-rader som er nestet under en Ledig-rad (telles til slutt)
    // overføringer[ledigRad.navn] = { sum, poster: [{navn, belop, type, beskrivelse?}] } - blir
    // Ledig-radens `ledigPoster` (UI) og grunnlaget for nytt budsjett + auto-kommentar.
    const overforinger = new Map();
    // v60 (2026-09-19, Morten om Ledige lokaler: "det er kun til info ... da kan jo positive avvik
    // også vises, det bør vises"): `belop` er en SKIVE AV DET GAMLE LEDIG-BUDSJETTET tilskrevet
    // leietakeren (aldri større enn budsjettet selv, se andel-utregningen under - matematisk umulig
    // å vise positivt avvik). `faktiskInntekt` er leietakerens EGEN fullårsverdi på nøyaktig dette
    // bygget, fra deres egne Fazile-linjer - en ekte, uavhengig tall som kan ligge over ELLER under
    // det opprinnelige budsjettet. Kun for "Ledige lokaler"-oversikten (app/IncomeForecastSection.tsx
    // sin LedigeLokalerBlock) - påvirker ikke `belop`/`rad.budsjett`/prognosen for øvrig.
    function leggTilOverforing(ledigRad, navn, belop, type, beskrivelse, faktiskInntekt) {
      if (!overforinger.has(ledigRad.navn)) overforinger.set(ledigRad.navn, { sum: 0, poster: [] });
      const o = overforinger.get(ledigRad.navn);
      // v52: "nestet" teller IKKE i sum. Sum er det som faktisk TREKKES FRA Ledig-radens budsjett;
      // en nestet post vises i "Flyttet inn her"-listen, men budsjettet blir liggende på Ledig-raden.
      if (type !== "nestet") o.sum = round2(o.sum + belop);
      // Samme leietaker kan ta flere linjer i samme Ledig-rad (Komplett: 3) - én post pr. leietaker.
      const eksisterende = o.poster.find((p) => p.type === type && p.navn === navn);
      if (eksisterende) {
        eksisterende.belop = round2(eksisterende.belop + belop);
        // Overskriv (ikke legg til) - faktiskInntekt er en fersk summering av ALLE leietakerens
        // linjer på bygget hver gang, ikke en delverdi som skal akkumuleres per kall.
        if (faktiskInntekt !== undefined) eksisterende.faktiskInntekt = round2(faktiskInntekt);
      } else {
        o.poster.push({
          navn,
          belop: round2(belop),
          type,
          ...(beskrivelse ? { beskrivelse } : {}),
          ...(faktiskInntekt !== undefined ? { faktiskInntekt: round2(faktiskInntekt) } : {}),
        });
      }
    }
    // Leietakerens egen fullårsverdi på ETT spesifikt bygg (summen av deres EGNE Fazile-linjer der) -
    // uavhengig av hva som ble trukket fra Ledig-budsjettet. Brukes kun til faktiskInntekt over.
    function faktiskInntektPaBygg(rad, bygg) {
      return round2((rad.linjer || []).filter((l) => normalizeName(l.bygg) === normalizeName(bygg)).reduce((s, l) => s + l.fullArsverdi2026, 0));
    }
    function finnLinjer(ledigRad, fulltBygg, linjeMatch) {
      const treff = [];
      for (const m of Array.isArray(linjeMatch) ? linjeMatch : [linjeMatch]) {
        const mm = m.toLowerCase();
        const funnet = ledigRad.linjer.filter((l) => normalizeName(l.bygg) === normalizeName(fulltBygg) && l.beskrivelse.toLowerCase().includes(mm));
        if (funnet.length === 0) varsel(`ADVARSEL: fant ingen linje som matcher "${m}" i "${ledigRad.navn}" - sjekk om teksten er endret.`);
        for (const l of funnet) if (!treff.includes(l)) treff.push(l);
      }
      return treff;
    }

    // 1) Manuelt bekreftede leietakere (MANUAL_FLYTTET_INN_OVERRIDES). To pass: først samles alle
    // krav pr. Ledig-linje (flere leietakere kan peke på samme linje - Lilleakerveien 26), så
    // deles hver linjes verdi likt mellom dem som krevde den, og linjen fjernes fra Ledig-raden.
    const krav = new Map(); // linje -> { ledigRad, rader: [] }
    const brukteOverrides = new Set();
    for (const rad of delALeietakerRader) {
      if (rad.navn.startsWith(LEDIG_LABEL_PREFIX)) continue;
      const nokkel = normalizeName(rad.navn);
      const spesifikasjon = MANUAL_FLYTTET_INN_OVERRIDES[nokkel];
      if (!spesifikasjon) continue;
      brukteOverrides.add(nokkel);
      const liste = typeof spesifikasjon === "string" ? [{ bygg: spesifikasjon }] : Array.isArray(spesifikasjon) ? spesifikasjon : [spesifikasjon];
      for (const spec of liste) {
        const ledigRad = finnLedigRad(ledigRader, spec.bygg);
        if (!ledigRad) {
          varsel(`ADVARSEL: fant ingen Ledig-rad for bygg "${spec.bygg}" (manuell override for "${rad.navn}") - sjekk stavemåte.`);
          continue;
        }
        if (!rad.flyttetInnI) rad.flyttetInnI = ledigRad.navn;
        koblede.add(rad);
        if (!spec.linjeMatch) continue;
        for (const linje of finnLinjer(ledigRad, spec.bygg, spec.linjeMatch)) {
          if (!krav.has(linje)) krav.set(linje, { ledigRad, rader: [], ikkeBudsjett: spec.ikkeBudsjett === true });
          krav.get(linje).rader.push(rad);
        }
      }
    }
    for (const nokkel of Object.keys(MANUAL_FLYTTET_INN_OVERRIDES)) {
      if (!brukteOverrides.has(nokkel)) varsel(`ADVARSEL: override "${nokkel}" treffer ingen leietaker-rad i Del A - utgått navn (merge/rebrand) eller stavefeil?`);
    }
    for (const [linje, { ledigRad, rader, ikkeBudsjett }] of krav) {
      const andel = round2(linje.fullArsverdi2026 / rader.length);
      for (const rad of rader) {
        if (!ikkeBudsjett) rad.budsjett = round2((rad.budsjett || 0) + andel);
        oppdaterAvvik(rad);
        leggTilOverforing(ledigRad, rad.navn, andel, ikkeBudsjett ? "nestet" : "leietaker", undefined, faktiskInntektPaBygg(rad, linje.bygg));
      }
      // v48: linjen MÅ ut av Ledig-radens liste når beløpet er trukket fra budsjettet, ellers
      // stemmer ikke "sum gjenværende linjer" med "gjenstående budsjett" (kontrollen lenger nede).
      // v52: med ikkeBudsjett blir budsjettet liggende, og da skal linjen også bli liggende.
      if (!ikkeBudsjett) ledigRad.linjer = ledigRad.linjer.filter((l) => l !== linje);
    }

    // 2) Automatisk kommentar-matchede linjer - vi VET nøyaktig hvilken linje dette gjelder,
    // fjern den fra Ledig-radens linjer[] og overfør nøyaktig dens verdi.
    for (const ledigRad of ledigRader) {
      const beholdLinjer = [];
      for (const linje of ledigRad.linjer) {
        if (!linje._kommentarRaw) {
          beholdLinjer.push(linje);
          continue;
        }
        // To kandidat-fraser: hele kommentaren (dekker "Djurny Sykkelbutikk"/"PPM Prosjekt"-
        // mønsteret, ren navnekommentar uten punktum) og teksten FØR første punktum (dekker
        // "Serendipity. Arealene..."/"Medu. Arealene..."-mønsteret, navn+fritekst). Sjekkes mot
        // leietakerens KJERNE-navn i retningen kjerne.startsWith(kandidat) - IKKE omvendt - siden
        // Finance sin kommentar typisk er et kortnavn ("Serendipity"), mens leietakerens fulle
        // navn ofte er lengre ("Serendipity Partners Management AS"). Denne retningen gjør også
        // lange, tilfeldige fritekst-fraser ("Tilbud avgitt til Appear", "Uteleid til Eternal
        // Clothing AS fra 01.01.2025") trygt umulige å matche ved et uhell.
        // v48 (2026-09-11, Morten: "budsjettet bør vel stå nede på Serendipity? ... her burde vel
        // Appear dukket opp?" og "det som ligger igjen på de ledige bør være budsjett som ikke har
        // materialisert seg i inntekt"): den gamle regelen krevde at leietakernavnet sto FØRST i
        // kommentaren ("Serendipity. Arealene tegnes om"), og avviste med vilje fraser som "Tilbud
        // avgitt til Appear" og "Skal deles. Head tar 285kvm". Konsekvensen var at budsjett for
        // areal som FAKTISK ble leid ut ble liggende igjen på Ledig-raden som om det var tomgang.
        // Nå leter vi etter leietakerens kjernenavn HVOR SOM HELST i kommentaren. Det som gjør det
        // trygt er byggkravet under: navnet teller bare hvis leietakeren faktisk har kontraktslinjer
        // i nettopp det bygget. En tilfeldig navnenevnelse for en leietaker som ikke er der, treffer
        // ikke. `rad.budsjett !== 0`-sperren er også borte - den holdt Appear ute nettopp fordi
        // Appear allerede hadde eget budsjett, som er helt normalt for en utvidelse.
        const helKommentar = normalizeName(linje._kommentarRaw);
        const forsteSetning = normalizeName(linje._kommentarRaw.split(".")[0]);
        const kandidater = [...new Set([forsteSetning, helKommentar])].filter((k) => k.length >= 4);
        let matchet = false;
        for (const rad of delALeietakerRader) {
          // `rad.flyttetInnI` er IKKE lenger et utelukkelseskriterium (v48): en leietaker kan ha
          // tatt over FLERE budsjettposter fra samme Ledig-rad - Appear har to ("Tilbud avgitt til
          // Appear" på 1 170 000 og 561 000), og med den gamle sperren fikk de bare den første.
          if (rad === ledigRad || rad.navn.startsWith(LEDIG_LABEL_PREFIX)) continue;
          const kjerne = coreName(rad.navn);
          if (kjerne.length < 4) continue;
          // To matcheretninger, begge nødvendige:
          //  a) kommentaren INNEHOLDER kjernenavnet - "Skal deles. Head tar 285kvm", "Tilbud
          //     avgitt til Appear". Den nye i v48.
          //  b) kjernenavnet STARTER MED kommentaren - "Serendipity. Arealene tegnes om" mot
          //     "Serendipity Partners Management AS". Den opprinnelige; uten den faller
          //     Serendipity ut, noe den gjorde da jeg først bare snudde retningen.
          const treff = helKommentar.includes(kjerne) || kandidater.some((k) => kjerne.startsWith(k));
          if (!treff) continue;
          const harSammeBygg = rad.linjer.some((l) => normalizeName(l.bygg) === normalizeName(linje.bygg));
          if (!harSammeBygg) continue;
          rad.budsjett = round2((rad.budsjett || 0) + linje.fullArsverdi2026);
          rad.flyttetInnI = ledigRad.navn;
          oppdaterAvvik(rad);
          leggTilOverforing(ledigRad, rad.navn, linje.fullArsverdi2026, "leietaker", undefined, faktiskInntektPaBygg(rad, linje.bygg));
          koblede.add(rad);
          matchet = true;
          break;
        }
        if (!matchet) beholdLinjer.push(linje);
      }
      ledigRad.linjer = beholdLinjer;
    }

    // 3) Usporede overtakelser (ingen ekstern leietaker-rad å legge beløpet på). Finn ALLE linjer
    // i Ledig-raden hvis `beskrivelse` (som allerede inneholder Excel sin kommentartekst, se
    // build-tenant-budget.js) matcher `linjeMatch`, summer deres FAKTISKE verdi (ikke et
    // håndskrevet tall) og fjern dem fra linjer[]. `overforTil` (v15) flytter budsjettet til en
    // navngitt rad (intern-raden) i stedet for å bare forsvinne.
    for (const [fulltBygg, poster] of Object.entries(MANUAL_UNTRACKED_OVERTAKELSER)) {
      const ledigRad = finnLedigRad(ledigRader, fulltBygg);
      if (!ledigRad) {
        varsel(`ADVARSEL: fant ingen Ledig-rad for bygg "${fulltBygg}" (usporet overtakelse) - sjekk stavemåte.`);
        continue;
      }
      for (const p of poster) {
        // v55c: `maksLinjer` begrenser hvor mange like linjer som tas ut (Excel kan ha flere
        // identiske "areal X"-linjer der bare én er dobbeltbudsjettert - uten grensen forsvant alle).
        const matchendeLinjer = finnLinjer(ledigRad, fulltBygg, p.linjeMatch).slice(0, p.maksLinjer || Infinity);
        if (matchendeLinjer.length === 0) continue;
        const belop = round2(matchendeLinjer.reduce((s, l) => s + l.fullArsverdi2026, 0));
        let type = "usporet";
        if (p.overforTil) {
          const mottaker = delALeietakerRader.find((r) => r.navn === p.overforTil);
          if (mottaker) {
            mottaker.budsjett = round2((mottaker.budsjett || 0) + belop);
            oppdaterAvvik(mottaker);
            type = "intern";
          } else {
            varsel(`ADVARSEL: fant ingen rad "${p.overforTil}" å overføre ${belop} kr fra "${ledigRad.navn}" til - beholdt som usporet.`);
          }
        }
        leggTilOverforing(ledigRad, p.kort, belop, type, p.beskrivelse);
        ledigRad.linjer = ledigRad.linjer.filter((l) => !matchendeLinjer.includes(l));
      }
    }

    // 4) Pr.-Ledig-rad-oppdatering for ALLE Ledig-rader (også de uten overføringer, så feltene
    // alltid finnes for UI-en): opprinnelig/trukket ut/gjenstående, postliste, Finance-vurdering
    // pr. gjenværende linje, navnestripping og auto-kommentar.
    // v15 (2026-09-06): siden alt som trekkes ut nå er eksakte linjeverdier, er gjenstående
    // budsjett ALLTID = summen av de gjenværende linjene og aldri negativt. (v2 2026-09-01 lot
    // Ledig-rader gå negativt fordi leietakerens FAKTISKE leie ble trukket - den over-/under-
    // dekningen vises nå på leietakerens egen rad i stedet, se MANUAL_FLYTTET_INN_OVERRIDES.)
    const financeIndeks = lastFinanceLedigIndeks();
    const stripp = lagNavnestripper();
    const fmt = (n) => n.toLocaleString("nb-NO");
    for (const ledigRad of ledigRader) {
      const o = overforinger.get(ledigRad.navn);
      const opprinnelig = ledigRad.budsjett;
      const trukket = o ? o.sum : 0;
      // Bevart for den dedikerte "Ledige lokaler"-oversikten (app/IncomeForecastSection.tsx) -
      // budsjett-feltet blir GJENSTÅENDE under, så original + trukket-ut må lagres separat.
      ledigRad.ledigOpprinneligBudsjett = opprinnelig;
      ledigRad.ledigTrukketUt = trukket;
      // v47 (2026-09-11, Morten: "avviket må bli stående på Ledig LV2B siden Komplett bare er en
      // bonus at vi fikk inn"): budsjettet flyttes IKKE lenger fra Ledig-raden til leietakeren som
      // flyttet inn. Før fikk f.eks. Komplett ASA et budsjett på 1 785 534 kr som ikke finnes noe
      // sted i budsjettfila, og framsto dermed med −1 510 534 i avvik - som om en leietaker sviktet
      // et mål de aldri hadde. Budsjettet ble laget for AREALET, ikke for leietakeren. Nå blir det
      // stående på Ledig-raden, og leietakeren viser sin inntekt som ren oppside. Overføringene
      // beregnes fortsatt (ledigPoster/ledigTrukketUt) og vises i "Flyttet inn her"-listen under
      // Ledig-raden - de er dokumentasjon, ikke lenger en flytting av tall.
      ledigRad.ledigTrukketUt = trukket;
      // v48: Ledig-raden beholder KUN budsjett som ikke har materialisert seg i inntekt. Det som er
      // overført til en navngitt leietaker trekkes fra igjen (v47 sluttet å trekke fra i det hele
      // tatt - det var for grovt: da sto areal Head og Serendipity faktisk leier igjen som tomgang).
      ledigRad.budsjett = round2(opprinnelig - trukket);
      oppdaterAvvik(ledigRad);
      ledigRad.ledigPoster = o ? o.poster.sort((a, b) => b.belop - a.belop) : [];
      const sumLinjer = round2(ledigRad.linjer.reduce((s, l) => s + l.fullArsverdi2026, 0));
      if (Math.abs(sumLinjer - ledigRad.budsjett) > 1) {
        varsel(`ADVARSEL: ${ledigRad.navn}: gjenstående budsjett ${fmt(ledigRad.budsjett)} kr != sum gjenværende linjer ${fmt(sumLinjer)} kr - avrunding/deling gikk galt.`);
      }
      for (const linje of ledigRad.linjer) {
        linje.beskrivelse = stripp(linje.beskrivelse);
        // Budsjettets egen "Kommentar inntekt" som eget felt (Morten 2026-09-06): for de store
        // gjenværende linjene vil han se hva Finance budsjetterte utleid som IKKE ble leid ut.
        // Ligger også bakt inn i beskrivelse ("objekt — kommentar"), UI-en skiller dem igjen.
        if (linje._kommentarRaw) linje.budsjettKommentar = stripp(linje._kommentarRaw);
        const fin = finnFinanceLinje(financeIndeks, linje);
        if (!fin) {
          if (financeIndeks) varsel(`ADVARSEL: ${ledigRad.navn}: ingen Finance-linje for "${linje.beskrivelse}" (${fmt(linje.fullArsverdi2026)} kr) - uten vurdering/kommentar.`);
          continue;
        }
        linje.financeEndring = round2((fin.sumEndring || 0) * fin.faktor);
        // "nullet" = Finance har tatt hele beløpet ut av prognosen (står ledig ut året), ellers
        // forventes arealet fortsatt utleid i år (helt eller delvis).
        linje.ledigVurdering = fin.prognoseJuli <= 0.5 ? "nullet" : "forventet";
        const siste = [...(fin.kommentarer || [])].reverse().find((k) => k.tekst && k.tekst.trim());
        if (siste) linje.financeKommentar = stripp(`${siste.mnd}: ${siste.tekst.trim()}`);
      }
      const kommentar = o && o.poster.length > 0
        ? `Utleid/trukket ut fra denne Ledig-raden (samlet ${fmt(o.sum)} kr/år): ${ledigRad.ledigPoster.map((p) => `${p.navn} (${fmt(p.belop)} kr)`).join("; ")}.`
        : "";
      await settAutoKommentar(ledigRad.navn, kommentar);
    }

    // 5) Auto-kommentar på leietakerens EGEN rad (kun hvis leietakeren ikke har en manuell).
    for (const rad of koblede) {
      // Kan ha tatt linjer i flere Ledig-rader (Rob Arnesen: LV4A + LV10) - summer på tvers.
      const poster = [...overforinger.entries()]
        .flatMap(([ledigNavn, o]) => o.poster.filter((p) => p.type === "leietaker" && p.navn === rad.navn).map((p) => ({ ledigNavn, belop: p.belop })));
      const sum = round2(poster.reduce((s, p) => s + p.belop, 0));
      const hvor = poster.length > 1 ? poster.map((p) => `${p.ledigNavn} ${fmt(p.belop)} kr`).join(", ") : rad.flyttetInnI;
      await settAutoKommentar(
        rad.navn,
        poster.length > 0
          ? `Tok over ledig areal (${hvor}) - ${fmt(sum)} kr/år overført fra Ledig-budsjettet dit.`
          : `Flyttet inn i ledig areal (${rad.flyttetInnI}) uten egen budsjettlinje - inntekten er oppside mot budsjett.`,
      );
    }

    // 6) Usporede overtakelser: budsjett trukket fra en Ledig-rad uten at noen leietakerrad tok
    // imot det (MANUAL_UNTRACKED_OVERTAKELSER uten `overforTil`). Uten denne samleraden forsvinner
    // beløpet ut av leietaker-grupperingen, og budsjett-summen der stemmer ikke med bygg-/
    // leietype-grupperingen. Kontrollsummen mellom grupperingene fanger det umiddelbart - den har
    // gjort det to ganger under dette arbeidet, så raden er ikke valgfri.
    const usporetSum = round2(
      [...overforinger.values()].reduce(
        (s, o) => s + o.poster.filter((p) => p.type === "usporet").reduce((t, p) => t + p.belop, 0),
        0,
      ),
    );
    if (usporetSum !== 0) {
      delALeietakerRader.push({
        navn: USPORET_OVERTAKELSE_LABEL,
        fakturert: 0,
        gjenstar: 0,
        budsjett: usporetSum,
        avvik: round2(-usporetSum),
        linjer: [],
      });
      console.log(
        `Usporede overtakelser: ${fmt(usporetSum)} kr budsjett samlet på raden "${USPORET_OVERTAKELSE_LABEL}" (trukket fra Ledig-rader uten mottakerrad).`,
      );
    }

    // _kommentarRaw er internt/midlertidig (kun brukt til matchingen over) - skal ALDRI havne i
    // det publiserte Redis-snapshotet/API-et.
    for (const ledigRad of ledigRader) {
      for (const linje of ledigRad.linjer) delete linje._kommentarRaw;
    }
    return koblede.size;
  }

  function fuzzyLookupFn(rows) {
    const lookup = buildBudgetLookup(rows);
    return (navn) => lookupBudget(navn, lookup);
  }
  // kanoniskByggNavn brukes OGSÅ her (v45): uten det virker aliaset bare på inntektssiden, og
  // budsjettraden ville fortsatt ligget igjen under sitt eget Excel-navn som en "ufordelt" rad.
  function exactLookupFn(rows) {
    const byNorm = new Map(rows.map((r) => [normalizeName(kanoniskByggNavn(r.navn)), r.budsjett]));
    return (navn) => {
      const n = normalizeName(kanoniskByggNavn(navn));
      return byNorm.has(n) ? { budsjett: byNorm.get(n), via: [] } : null;
    };
  }

  const budgetLookupA = { leietaker: fuzzyLookupFn(budget.delA.leietaker), bygg: exactLookupFn(budget.delA.bygg), leietype: exactLookupFn(budget.delA.leietype) };
  const budgetLookupB = { leietaker: fuzzyLookupFn(budget.delB.leietaker), bygg: exactLookupFn(budget.delB.bygg), leietype: exactLookupFn(budget.delB.leietype) };

  const { classify: classifyLeietype, oppsummering: leietypeOppsummering } = buildLeietypeClassifier(budgetLookupA.leietaker);

  // Leietaker-grupperingen bruker byggGruppe-tallene DIREKTE (uendret fra v1 - mer nøyaktig enn
  // den proporsjonale linje-fordelingen over for selve fakturert/gjenstår-SUMMEN). v11 (2026-08-29,
  // Morten: "kontoer og fakturert pr konto ... linjer fra Fazile og gjenstår å fakturere") -
  // drilldownen trenger likevel BEGGE detaljnivåer pr. rad:
  //  1) `kontoer`: NXT-kontofordelingen (kontoFordelingDelA/DelB fra REMAINING) summert på tvers
  //     av leietakerens byggGrupper (samme konto i to bygg slås sammen til én rad).
  //  2) `linjer[].gjenstarShare`: byggGruppens gjenstår fordelt proporsjonalt over LINJENE i den
  //     gruppen (samme prinsipp som linesA/linesB over, men nå også bevart pr. leietaker-rad, ikke
  //     bare til bygg-/leietype-summeringen).
  function buildLeietakerMap(del) {
    const map = new Map();
    for (const tenant of remaining.tenants) {
      // intern-egenleie (v14, Mustad Eiendom AS i eget selskap) er 0/0 uansett, men holdes eksplisitt
      // utenfor slik at Mustad ikke dukker opp som en ekstern leietaker-rad.
      const reelleGrupper = tenant.byggGrupper.filter((b) => b.status !== "intern-mustad" && b.status !== "intern-egenleie");
      if (reelleGrupper.length === 0) continue;
      const fakturert = round2(reelleGrupper.reduce((s, b) => s + (del === "A" ? b.alleredeFakturertDelA : b.alleredeFakturertDelB), 0));
      const gjenstar = round2(reelleGrupper.reduce((s, b) => s + (del === "A" ? b.gjenstarDelA : b.gjenstarDelB), 0));
      if (fakturert === 0 && gjenstar === 0) continue;

      const kontoerMap = new Map();
      for (const b of reelleGrupper) {
        for (const k of (del === "A" ? b.kontoFordelingDelA : b.kontoFordelingDelB) || []) {
          kontoerMap.set(k.konto, round2((kontoerMap.get(k.konto) || 0) + k.belop));
        }
      }
      const kontoer = [...kontoerMap.entries()]
        .map(([konto, belop]) => ({ konto, belop }))
        .sort((a, b) => Math.abs(b.belop) - Math.abs(a.belop));

      const linjer = [];
      for (const b of reelleGrupper) {
        const linjerIGruppe = tenant.lines.filter((l) => l.del === del && normalizeName(l.bygg) === normalizeName(b.bygg));
        const fullGruppe = round2(linjerIGruppe.reduce((s, l) => s + l.fullArsverdi2026, 0));
        const gjenstarGruppe = del === "A" ? b.gjenstarDelA : b.gjenstarDelB;
        if (fullGruppe === 0 && gjenstarGruppe !== 0) {
          // Samme "ingen Fazile-linje å fordele over"-hull som i linesA/linesB-fallbacken over -
          // uten denne ville leietakerens EGEN drilldown ("Fazile-linje -> Gjenstår") ikke summere
          // til raden sitt eget gjenstår-tall for byggGrupper uten en del-klassifisert linje.
          linjer.push({ eiendom: "", bygg: b.bygg, linjetype: "", beskrivelse: "Gjenstår uten egen Fazile-linje", del, fullArsverdi2026: 0, startDato: null, sluttDato: null, gjenstarShare: gjenstarGruppe });
          continue;
        }
        for (const line of linjerIGruppe) {
          const andel = fullGruppe > 0 ? line.fullArsverdi2026 / fullGruppe : 0;
          linjer.push({ ...line, gjenstarShare: round2(gjenstarGruppe * andel) });
        }
      }
      // v16: statuser utenom "ok" (avsluttet, forklart-*, fazile-plan-mangler, ...) og den svakeste
      // NXT-matchemetoden på tvers av byggGruppene (kundenr > navn-eksakt > alias > kjerne-navn >
      // ingen) - kun grupper med tall i denne Del'en teller.
      const grupperMedTall = reelleGrupper.filter((b) => (del === "A" ? b.alleredeFakturertDelA || b.gjenstarDelA : b.alleredeFakturertDelB || b.gjenstarDelB));
      const remainingStatuser = [...new Set(grupperMedTall.map((b) => b.status).filter((s) => s && s !== "ok"))].sort();
      const NXT_MATCH_RANG = ["kundenr", "navn-eksakt", "alias", "kjerne-navn", "ingen"];
      const nxtMatch = grupperMedTall
        .map((b) => b.nxtMatch)
        .filter(Boolean)
        .sort((a, b) => NXT_MATCH_RANG.indexOf(b) - NXT_MATCH_RANG.indexOf(a))[0];
      map.set(tenant.navn, { fakturert, gjenstar, kontoer, linjer, remainingStatuser, nxtMatch });
    }
    return map;
  }

  // v12 (2026-08-30, Morten: "fakturert viser korrekt total på tvers av leietakere, bygg og
  // leietype") - reelt NXT-fakturert for intern-mustad-byggGrupper (Mustad sine egne lokaler),
  // Del A/B hver for seg. Brukes til å erstatte MUSTAD_INTERN_LABEL-radens tidligere fakturert=
  // budsjett-erstatning (Del A, se medBudsjett()) og til å legge til en tilsvarende rad for Del B
  // (som ellers manglet HELT, siden budget.delB.leietaker alltid er tom - se filhode).
  //
  // v28 (2026-09-08): gjenstår summeres nå på samme måte som fakturert. Det ble tidligere ikke
  // gjort, og siden buildLeietakerMap() hopper over intern-mustad-gruppene helt, fantes disse
  // beløpene ikke noe sted i leietaker-grupperingen - se den lange kommentaren i medBudsjett().
  let internMustadFakturertA = 0;
  let internMustadFakturertB = 0;
  let internMustadGjenstarA = 0;
  let internMustadGjenstarB = 0;
  for (const tenant of remaining.tenants) {
    for (const bg of tenant.byggGrupper) {
      if (bg.status !== "intern-mustad") continue;
      internMustadFakturertA = round2(internMustadFakturertA + bg.alleredeFakturertDelA);
      internMustadFakturertB = round2(internMustadFakturertB + bg.alleredeFakturertDelB);
      internMustadGjenstarA = round2(internMustadGjenstarA + bg.gjenstarDelA);
      internMustadGjenstarB = round2(internMustadGjenstarB + bg.gjenstarDelB);
    }
  }

  const delA = {
    leietaker: sortByAvvik(medBudsjett(buildLeietakerMap("A"), budgetLookupA.leietaker, budget.delA.leietaker, 0, internMustadFakturertA, internMustadGjenstarA)),
    bygg: sortByAvvik(medBudsjett(groupLines(linesA, (line) => kanoniskByggNavn(line.bygg)), budgetLookupA.bygg, budget.delA.bygg)),
    leietype: sortByAvvik(
      medBudsjett(
        // v55: leietype slås opp på den JURIDISKE enheten bak linjen, ikke konsernraden - Excel
        // budsjetterer pr. selskap (butikk-enheten er Butikk, antenne-enheten Punktleie), og
        // Morten (2026-09-18): "de som slås sammen må skilles når det skilles på bygg og
        // leietype". Uten dette flyttet en konsern-merge ~57 000 kr fra Butikk/Annet til Punktleie
        // fordi antenne-enhetens linjer arvet butikk-enhetens Excel-type via konsernraden.
        groupLines(linesA, (line, tenant) => classifyLeietype(line.beskrivelse, line.bygg, [line.juridiskEnhet, tenant.navn], "A", line.fullArsverdi2026)),
        budgetLookupA.leietype,
        budget.delA.leietype,
      ),
    ),
  };
  {
    const fmt = (n) => Math.round(n).toLocaleString("nb-NO");
    const bf = [...leietypeOppsummering.byggFallback.entries()].sort((a, b) => b[1].belop - a[1].belop);
    console.log(`Leietype v52: ${bf.length} leietaker/bygg fikk BYGGETS dominerende leietype (ubudsjettert, generisk linjetekst):`);
    for (const [k, v] of bf.slice(0, 25)) console.log(`  ${fmt(v.belop).padStart(12)}  ${k}  ->  ${v.leietype}`);
    const uk = [...leietypeOppsummering.uklassifisert.entries()].sort((a, b) => b[1].belop - a[1].belop);
    console.log(`Leietype v52: ${uk.length} leietaker/bygg står igjen som Uklassifisert:`);
    for (const [k, v] of uk.slice(0, 15)) console.log(`  ${fmt(v.belop).padStart(12)}  ${k}`);
  }
  const antallFlyttetInn = await kobleFlyttetInnOgTrekkFra(delA.leietaker);
  delA.leietaker = sortByAvvik(delA.leietaker); // budsjett/avvik er endret på Ledig- og leietaker-rader over
  console.log(`Flyttet-inn-kobling: ${antallFlyttetInn} leietaker(e) koblet til en Ledig-bygg-rad.`);
  // Del B: budsjett=null pr. rad (ingen pr.-leietaker/bygg/leietype-budsjett finnes - se
  // filhode) - budgetLookupB.* returnerer uansett alltid null siden budget.delB.* er tomme
  // arrays, men defaultBudsjett:null gjøres eksplisitt her for lesbarhet.
  const delB = {
    leietaker: sortByAvvik(medBudsjett(buildLeietakerMap("B"), budgetLookupB.leietaker, budget.delB.leietaker, null)),
    bygg: sortByAvvik(medBudsjett(groupLines(linesB, (line) => kanoniskByggNavn(line.bygg)), budgetLookupB.bygg, budget.delB.bygg, null)),
    leietype: sortByAvvik(
      medBudsjett(
        groupLines(linesB, (line, tenant) => classifyLeietype(line.beskrivelse, line.bygg, [line.juridiskEnhet, tenant.navn], "B", line.fullArsverdi2026)),
        budgetLookupB.leietype,
        budget.delB.leietype,
        null,
      ),
    ),
  };
  // Del B sin leietaker-gruppering har ingen budsjett-side å hekte MUSTAD_INTERN_LABEL-raden på
  // (budget.delB.leietaker er alltid []) - legges derfor til direkte her i stedet, med samme
  // budsjett=null-konvensjon som resten av Del B.
  if (internMustadFakturertB !== 0 || internMustadGjenstarB !== 0) {
    delB.leietaker = sortByAvvik([
      ...delB.leietaker,
      {
        navn: MUSTAD_INTERN_LABEL,
        fakturert: internMustadFakturertB,
        gjenstar: internMustadGjenstarB,
        budsjett: null,
        avvik: null,
        linjer: [],
        internleie: true,
      },
    ]);
  }

  for (const [label, del] of [["Del A", delA], ["Del B", delB]]) {
    for (const gruppe of ["leietaker", "bygg", "leietype"]) {
      const sumBudsjett = round2(del[gruppe].reduce((s, r) => s + (r.budsjett ?? 0), 0));
      console.log(`${label} / ${gruppe}: ${del[gruppe].length} rader, budsjett-sum ${sumBudsjett.toLocaleString("nb-NO")} kr`);
    }
  }

  // v28 (2026-09-08): de tre grupperingene er tre VISNINGER av det samme tallgrunnlaget og skal
  // derfor summere likt - men gjorde det ikke, og ingenting fanget det opp. Feilen (hardkodet
  // gjenstar:0 på MUSTAD_INTERN_LABEL-raden, se medBudsjett()) lå ute i flere uker og ga 657 022
  // kr forskjell mellom "Leieinntekter"/"Parkering"-seksjonene og toppboksen i UI-en. Nå er det en
  // hard kontrollsum: bygg-grupperingen er fasit (den bygges av linesA/linesB, som dekker ALLE
  // linjer uansett status), og leietaker/leietype må stemme med den.
  for (const [label, del] of [["Del A", delA], ["Del B", delB]]) {
    const sum = (rows, felt) => round2(rows.reduce((s, r) => s + (r[felt] ?? 0), 0));
    for (const felt of ["fakturert", "gjenstar", "budsjett"]) {
      const fasit = sum(del.bygg, felt);
      for (const gruppe of ["leietaker", "leietype"]) {
        verifyTotal(
          `${label}: ${felt}-sum i "${gruppe}"-grupperingen vs. "bygg"-grupperingen (samme tallgrunnlag, tre visninger - må summere likt)`,
          sum(del[gruppe], felt),
          fasit,
          0.01,
        );
      }
    }
  }
  const totalDelBFakturertGjenstar = round2(delB.leietaker.reduce((s, r) => s + r.fakturert + r.gjenstar, 0));
  console.log(
    `Del B totallinje: fakturert+gjenstår ${totalDelBFakturertGjenstar.toLocaleString("nb-NO")} kr mot budsjettert totallinje ${budget.totalDelB.toLocaleString("nb-NO")} kr (avvik ${round2(totalDelBFakturertGjenstar - budget.totalDelB).toLocaleString("nb-NO")} kr)`,
  );

  const snapshot = {
    sistOppdatert: remaining.sistOppdatert,
    ar: remaining.ar,
    delBBudsjettTotal: budget.totalDelB,
    delA,
    delB,
    ...(ADVARSLER.length ? { advarsler: ADVARSLER } : {}),
  };

  return pushToRedis(OUT_KEY, FIELD, snapshot, "tenant-forecast-table-snapshot.json");
}

main();
