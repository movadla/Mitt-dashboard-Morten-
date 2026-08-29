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
// "Mustad Eiendom AS/Mustad Eiendomsdrift AS" (intern-mustad-status) er ekskludert fra
// leietaker-grupperingen (ikke et reelt eksternt leieforhold) - bygg/leietype-grupperingen tar
// dem derimot med (samme prinsipp som budsjett-scriptet: bygg/leietype dekker ALT, uavhengig
// av om det er en navngitt ekstern leietaker).
//
// Kjør: node scripts/build-tenant-forecast-table.js (etter build-remaining-summary.js OG
// build-tenant-budget.js)

const fs = require("fs");
const path = require("path");
const { getFromRedis, pushToRedis, normalizeName, coreName } = require("./lib/refresh-helpers");

const REMAINING_KEY = "jobb:inntektsprognose-gjenstar-leietakere";
const BUDGET_KEY = "jobb:inntektsprognose-leietaker-budsjett";
const OUT_KEY = "jobb:inntektsprognose-leietaker-tabell";
const FIELD = "snapshot";
const EXCEL_RAW_FILE = path.join(__dirname, "refresh-data", "budsjett-2026-excel-raw.json");

// Må matche MUSTAD_INTERN_LABEL i build-tenant-budget.js. Denne raden har budsjett men ALDRI
// fakturert/gjenstår (internleie - Mustad sine egne lokaler, ekskludert fra
// buildLeietakerMap() sin REMAINING-basert fakturert/gjenstår, se der) - Morten (2026-08-26):
// vis den som fullt fakturert (fakturert=budsjett, gjenstår=0, avvik=0) i stedet for å se ut
// som 100 % under budsjett, men marker den tydelig som internleie (egen farge + hover-forklaring
// i UI-en, se `internleie`-feltet på TenantForecastRow / app/IncomeForecastSection.tsx).
const MUSTAD_INTERN_LABEL = "Mustad Eiendom (intern bruk, ikke leieforhold)";

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Samme Redis-hash/nøkkel-mønster som lib/tenantForecastComments.ts (KommentarCell i UI-en) -
// leser/skriver DIREKTE her siden dette er et Node-script uten innlogget HTTP-sesjon. Skriver
// KUN hvis feltet er tomt fra før - idempotent, overskriver aldri en kommentar Morten selv har
// skrevet (verken manuelt via UI-en eller fra en tidligere kjøring av denne funksjonen).
const KOMMENTAR_HASH_KEY = "jobb:inntektsprognose-leietaker-kommentarer";
async function settDefaultKommentarHvisTom(navn, kommentar) {
  const felt = navn.trim().toLowerCase();
  const eksisterende = await getFromRedis(KOMMENTAR_HASH_KEY, felt);
  if (eksisterende && eksisterende.kommentar) return;
  await pushToRedis(KOMMENTAR_HASH_KEY, felt, { navn, kommentar, sistOppdatert: new Date().toISOString().slice(0, 10) });
}

function buildBudgetLookup(rows) {
  const byNorm = new Map();
  const byCore = new Map();
  for (const r of rows) {
    if (r.kjerneNavn === undefined) continue; // Ufordelt-raden har ikke kjerneNavn - slås opp separat
    byNorm.set(normalizeName(r.navn), r.budsjett);
    byCore.set(r.kjerneNavn, r.budsjett);
  }
  return { byNorm, byCore };
}

function lookupBudget(navn, lookup) {
  const norm = normalizeName(navn);
  if (lookup.byNorm.has(norm)) return lookup.byNorm.get(norm);
  const core = coreName(navn);
  if (lookup.byCore.has(core)) return lookup.byCore.get(core);
  return null;
}

function buildLeietypeClassifier() {
  const excelRows = JSON.parse(fs.readFileSync(EXCEL_RAW_FILE, "utf8"));
  const byggBeskrivelse = new Map(); // "bygg||beskrivelse" -> Set(leietype)
  for (const r of excelRows) {
    const key = normalizeName(r.bygg || "") + "||" + normalizeName(r.kontraktObjekt || "");
    if (!byggBeskrivelse.has(key)) byggBeskrivelse.set(key, new Set());
    byggBeskrivelse.get(key).add(r.leietype || "Uklassifisert");
  }
  return function classify(beskrivelse, bygg) {
    const b = (beskrivelse || "").toLowerCase();
    if (/garasje/.test(b)) return "Garasje";
    if (/parkering|p-plass/.test(b)) return "Parkering";
    if (/lagerleie/.test(b)) return "Lager";
    if (/kontorleie/.test(b)) return "Kontor";
    if (/minimumsleie|omsetningsbasert|butikkleie/.test(b)) return "Butikk";
    const key = normalizeName(bygg || "") + "||" + normalizeName(beskrivelse || "");
    const types = byggBeskrivelse.get(key);
    if (types && types.size === 1) return [...types][0];
    return "Uklassifisert";
  };
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
function medBudsjett(map, lookupFn, budgetRowsForUfordelt, defaultBudsjett = 0) {
  const rows = [];
  for (const [navn, g] of map.entries()) {
    const budsjettMatch = lookupFn(navn);
    const budsjett = budsjettMatch !== null ? budsjettMatch : defaultBudsjett;
    rows.push({
      navn,
      fakturert: g.fakturert,
      gjenstar: g.gjenstar,
      budsjett,
      avvik: budsjett === null ? null : round2(g.fakturert + g.gjenstar - budsjett),
      linjer: g.linjer.sort((a, b) => b.fullArsverdi2026 - a.fullArsverdi2026),
    });
  }
  // Rader fra budsjett-siden som ikke traff noen fakturert/gjenstår-gruppe i det hele tatt
  // (f.eks. Avstemmingsdifferanse-raden, eller en leietype/bygg som kun finnes i budsjettet) -
  // tas med med fakturert/gjenstår=0, slik at budsjett-summen for grupperingen alltid stemmer
  // eksakt (kun relevant for Del A - budgetRowsForUfordelt er alltid [] for Del B).
  const dekketNavn = new Set(rows.map((r) => normalizeName(r.navn)));
  for (const b of budgetRowsForUfordelt) {
    if (dekketNavn.has(normalizeName(b.navn))) continue;
    if (b.navn === MUSTAD_INTERN_LABEL) {
      rows.push({ navn: b.navn, fakturert: b.budsjett, gjenstar: 0, budsjett: b.budsjett, avvik: 0, linjer: [], internleie: true });
      continue;
    }
    // b.linjer finnes for de bygg-splittede "Ledig (vakante lokaler) – <bygg>"-radene (v6,
    // 2026-08-28, se build-tenant-budget.js) - la dem følge med som drilldown i stedet for å
    // kaste dem bort med en hardkodet tom liste.
    rows.push({ navn: b.navn, fakturert: 0, gjenstar: 0, budsjett: b.budsjett, avvik: round2(-b.budsjett), linjer: b.linjer || [] });
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
  const remaining = await getFromRedis(REMAINING_KEY, FIELD);
  const budget = await getFromRedis(BUDGET_KEY, FIELD);
  if (!remaining) throw new Error(`Fant ikke snapshot i Redis: ${REMAINING_KEY}/${FIELD} - kjør build-remaining-summary.js først.`);
  if (!budget) throw new Error(`Fant ikke snapshot i Redis: ${BUDGET_KEY}/${FIELD} - kjør build-tenant-budget.js først.`);

  const classifyLeietype = buildLeietypeClassifier();

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
  // leieperioden, registrert som to separate Fazile-kunder over tid - begge nestes derfor under
  // samme Ledig-rad).
  const MANUAL_FLYTTET_INN_OVERRIDES = {
    "zeg power as": "Lilleakerveien 2B",
    "komplett asa": "Lilleakerveien 2B",
    "metesa as": "Lilleakerveien 2B",
    "rema 1000 norge as": "Vollsveien 13D",
    "movr as": "Vollsveien 13C",
    "autismeforeningen i norge": "Vollsveien 21",
    "rob arnesen as": "Lilleakerveien 4A",
    "higheredos as": "Lilleakerveien 4A",
    "veidekke entreprenør as": "Lilleakerveien 2E",
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
    "norsk elkraft kontroll as": "Lilleakerveien 4C",
    // Runde 3 (2026-08-29) - Morten bekreftet: Origon AS har en helt ny leielinje i Vollsveien 17
    // (Kontorleie avg.pl., start 2026-09-04) som IKKE finnes noe sted i Excel-budsjettet (Origon
    // sitt EKSISTERENDE budsjett dekker kun Vollsveien 13B/13C fra før - derfor ble denne aldri
    // fanget opp av budsjett=0-sweepen i runde 1/2, siden Origon sin RAD totalt sett ikke er 0).
    // Overføringen under summerer kun Origon sine linjer I NETTOPP Vollsveien 17 (se
    // implementasjonen), så 13B/13C-delen av budsjettet hans er upåvirket.
    "origon as": "Vollsveien 17",
  };
  // v8 (2026-08-29): beløp som trekkes fra en Ledig-rad UTEN å overføres til noen leietaker-rad.
  // To ulike, men regnemessig identiske, situasjoner:
  //  1) Bekreftet overtatt, men ikke registrert som egen kontraktslinje i Fazile ennå
  //     (Head Norway AS sin 285 kvm i Vollsveien 13D).
  //  2) DOBBELTBUDSJETTERT - Excel sin "Ledig"-linje er aldri fjernet etter at arealet faktisk ble
  //     leid ut, MENS leietakeren allerede har sin EGEN, fulle, separate budsjettlinje et annet
  //     sted i samme Excel-ark. Å overføre beløpet HIT i tillegg ville dobbelttalt det - oppdaget
  //     2026-08-29 (Morten): Vollsveien 21 sine linjer "Utleid til RCCL fra 01.01.2026" og "Uteleid
  //     til Eternal Clothing AS fra 01.01.2025" pekte begge på leietakere (RCL Cruises Ltd.,
  //     Eternal Clothing AS) som ALLEREDE har egne, komplette budsjettrader (457 917,81 kr og
  //     123 482,87 kr) - de to Ledig-linjene var rene, ikke-oppdaterte levninger i Excel-arket.
  // `linjeMatch`: delstreng (case-insensitive) som identifiserer HVILKEN/HVILKE linje(r) i
  // Ledig-radens linjer[] dette gjelder - kan matche flere linjer (f.eks. RCCL sine to rom).
  // Beløpet regnes ut fra de FAKTISKE linjeverdiene (ikke håndskrevet), og linjene fjernes fra
  // linjer[] - samme "fjern det som faktisk er tatt"-prinsipp som punkt 2 over, bare uten en
  // leietaker-rad å overføre til.
  const MANUAL_UNTRACKED_OVERTAKELSER = {
    "Vollsveien 13D": [
      {
        beskrivelse: "285 kvm av restarealet er avtalt til Head Norway AS, men er ikke registrert som egen kontraktslinje i Fazile ennå (Head Norway AS sin eksisterende rad gjelder kun Vollsveien 13H/19).",
        linjeMatch: "head tar 285kvm",
      },
    ],
    "Vollsveien 21": [
      {
        beskrivelse: "Dobbeltbudsjettert: arealet er allerede utleid til RCL Cruises Ltd. (RCCL), som har sin egen, fulle budsjettlinje andre steder i tabellen - denne Ledig-linjen var en levning i Excel-arket.",
        linjeMatch: "utleid til rccl",
      },
      {
        beskrivelse: "Dobbeltbudsjettert: arealet er allerede utleid til Eternal Clothing AS, som har sin egen, fulle budsjettlinje andre steder i tabellen - denne Ledig-linjen var en levning i Excel-arket.",
        linjeMatch: "uteleid til eternal clothing",
      },
    ],
  };

  // Kjører async pga. kommentar-oppslag/skriving mot Redis (idempotent - overskriver aldri en
  // kommentar Morten allerede har skrevet manuelt).
  async function kobleFlyttetInnOgTrekkFra(delALeietakerRader) {
    let antallKoblet = 0;
    const ledigRader = delALeietakerRader.filter((r) => r.navn.startsWith(LEDIG_LABEL_PREFIX));
    // overføringer[ledigRad.navn] = { sum, poster: [{beskrivelse, belop}] } - brukt til å
    // beregne nytt (flooret) budsjett og en eventuell overtrekk-kommentar pr. Ledig-rad.
    const overforinger = new Map();
    function leggTilOverforing(ledigRad, beskrivelse, belop) {
      if (!overforinger.has(ledigRad.navn)) overforinger.set(ledigRad.navn, { sum: 0, poster: [] });
      const o = overforinger.get(ledigRad.navn);
      o.sum = round2(o.sum + belop);
      o.poster.push({ beskrivelse, belop });
    }

    // 1) Manuelt bekreftede leietakere - ingen kjent enkelt-linje, overfør summen av leietakerens
    // EGNE linjer i akkurat DET byggetnavnet (dekker rabatt-/tilleggslinjer korrekt siden de også
    // er i samme bygg og allerede har riktig fortegn).
    for (const rad of delALeietakerRader) {
      const fulltBygg = MANUAL_FLYTTET_INN_OVERRIDES[normalizeName(rad.navn)];
      if (!fulltBygg || rad.flyttetInnI) continue;
      const ledigRad = finnLedigRad(ledigRader, fulltBygg);
      if (!ledigRad) {
        console.warn(`ADVARSEL: fant ingen Ledig-rad for bygg "${fulltBygg}" (manuell override for "${rad.navn}") - sjekk stavemåte.`);
        continue;
      }
      const belop = round2(rad.linjer.filter((l) => normalizeName(l.bygg) === normalizeName(fulltBygg)).reduce((s, l) => s + l.fullArsverdi2026, 0));
      rad.flyttetInnI = ledigRad.navn;
      rad.budsjett = round2(rad.budsjett + belop);
      oppdaterAvvik(rad);
      leggTilOverforing(ledigRad, rad.navn, belop);
      antallKoblet++;
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
        const helKommentar = normalizeName(linje._kommentarRaw);
        const forsteSetning = normalizeName(linje._kommentarRaw.split(".")[0]);
        const kandidater = [...new Set([forsteSetning, helKommentar])].filter((k) => k.length >= 4);
        let matchet = false;
        for (const rad of delALeietakerRader) {
          if (rad === ledigRad || rad.budsjett !== 0 || rad.flyttetInnI || rad.navn.startsWith(LEDIG_LABEL_PREFIX)) continue;
          const kjerne = coreName(rad.navn);
          if (kjerne.length < 4 || !kandidater.some((k) => kjerne.startsWith(k))) continue;
          const harSammeBygg = rad.linjer.some((l) => normalizeName(l.bygg) === normalizeName(linje.bygg));
          if (!harSammeBygg) continue;
          rad.flyttetInnI = ledigRad.navn;
          rad.budsjett = round2(rad.budsjett + linje.fullArsverdi2026);
          oppdaterAvvik(rad);
          leggTilOverforing(ledigRad, rad.navn, linje.fullArsverdi2026);
          antallKoblet++;
          matchet = true;
          break;
        }
        if (!matchet) beholdLinjer.push(linje);
      }
      ledigRad.linjer = beholdLinjer;
    }

    // 3) Usporede overtakelser (ingen leietaker-rad å legge beløpet på). Finn ALLE linjer i
    // Ledig-raden hvis `beskrivelse` (som allerede inneholder Excel sin kommentartekst, se
    // build-tenant-budget.js) matcher `linjeMatch`, summer deres FAKTISKE verdi (ikke et
    // håndskrevet tall) og fjern dem fra linjer[].
    for (const [fulltBygg, poster] of Object.entries(MANUAL_UNTRACKED_OVERTAKELSER)) {
      const ledigRad = finnLedigRad(ledigRader, fulltBygg);
      if (!ledigRad) {
        console.warn(`ADVARSEL: fant ingen Ledig-rad for bygg "${fulltBygg}" (usporet overtakelse) - sjekk stavemåte.`);
        continue;
      }
      for (const p of poster) {
        const matchendeLinjer = ledigRad.linjer.filter(
          (l) => normalizeName(l.bygg) === normalizeName(fulltBygg) && l.beskrivelse.toLowerCase().includes(p.linjeMatch),
        );
        if (matchendeLinjer.length === 0) {
          console.warn(`ADVARSEL: fant ingen linje som matcher "${p.linjeMatch}" i "${ledigRad.navn}" - sjekk om teksten er endret.`);
          continue;
        }
        const belop = round2(matchendeLinjer.reduce((s, l) => s + l.fullArsverdi2026, 0));
        leggTilOverforing(ledigRad, p.beskrivelse, belop);
        ledigRad.linjer = ledigRad.linjer.filter((l) => !matchendeLinjer.includes(l));
      }
    }

    // 4) Gulv på 0 pr. Ledig-rad + automatisk overtrekk-kommentar (kun hvis Morten ikke allerede
    // har skrevet en manuell kommentar der - sjekkes/skrives idempotent mot samme Redis-hash som
    // KommentarCell i UI-en bruker, slik at en ny kjøring av pipelinen aldri overskriver et
    // manuelt notat).
    for (const ledigRad of ledigRader) {
      const o = overforinger.get(ledigRad.navn);
      if (!o) continue;
      const opprinnelig = ledigRad.budsjett;
      const nytt = round2(Math.max(0, opprinnelig - o.sum));
      const overtrekk = round2(o.sum - opprinnelig);
      // Bevart for den dedikerte "Ledige lokaler"-oversikten (app/IncomeForecastSection.tsx) -
      // budsjett-feltet blir GJENSTÅENDE under, så original + trukket-ut må lagres separat for at
      // den fanen skal kunne vise "opprinnelig / trukket ut / gjenstående" side om side.
      ledigRad.ledigOpprinneligBudsjett = opprinnelig;
      ledigRad.ledigTrukketUt = o.sum;
      ledigRad.budsjett = nytt;
      oppdaterAvvik(ledigRad);
      if (overtrekk > 0) {
        console.log(
          `${ledigRad.navn}: bekreftet utleid (${o.sum.toLocaleString("nb-NO")} kr) overstiger opprinnelig budsjett (${opprinnelig.toLocaleString("nb-NO")} kr) med ${overtrekk.toLocaleString("nb-NO")} kr - vist som 0, se kommentar.`,
        );
        await settDefaultKommentarHvisTom(
          ledigRad.navn,
          `Bekreftet utleid areal (samlet ${o.sum.toLocaleString("nb-NO")} kr/år: ${o.poster.map((p) => `${p.beskrivelse} (${p.belop.toLocaleString("nb-NO")} kr)`).join("; ")}) overstiger opprinnelig budsjettert ledig-beløp (${opprinnelig.toLocaleString("nb-NO")} kr/år) med ${overtrekk.toLocaleString("nb-NO")} kr - gjenstående vist som 0.`,
        );
      }
    }

    // 5) Auto-generert "tok over ledig areal"-kommentar på leietakerens EGEN rad (kun hvis
    // leietakeren ikke allerede har en manuell kommentar).
    for (const rad of delALeietakerRader) {
      if (!rad.flyttetInnI) continue;
      const o = [...overforinger.values()].flatMap((v) => v.poster).find((p) => p.beskrivelse === rad.navn);
      const belop = o ? o.belop : null;
      const ledigNavn = rad.flyttetInnI;
      await settDefaultKommentarHvisTom(
        rad.navn,
        belop != null
          ? `Tok over ledig areal (${ledigNavn}) - ${belop.toLocaleString("nb-NO")} kr/år overført fra Ledig-budsjettet dit.`
          : `Tok over ledig areal (${ledigNavn}).`,
      );
    }

    // _kommentarRaw er internt/midlertidig (kun brukt til matchingen over) - skal ALDRI havne i
    // det publiserte Redis-snapshotet/API-et.
    for (const ledigRad of ledigRader) {
      for (const linje of ledigRad.linjer) delete linje._kommentarRaw;
    }
    return antallKoblet;
  }

  function fuzzyLookupFn(rows) {
    const lookup = buildBudgetLookup(rows);
    return (navn) => lookupBudget(navn, lookup);
  }
  function exactLookupFn(rows) {
    const byNorm = new Map(rows.map((r) => [normalizeName(r.navn), r.budsjett]));
    return (navn) => (byNorm.has(normalizeName(navn)) ? byNorm.get(normalizeName(navn)) : null);
  }

  const budgetLookupA = { leietaker: fuzzyLookupFn(budget.delA.leietaker), bygg: exactLookupFn(budget.delA.bygg), leietype: exactLookupFn(budget.delA.leietype) };
  const budgetLookupB = { leietaker: fuzzyLookupFn(budget.delB.leietaker), bygg: exactLookupFn(budget.delB.bygg), leietype: exactLookupFn(budget.delB.leietype) };

  // Leietaker-grupperingen bruker byggGruppe-tallene DIREKTE (uendret fra v1 - mer nøyaktig enn
  // den proporsjonale linje-fordelingen over, siden den ikke trenger linje-nivå-fordeling).
  function buildLeietakerMap(del) {
    const map = new Map();
    for (const tenant of remaining.tenants) {
      const reelleGrupper = tenant.byggGrupper.filter((b) => b.status !== "intern-mustad");
      if (reelleGrupper.length === 0) continue;
      const fakturert = round2(reelleGrupper.reduce((s, b) => s + (del === "A" ? b.alleredeFakturertDelA : b.alleredeFakturertDelB), 0));
      const gjenstar = round2(reelleGrupper.reduce((s, b) => s + (del === "A" ? b.gjenstarDelA : b.gjenstarDelB), 0));
      if (fakturert === 0 && gjenstar === 0) continue;
      map.set(tenant.navn, { fakturert, gjenstar, linjer: tenant.lines.filter((l) => l.del === del) });
    }
    return map;
  }

  const delA = {
    leietaker: sortByAvvik(medBudsjett(buildLeietakerMap("A"), budgetLookupA.leietaker, budget.delA.leietaker)),
    bygg: sortByAvvik(medBudsjett(groupLines(linesA, (line) => line.bygg), budgetLookupA.bygg, budget.delA.bygg)),
    leietype: sortByAvvik(medBudsjett(groupLines(linesA, (line) => classifyLeietype(line.beskrivelse, line.bygg)), budgetLookupA.leietype, budget.delA.leietype)),
  };
  const antallFlyttetInn = await kobleFlyttetInnOgTrekkFra(delA.leietaker);
  console.log(`Flyttet-inn-kobling: ${antallFlyttetInn} leietaker(e) koblet til en Ledig-bygg-rad.`);
  // Del B: budsjett=null pr. rad (ingen pr.-leietaker/bygg/leietype-budsjett finnes - se
  // filhode) - budgetLookupB.* returnerer uansett alltid null siden budget.delB.* er tomme
  // arrays, men defaultBudsjett:null gjøres eksplisitt her for lesbarhet.
  const delB = {
    leietaker: sortByAvvik(medBudsjett(buildLeietakerMap("B"), budgetLookupB.leietaker, budget.delB.leietaker, null)),
    bygg: sortByAvvik(medBudsjett(groupLines(linesB, (line) => line.bygg), budgetLookupB.bygg, budget.delB.bygg, null)),
    leietype: sortByAvvik(medBudsjett(groupLines(linesB, (line) => classifyLeietype(line.beskrivelse, line.bygg)), budgetLookupB.leietype, budget.delB.leietype, null)),
  };

  for (const [label, del] of [["Del A", delA], ["Del B", delB]]) {
    for (const gruppe of ["leietaker", "bygg", "leietype"]) {
      const sumBudsjett = round2(del[gruppe].reduce((s, r) => s + (r.budsjett ?? 0), 0));
      console.log(`${label} / ${gruppe}: ${del[gruppe].length} rader, budsjett-sum ${sumBudsjett.toLocaleString("nb-NO")} kr`);
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
  };

  return pushToRedis(OUT_KEY, FIELD, snapshot, "tenant-forecast-table-snapshot.json");
}

main();
