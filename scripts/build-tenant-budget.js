// Bygger et budsjett-snapshot (pr. leietaker, pr. bygg, pr. leietype) fra Excel-arket
// "Budsjett 2026 (redig) (2)" (i Inntektsprognose-fila Morten sender over), som Del A/B-
// tabellene i Inntektsprognose-toppstrukturen bruker som Budsjett-kolonne.
//
// v5 (2026-08-26, samme dag som v4): Morten presiserte at det IKKE skal finnes noen
// "Ufordelt"-blob i det hele tatt - ALT budsjett er i Excel-arket alltid koblet til enten en
// navngitt leietaker eller et ledig lokale, og "Parkering er budsjettert kun på en totallinje,
// så den sammenlignes bare mot alt som er ført på parkeringkonto(er) og gjenstår å fakturere på
// parkeringslinjer" - dvs. INGEN pr.-leietaker/bygg/leietype-budsjett for Del B i det hele tatt.
// Endringer fra v4:
//   1) Del A: rader som tidligere ble stuffet inn i én anonym "Ikke leietaker-tilknyttet"-rad er
//      nå splittet i navngitte bøtter: "uten treff i Fazile" vises nå som EGNE rader (ett pr.
//      Excel-navn, IKKE Fazile-matchet, men fortsatt et ekte navn Morten kan kjenne igjen -
//      f.eks. Quantafuel AS), "Ledig" og "Mustad Eiendom/Eiendomsdrift" (intern bruk) er egne,
//      tydelig merkede rader. Kun en liten (~1,3 mill kr / 0,2 %), navngitt
//      "Avstemmingsdifferanse"-rad gjenstår - se punkt 2 i AVSTEMMING-avsnittet under for hvorfor
//      selv "alle rå-rader" ikke treffer det offisielle tallet helt eksakt.
//   2) Del B (parkering): INGEN pr.-leietaker/bygg/leietype-budsjett bygges lenger her -
//      `delB.leietaker`/`delB.bygg`/`delB.leietype` er nå alltid tomme arrays. Kun
//      `totalDelB` (den offisielle enkeltlinjen, 58 970 570,16 kr) eksporteres - forecast-table-
//      scriptet bruker DEN til én samlet Totalt-rad (budsjett vs. SUM av fakturert+gjenstår på
//      tvers av alle parkeringsleietakere), se filhode i build-tenant-forecast-table.js.
//
// v4 (2026-08-26) - byttet fra arket "Budsjett 2026" til "Budsjett 2026 (redig) (2)" etter at
// Morten presset på om at ALT budsjett skal være koblet til enten en leietaker eller et ledig
// areal, og at et ~22 mill kr-gap i v3 (selv etter å summere ALLE rå-rader) tydet på at noe var
// feil, ikke bare "et ukjent metodikk-avvik". Det var det: "Budsjett 2026" var en eldre/enklere
// revisjon. "(redig) (2)" har en egen kolonne "Justert 2026 50%" med Finance sin EGEN,
// pr.-linje-nøyaktige 50%-halvering for de 3 delt-eide selskapene (Fåbro Eiendom AS,
// Strandveien 10 AS, Strandveien 4-8 AS) - når denne brukes i stedet for vår egen
// andelForBygg()-halvering, treffer Del A-summen offisiell total på 1,4 mill kr (0,2 %) i
// stedet for det tidligere ~22 mill kr-gapet.
// v3 (2026-08-25) la til bygg/leietype + Ufordelt-avstemming. v1 brukte NXT sin
// budgetLine-tabell pr. customerNo, men den viste seg å ha budsjett på BYGG-nivå (aggregert,
// uten customerNo) for de fleste store ankertleietakere - se f.eks. Lilleakerveien 4A
// (19,1 mill kr bygg-totalt budsjett i NXT), der kun 2,3 mill kr var customerNo-tilknyttet.
// Excel-arket har derimot ekte budsjett PR. KONTRAKTSLINJE (1911 rader), inkl. reelle
// parkerings-/garasjelinjer (motsetning til NXT, der parkeringsbudsjett ALDRI har customerNo).
//
// NAVNEUTFORDRING (Del A): Excel sin "Kontrakt"-kolonne bruker ofte et handelsnavn/kortnavn
// ("Meny CC Vest") som ikke er identisk med Fazile sitt juridiske leietakernavn
// ("Norgesgruppen Øst AS") - spesielt for CC Vest-butikker. Matching skjer i økende grad av
// usikkerhet:
//   1) eksakt normalisert navn
//   2) kjerne-navn (uten selskapsform/tegnsetting), unikt treff
//   3) bygg+kontraktslinje-beskrivelse mot REMAINING sine linjer, unikt treff
//   4) kjerne-navn-delstreng (i begge retninger), unikt treff blant kandidater ≥4 tegn
//   5) EXCEL_TO_FAZILE_ALIASES - en liten, HÅNDKURERT tabell for kjente handelsnavn-avvik,
//      delvis gjenbrukt fra scripts/build-omsetningsavregning.js (samme CC Vest-problem,
//      allerede Morten-bekreftet der for de fleste av disse)
// Rader som ikke treffer noen av disse fem, vises likevel - som en EGEN, navngitt rad med
// Excel sitt eget "Kontrakt"-navn (se UNMATCHED_NAMED under) - IKKE anonymisert bort lenger.
// "Kommentar inntekt"-kolonnen logges fortsatt for uten-treff-rader >100 000 kr (konsoll) slik
// at hver enkelt kan sjekkes mot Finance sin egen forklaring i stedet for å anta matchefeil.
//
// EIERANDEL: bruker "Justert 2026 50%"-kolonnen direkte når den finnes på raden (Finance sin
// egen, pr.-linje-halverte verdi for de 3 delt-eide selskapene), ellers "Inntekt 2026" som den
// står (allerede korrekt for 100%-eide bygg). IKKE bruk andelForBygg() på denne datakilden -
// det ville dobbelthalvert radene som allerede har en Justert-verdi.
//
// AVSTEMMING MOT OFFISIELL TOTAL (2026-08-26): "Oppsummering juli-2026"-arket (rad 2,
// "Budsjett 2026", merket "Harde tall" - manuelt limt inn, ikke en live formel i arket) sier
// Leieinntekter 665 780 066 kr + Parkering 58 970 570,16 kr = 724 750 636,16 kr.
//   1) Del B (parkering): budsjettert KUN som denne ene totallinjen i Oppsummering-arket -
//      rå-arkets egne Parkering/Garasje-kontraktslinjer summerer til kun ~3,5 mill kr av de
//      58,97 mill kr, og selv de er ikke til å stole på som ekte pr.-leietaker-budsjett (Morten
//      2026-08-26: "Parkering er budsjettert kun på en totallinje"). Resten er sentral,
//      portefølje-nivå parkeringsdrift (Onepark m.fl. - "Onepark"-arket viser kun 9,46 mill kr av
//      sitt eget anslag, "BU Parkering" er en år-for-år-pivot uten leietaker/bygg-kobling) som
//      ALDRI har vært ekte kontraktslinjer i dette arket - konsistent med at NXT heller ikke har
//      customerNo på parkeringskontoer. Derfor: INGEN pr.-rad-budsjett for Del B, kun
//      `totalDelB` som ÉN tallstørrelse - se v5-avsnittet over.
//   2) Del A (leieinntekter): med riktig ark+halvering treffer summen av ALLE rå-rader
//      664 379 702 kr mot offisiell 665 780 066 kr - kun ~1,4 mill kr gap (0,2 %). Dette er IKKE
//      en matchefeil (siden bygg/leietype-grupperingen tar med bokstavelig talt ALLE rader,
//      uansett navnematch) - mest sannsynlig mindre redigeringer i arket etter at "harde
//      tall"-cellen ble limt inn i Oppsummering-arket. Vises som en liten, ærlig navngitt
//      "Avstemmingsdifferanse"-rad (se AVSTEMMING_LABEL) i stedet for å skjules i en
//      "Ufordelt"-blob.
const OFFICIAL_LEIEINNTEKTER_BUDSJETT_2026 = 665780066;
const OFFICIAL_PARKERING_BUDSJETT_2026 = 58970570.16;
// v6 (2026-08-28): "Ledig (vakante lokaler)" var tidligere ETT eksakt radnavn - er nå en PREFIX
// for 15 forskjellige radnavn, ett pr. bygg (se ledigLinjerByBygg under).
// lib/tenantForecastTable.ts sin anonymiserings-sjekk må derfor bruke prefix-match, ikke eksakt
// Set-medlemskap - hold begge i sync hvis denne teksten endres.
// v8 (2026-08-29): Morten ville ha korte radnavn ("Ledig V13D") i stedet for det fulle byggnavnet
// ("Ledig (vakante lokaler) – Vollsveien 13D") - "Ledig" er fortsatt en trygg, unik prefix siden
// det allerede er et reservert nøkkelord i Excel sin "kontrakt"-kolonne (ingen ekte leietaker
// heter noe som starter slik).
const LEDIG_LABEL_PREFIX = "Ledig";
// Kortkoder Morten selv oppga 2026-08-29 for hvert bygg som har budsjettert ledig areal - hold
// i sync hvis flere bygg dukker opp i fremtidige budsjett-uttrekk (fallback til fullt byggnavn
// under hvis et bygg mangler her, se bruken).
const BYGG_KORTKODE = new Map([
  ["Lilleakerveien 2B", "LV2B"],
  ["Lilleakerveien 10", "LV10"],
  ["Lilleakerveien 4A", "LV4A"],
  ["Lilleakerveien 2E", "LV2E"],
  ["Lilleakerveien 4D", "LV4D"],
  ["Lilleakerveien 2C", "LV2C"],
  ["Lilleakerveien 4C", "LV4C"],
  ["Lilleakerveien 6d Hus 3", "LV6D"],
  ["Vollsveien 13D", "V13D"],
  ["Vollsveien 17", "V17"],
  ["Vollsveien 21", "V21"],
  ["Vollsveien 13C", "V13C"],
  ["Vollsveien 13B", "V13B"],
  ["Mustadsvei 10 Fåbro gård", "MV10"],
  ["Strandveien 4-8", "SV4-8"],
]);
const MUSTAD_INTERN_LABEL = "Mustad Eiendom (intern bruk, ikke leieforhold)";
const AVSTEMMING_LABEL = "Avstemmingsdifferanse (Excel redigert etter at 'harde tall' ble limt inn i Oppsummering-arket)";
//
// Rådata (gitignored, ekte navn): scripts/refresh-data/budsjett-2026-excel-raw.json - hentet
// ved å streame "Budsjett 2026 (redig) (2)"-arket i
// 2026_08_04_Inntektsprognose_Juli_2026.xlsx med ExcelJS sin WorkbookReader (full in-memory
// load av denne 30 MB-fila går tom for minne - se scripts/refresh-data/README.md for
// kommando/mønster hvis arket må hentes på nytt).
//
// Kjør: node scripts/build-tenant-budget.js (etter build-remaining-summary.js, siden
// bygg+beskrivelse-matchingen i tier 3 leser REMAINING sitt snapshot fra Redis)

const fs = require("fs");
const path = require("path");
const { loadEnvLocal, getFromRedis, pushToRedis, normalizeName, coreName } = require("./lib/refresh-helpers");

const RAW_FILE = path.join(__dirname, "refresh-data", "budsjett-2026-excel-raw.json");
const REMAINING_HASH_KEY = "jobb:inntektsprognose-gjenstar-leietakere";
const REMAINING_FIELD = "snapshot";
const REDIS_HASH_KEY = "jobb:inntektsprognose-leietaker-budsjett";
const REDIS_FIELD = "snapshot";

const DEL_B_LEIETYPER = new Set(["parkering", "garasje"]);
// Excel bruker BÅDE bare "Ledig" og "Ledig <byggnavn>" (f.eks. "Ledig Vollsveien 13C") som
// kontrakt-navn for vakante lokaler - oppdaget 2026-08-26 da 755 rader (13,4 mill kr) med
// "Ledig <sted>"-prefiks falt gjennom til "uten treff" i stedet for å telles som Ledig.
const LEDIG_PREFIX = /^ledig\b/;
const MUSTAD_INTERN_NAVN = new Set(["mustad eiendom as", "mustad eiendomsdrift as"]);

// Håndkurert, delvis gjenbrukt fra EXCEL_TO_FAZILE_ALIASES i build-omsetningsavregning.js
// (samme CC Vest-handelsnavn-problem, Morten-bekreftet der 2026-08-24/25) - IKKE utvidet med
// ubekreftede gjetninger (se f.eks. "Newbie" som ble hoppet over der pga. usikkerhet).
const EXCEL_TO_FAZILE_ALIASES = {
  "meny cc vest": "norgesgruppen øst as",
  "anton sport": "sport holding retail as",
  sportsnett: "sport holding retail as",
  "vitusapotek cc vest": "norsk medisinaldepot as",
  sunkost: "stig a. dalen as",
  "beth´s beauty": "beths beauty center as",
  "søstrene grene": "hs retail oslo2 as",
  "smoothie exchange": "smoothie xchange as",
  "narvesen cc vest": "reitan convenience norway as/kiosk 814", // rettet 2026-08-26 - REMAINING sitt reelle navn har "/Kiosk 814"-suffiks
  "grændsens skotøimagazin": "grensen sko drift as",
  "grændsens skotøimagazin kidz": "grensen sko drift as",
  "grensen sko cc vest a/s": "grensen sko drift as",
  bagorama: "snos cc vest as", // build-omsetningsavregning.js: Morris-Accent-kontrakten utløp 2025, etterfølger er Snos Cc Vest AS
  "chr. belysning": "christiania belysning a/s", // rettet 2026-08-26 - "A/S" ikke "AS" i REMAINING
  "mats & martin": "mats og martin as",
  "backe i grensen": "joh. jørg.backe cc vest as", // rettet 2026-08-26 - ingen mellomrom før "Backe" i REMAINING
  "sats cc vest": "sats norway as", // lagt til 2026-08-26 - forklarer hvorfor Sats Norway AS tidligere viste 0 kr budsjett
  "obrascón huarte lain": "ohla norge - obrascón huarte lain s.a. norwegian branch nuf",
  "obrascón huarte lain ": "ohla norge - obrascón huarte lain s.a. norwegian branch nuf",
  "fredrik og louisa": "fredrik & louisa as",
  "elite foto": "elite foto as",
  // Morten bekreftet direkte: "Aquarium er Buddy" - Excel-budsjettarket bruker det gamle/
  // handelsnavnet "Buddy" (Lilleakerveien 14, butikk+lager), Fazile sin reelle leietaker heter
  // "Aquarium A/S". Kun Del A-radene aliaset her ("Buddy, garasje" er en egen Del B-rad, som
  // ikke budsjetteres pr. leietaker uansett - se Del B-metodikken i build-tenant-budget.js).
  buddy: "aquarium a/s",
  // Runde 2 (2026-08-26) - bekreftet via Fazile leietakerliste/rent_roll (IKKE gjettet):
  "mcdonald`s cc vest": "food folk norge a/s", // Morten identifiserte selv denne - Food Folk Norge er McDonald's-franchisedriveren, bekreftet identisk beløp (~2,13 mill kr) og bygg (Lilleakerveien 16/CC Vest)
  "mcdonalds cc vest": "food folk norge a/s",
  "vita detalj as": "vita group as", // samme leietaker, Excel bruker "Vita Detalj", Fazile "Vita Group" - beløp nesten identisk (1 086 425 vs. 1 086 723 kr)
  "apple (eplehuset)": "eplehuset norge as", // beløp nesten identisk (873 157 vs. 873 426 kr)
  "brukerklagenemda for elektronisk kommunikasjon": "brukerklagenemnda for elektronisk kommunikasjon", // Excel mangler "n" i "nemnda"
  // Lilleakerveien 2C: Excel sine "Quantafuel AS"/"GSG Handyman AS"-budsjettlinjer var begge
  // RETTET Runde 6 (2026-08-26): trodde tidligere at VERKEN Quantafuel eller GSG Handyman
  // signerte til slutt - FEIL. Morten bekreftet Quantafuel har et reelt 1,46 mill kr-budsjett
  // (krysssjekket mot "Prognose juli-2026"-fanen i inntektsprognosefila, kolonne D/Y - matcher
  // GSG Handyman sin Excel-linje eksakt: 1 452 010,96 kr). De to plassholder-linjene sine
  // Kommentar-felt viste seg å bety noe ANNET enn først antatt: "Quantafuel AS"-raden (Kommentar:
  // "Flytte Hertz (first rent a car) hit") ER riktig aliaset til First Rent A Car - MEN
  // "GSG Handyman AS"-raden (Kommentar: "Quantafuel inn her") betyr at QUANTAFUEL selv flytter
  // inn der, ikke First Rent A Car. Bekreftet i tillegg i dag (samme økt): Quantafuel AS er en
  // reell, langvarig Fazile-leietaker (kontrakt fra 2020, flyttet ut 2026-02-28 med et
  // engangs-sluttoppgjør/exit fee på 2 261 627 kr, se ENGANGSGEBYR_LEIETAKERE i
  // build-remaining-summary.js) - ikke bare en plassholder som aldri signerte.
  "quantafuel as": "first rent a car norway as",
  "gsg handyman as": "quantafuel as",
  // Lilleakerveien 16 Skoda: gamle leietaker Møller Bil Vest AS sin kontrakt utløp 2026-02-28.
  // Excel sin "Skoda"-budsjettlinje er en plassholder (Kommentar inntekt: "Ulike scenarioer. Ny
  // bilforretning/Ny frisør") for hvem som ville overta - bekreftet i Fazile: Rn Nordic Ab NUF
  // signerte ny kontrakt fra 2026-03-01 (samme selskap har fra før en butikk i selve CC Vest).
  "skoda": "rn nordic ab nuf",
  // Geovita AS fusjonerte med Norconsult i løpet av 2026 (Morten, 2026-08-26) - forklarer
  // hvorfor "Geovita AS" (Lilleakerveien 4A) ikke lenger finnes som egen leietaker i Fazile.
  "geovita as": "norconsult norge as",
  // Runde 3 (2026-08-26) - bekreftet via Salesforce Account (Forretning_Navn__c/Bygg_Navn__c)
  // KRYSSJEKKET mot Fazile, ikke gjettet:
  "anne kristines fotterapi": "cc vest medisinske fotterapi as", // SF: aktiv kontrakt til 2026-12-31, CC Vest
  "elkjøp phonehouse": "elkjøp norge as", // SF sitt eget Forretning_Navn__c-felt på Elkjøp Norge AS er bokstavelig talt "Phoneshouse"
  // Runde 4 (2026-08-26) - Morten bekreftet direkte: "krinor er Elite Foto" (Krinor AS er det
  // juridiske selskapsnavnet bak handelsnavnet "Elite Foto CC Vest"). Bekreftet også tallmessig:
  // budsjett 776 050,19 kr mot Krinor AS sin Fazile-gjenstår 776 267,29 kr (0,03 % avvik).
  "elite foto": "krinor as",
  // Runde 5 (2026-08-26) - Morten bekreftet: "Telenorbutikken CC Vest" er Telenor Norge AS sin
  // butikk (Lilleakerveien 16/CC Vest, Minimumsleie-kontrakt) - beløpsavvik 11 % (868 363,20
  // mot budsjett 974 295 kr), løsere enn andre bekreftede alias men bekreftet direkte av Morten.
  "telenorbutikken cc vest": "telenor norge as",
  // Runde 6 (2026-08-26) - Morten bekreftet direkte begge: "Sodexo egentlig heter Cares" og
  // "Newbie er Kappahl" (trolig et rebrand/driftsselskap-bytte). Sodexo/Cares stemmer nesten
  // eksakt tallmessig (avvik 516 kr av 1,38 mill). Newbie/Kappahl har et løsere avvik (~15 %,
  // trolig fordi Kappahl nylig overtok og ikke har full historikk ennå) men bekreftet direkte.
  "sodexo as": "cares workplace services as",
  // RETTET 2026-08-26: den forrige "head norway as" -> "head sport gmbh"-aliasen var FEIL -
  // Fazile har to HELT SEPARATE, ekte leietakere: "Head Sport Gmbh" (erp_code 11127) OG
  // "Head Norway AS" (erp_code 10825, egen kontrakt Vollsveien 13H/19). Excel sin "Head Norway
  // AS"-budsjettrad (1 021 389,02 kr Kontorleie + Wifi/Lager, totalt 1 132 062,74 kr) skal altså
  // matches DIREKTE (eksakt navn) mot den ekte "Head Norway AS" - ingen alias trengs i det hele
  // tatt. Den gamle aliasen rutet budsjettet til feil leietaker (Head Sport Gmbh), som dermed
  // fikk et budsjett den aldri skulle hatt, mens den reelle Head Norway AS sto igjen med 0 kr.
  "newbie": "kappahl as",
  // Morten bekreftet direkte: "Kvartalgruppen går også under navnet Sigma Management As" - to
  // separate Excel-budsjettlinjer for samme reelle leietaker (137 227,13 + 141 487,22 kr slås nå
  // sammen til én kombinert Sigma Management AS-rad).
  "kvartalgruppen as": "sigma management as",
  // Morten bekreftet direkte: "Allmedical går også under navnet Lillelaser" - Excel bruker det
  // juridiske/tidligere navnet "Allmedical AS", Fazile sin reelle leietaker heter
  // "Lillelaser - Din Kosmetiske Klinikk AS".
  "allmedical as": "lillelaser - din kosmetiske klinikk as",
  // Morten bekreftet direkte: "Joh. Jørg. Backe Grensen går også under navnet «Backe i Grensen»" -
  // altså begge er samme Excel/budsjett-entitet som "backe i grensen" over (som allerede pekte til
  // Fazile sin "Joh. Jørg.Backe CC Vest AS"). Denne raden manglet et eget alias siden kjerne-navnet
  // ("...Grensen" vs. "...CC Vest AS") ikke matcher automatisk.
  "joh. jørg. backe grensen": "joh. jørg.backe cc vest as",
  // RETTET 2026-08-28: forrige linje her leste "dr ing aas-jakobsen as": "norcap as", basert på
  // en 2026-08-27-bekreftelse som viste seg feil. Morten presiserte 2026-08-28 direkte: "Det er
  // norconsult som har slått seg sammen med dr. Ing aas jacobsen og geovita" - Norcap AS er IKKE
  // involvert i denne fusjonen, og har sitt eget, helt separate, mye mindre leieforhold i
  // Vollsveien 19 (reell fullårsverdi kun ~2,1 mill kr - Aas-Jakobsen sine ~9,19 mill kr hørte
  // aldri hjemme der). Norconsult Norge AS sitt REMAINING-leieforhold i Lilleakerveien 4A har
  // derimot en fullårsverdi på 13,87 mill kr, hvorav kun ~2,32 mill kr traff et eget
  // Excel-budsjett ("Norconsult Norge (ECT)") før denne rettelsen - nøyaktig det gapet Aas-
  // Jakobsen sine gamle budsjettrader forklarer. Geovita-aliaset rett over var allerede korrekt
  // koblet til Norconsult og er uendret.
  "dr ing aas-jakobsen as": "norconsult norge as",
  // Morten bekreftet direkte 2026-08-28: "Human care og assistermeg er samme selskap" - reverserer
  // 2026-08-26-notatet lenger ned (BYGG_BESKRIVELSE_FALSE_POSITIVES) som den gang konkluderte at
  // de var to separate, reelle Fazile-kunder. AssisterMeg AS (NXT-kundenr. 10781) har ingen egen
  // aktiv leiekontrakt i REMAINING i dag - Human Care AS er det reelle, aktive leieforholdet
  // (Mustadsvei 1) disse Excel-budsjettradene skal telle mot.
  "assistermeg as": "human care as",
};

// FUNN 2026-08-26 (Morten sin avvik-gjennomgang av alle leietakere med |avvik| >= 100 000 kr):
// "bygg+beskrivelse"-fallbacken i findTenant() under antar at HVIS kun én REMAINING-leietaker
// har en linje med en gitt bygg+beskrivelse-kombinasjon, må en Excel-rad med samme kombinasjon
// tilhøre akkurat den leietakeren. Denne antagelsen bryter sammen for GENERISKE beskrivelser
// ("Husleie avg.pl.") når en ANNEN, reell Fazile-leietaker (som eksisterer i Fazile sin
// customer-tabell, men IKKE har noen aktiv kontraktslinje i dag - trolig flyttet ut/kontrakt
// utløpt uten fornyelse) tilfeldigvis har SAMME bygg+beskrivelse i Excel. Konkret: "Aya Yoga AS"
// (Lilleakerveien 14, "Husleie avg.pl.", 448 767,12 kr) fantes ikke i REMAINING og ble derfor
// feilaktig matchet til "Oslo Produksjon & Tjenester AS" sin leieforhold på samme bygg+
// beskrivelse - ga et falskt budsjett på 470 536,69 kr (21 770 + 448 767) mot Oslo Produksjon
// sin reelle leie på kun ~21 848 kr. Ekskluderes derfor eksplisitt her (havner i "uten treff" i
// stedet for feilaktig attribuert et annet sted) - IKKE fjernet fra selve budsjett-summen,
// bare fra å bli feilkoblet til feil leietaker.
// Utvidet 2026-08-27 etter Morten sin oppfordring om å sjekke HELE linja portefølje-bredt
// (samme "Husleie avg.pl."-generiske-tekst-problem kan i prinsippet ramme mange rader): sjekket
// alle 63 "bygg+beskrivelse"-treff i dagens kjøring direkte mot Fazile sin customer-tabell for å
// se om Excel-navnet tilhører en ANNEN, reell, separat Fazile-kunde enn den det ble matchet til.
// To til (utover Aya Yoga) ble den gangen (feilaktig, se RETTET 2026-08-28 over) antatt å være
// reelle, separate kunder:
//  - "Assistermeg AS" ble den gangen holdt utenfor fordi bygg+beskrivelse-fallbacken feilkoblet
//    den til Human Care AS. Morten bekreftet 2026-08-28 direkte at de FAKTISK er samme selskap -
//    det som så ut som en feilkobling var altså riktig hele tiden. Fjernet fra denne lista,
//    kobles nå i stedet eksplisitt via alias i EXCEL_TO_FAZILE_ALIASES (mer robust enn å la
//    fallbacken gjette på nytt hver gang).
//  - "Dr Ing  Aas-Jakobsen AS" (~9,27 mill kr over 12 linjer) ble først feilaktig matchet til
//    Norconsult Norge AS via bygg+beskrivelse-fallbacken (samme Lilleakerveien 4A-bygg som flere
//    Norconsult-relaterte fusjoner). Se RETTET 2026-08-28 over: fallbacken hadde det riktig helt
//    fra starten - Aas-Jakobsen hører hjemme hos Norconsult, ikke Norcap. Aldri lagt til her
//    (kobles via alias), så ingen endring trengs på selve lista for denne.
// Øvrige bygg+beskrivelse-treff sjekket (Bikuben barnehage, Vow Green Metals, Telenor Infra,
// Pegasus Kontroll, Advansia) fant INGEN konkurrerende separat Fazile-kunde under Excel-navnet -
// lavere risiko, IKKE ekskludert her, men heller ikke 100 % bekreftet som riktig matchet.
const BYGG_BESKRIVELSE_FALSE_POSITIVES = new Set(["aya yoga"]);

// Alias for PRIVATPERSONER holdes UTENFOR denne committede fila (ANONYMISERING.md) - lastes fra
// en gitignored fil i stedet. Se scripts/refresh-data/_private-tenant-aliases.json.
const PRIVATE_ALIASES_FILE = path.join(__dirname, "refresh-data", "_private-tenant-aliases.json");
if (fs.existsSync(PRIVATE_ALIASES_FILE)) {
  const privateAliases = JSON.parse(fs.readFileSync(PRIVATE_ALIASES_FILE, "utf8"));
  for (const [key, value] of Object.entries(privateAliases)) {
    if (key.startsWith("_")) continue; // "_comment"
    EXCEL_TO_FAZILE_ALIASES[key] = value;
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function main() {
  loadEnvLocal();
  const rows = JSON.parse(fs.readFileSync(RAW_FILE, "utf8"));
  const remaining = await getFromRedis(REMAINING_HASH_KEY, REMAINING_FIELD);
  if (!remaining) throw new Error(`Fant ikke snapshot i Redis: ${REMAINING_HASH_KEY}/${REMAINING_FIELD} - kjør build-remaining-summary.js først.`);

  const byExactName = new Map(remaining.tenants.map((t) => [normalizeName(t.navn), t.navn]));
  const byCoreName = new Map(); // coreName -> Set(reelt navn)
  for (const t of remaining.tenants) {
    const c = coreName(t.navn);
    if (!byCoreName.has(c)) byCoreName.set(c, new Set());
    byCoreName.get(c).add(t.navn);
  }
  const byggBeskrivelse = new Map(); // "bygg||beskrivelse" -> Set(reelt navn)
  const allCores = remaining.tenants.map((t) => ({ navn: t.navn, core: coreName(t.navn) }));
  for (const t of remaining.tenants) {
    for (const l of t.lines) {
      const key = normalizeName(l.bygg) + "||" + normalizeName(l.beskrivelse);
      if (!byggBeskrivelse.has(key)) byggBeskrivelse.set(key, new Set());
      byggBeskrivelse.get(key).add(t.navn);
    }
  }

  function findTenant(row) {
    const norm = normalizeName(row.kontrakt);
    if (BYGG_BESKRIVELSE_FALSE_POSITIVES.has(norm)) return { navn: null, via: "uten treff" };
    const alias = EXCEL_TO_FAZILE_ALIASES[norm];
    if (alias) {
      const hit = byExactName.get(alias);
      if (hit) return { navn: hit, via: "alias" };
    }

    const exact = byExactName.get(norm);
    if (exact) return { navn: exact, via: "eksakt" };

    const core = coreName(row.kontrakt);
    const coreHit = byCoreName.get(core);
    if (coreHit && coreHit.size === 1) return { navn: [...coreHit][0], via: "kjerne-navn" };

    const beKey = normalizeName(row.bygg) + "||" + normalizeName(row.kontraktObjekt);
    const beHit = byggBeskrivelse.get(beKey);
    if (beHit && beHit.size === 1) return { navn: [...beHit][0], via: "bygg+beskrivelse" };

    if (core.length >= 4) {
      const candidates = allCores.filter((t) => t.core.length >= 4 && (t.core.includes(core) || core.includes(t.core)));
      if (candidates.length === 1) return { navn: candidates[0].navn, via: "delstreng" };
    }
    return { navn: null, via: "uten treff" };
  }

  const perTenant = new Map(); // normalisert navn -> { navn, kjerneNavn, delA }
  const perUnmatchedNamed = new Map(); // normalisert Excel-kontraktnavn -> { navn, delA } - IKKE Fazile-matchet, men vises likevel med Excel sitt eget navn
  const perBygg = new Map(); // bygg -> { delA } - ALLE Del A-rader, uavhengig av navnematch
  const perLeietype = new Map(); // leietype -> { delA } - ALLE Del A-rader
  const viaCount = {};
  let ledigBelop = 0;
  const ledigLinjerByBygg = new Map(); // bygg -> TenantForecastLine[] (v6, se filhode)
  let mustadBelop = 0;
  let delBBelop = 0; // kun for konsoll-info, ikke i output (se v5-avsnitt over)
  const utenTreffStore = []; // for konsoll-logg av de største uten-treff-radene m/kommentar

  for (const row of rows) {
    const raw = row.inntekt2026 || 0;
    if (raw === 0 && (row.justert2026_50 == null || row.justert2026_50 === 0)) continue;
    // Justert 2026 50% = Finance sin egen, pr.-linje-halverte verdi (delt-eide selskaper) -
    // bruk den når den finnes, IKKE andelForBygg() (ville dobbelthalvert). Se filhode.
    const belopJustert = round2(row.justert2026_50 != null ? row.justert2026_50 : raw);
    const del = DEL_B_LEIETYPER.has((row.leietype || "").toLowerCase()) ? "B" : "A";

    if (del === "B") {
      // Parkering budsjetteres kun som ÉN offisiell totallinje (Morten 2026-08-26) - ingen
      // pr.-rad-nedbrytning bygges lenger, se v5-avsnitt i filhodet.
      delBBelop += belopJustert;
      continue;
    }

    // Bygg/leietype-grupperingen tar med ALLE Del A-rader (også Ledig/Mustad selv/uten treff) -
    // ingen navnematching involvert, derfor et strengt mer komplett grunnlag enn leietaker-
    // grupperingen. Se filhode for hvorfor selv dette ikke treffer offisiell total helt eksakt.
    const bygg = row.bygg || "(uspesifisert bygg)";
    if (!perBygg.has(bygg)) perBygg.set(bygg, { delA: 0 });
    perBygg.get(bygg).delA = round2(perBygg.get(bygg).delA + belopJustert);

    const leietype = row.leietype || "(uspesifisert leietype)";
    if (!perLeietype.has(leietype)) perLeietype.set(leietype, { delA: 0 });
    perLeietype.get(leietype).delA = round2(perLeietype.get(leietype).delA + belopJustert);

    const norm = normalizeName(row.kontrakt);
    if (LEDIG_PREFIX.test(norm)) {
      ledigBelop = round2(ledigBelop + belopJustert);
      viaCount["ledig"] = (viaCount["ledig"] || 0) + 1;
      // v6 (2026-08-28): behold bygg+areal-granulariteten i stedet for å kaste den bort - Morten
      // vil se "Ledig"-linja splittet pr. bygg (med hvert enkelt ledig areal som drilldown-linje
      // under), slik at nye leietakere som flytter inn i et konkret ledig lokale kan spores mot
      // akkurat DEN linja i stedet for mot én uspesifikk 13,4 mill kr-klump. `kontraktObjekt`
      // mangler for 2 av 44 rader (Excel har ikke fylt den ut) - fallback til leietype da.
      // Excel sin egen `kommentarInntekt` (f.eks. "Serendipity. Arealene tegnes om...") flettes
      // rett inn i beskrivelsen - TenantDrilldown viser beskrivelse verbatim, ingen UI-endring
      // trengs for at kommentarene skal bli synlige.
      if (!ledigLinjerByBygg.has(bygg)) ledigLinjerByBygg.set(bygg, []);
      const beskrivelseBase = row.kontraktObjekt || `${leietype} (uspesifisert areal)`;
      const beskrivelse = row.kommentarInntekt ? `${beskrivelseBase} — ${row.kommentarInntekt}` : beskrivelseBase;
      ledigLinjerByBygg.get(bygg).push({
        eiendom: bygg,
        bygg,
        linjetype: leietype,
        beskrivelse,
        del: "A",
        fullArsverdi2026: belopJustert,
        startDato: null,
        sluttDato: null,
        // Internt/midlertidig felt (v7, 2026-08-28) - RÅ kommentarteksten, brukt av
        // build-tenant-forecast-table.js til å auto-oppdage leietakere som har flyttet inn i
        // akkurat dette arealet (matcher mot leietakernavn). Slettes der før Redis-push, skal
        // ALDRI havne i det publiserte snapshotet/API-et.
        _kommentarRaw: row.kommentarInntekt || null,
      });
      continue;
    }
    if (MUSTAD_INTERN_NAVN.has(norm)) {
      mustadBelop = round2(mustadBelop + belopJustert);
      viaCount["mustad-intern"] = (viaCount["mustad-intern"] || 0) + 1;
      continue;
    }

    const { navn, via } = findTenant(row);
    viaCount[via] = (viaCount[via] || 0) + 1;
    if (navn && MUSTAD_INTERN_NAVN.has(normalizeName(navn))) {
      // Rå kontrakt-navnet var IKKE en eksakt "Mustad Eiendom AS"/"Mustad Eiendomsdrift AS"-
      // streng (f.eks. "Mustad Eiendom - Gjenbrukslager", "Mustad Eiendomsdrift" uten "AS") - men
      // findTenant() sin fuzzy-matching løste den likevel til Mustad sin egen REMAINING-post.
      // Uten denne sjekken havnet disse som EGNE, separate rader ("Mustad Eiendom as" 664 084 kr,
      // "Mustad Eiendomsdrift AS" 363 031 kr) ved siden av MUSTAD_INTERN_LABEL-bøtta - samme
      // reelle intern-selskap, to ulike rader (oppdaget 2026-08-26). Rutes nå til samme bøtte.
      mustadBelop = round2(mustadBelop + belopJustert);
      viaCount["mustad-intern-via-fazile-match"] = (viaCount["mustad-intern-via-fazile-match"] || 0) + 1;
      continue;
    }
    if (navn) {
      const key = normalizeName(navn);
      if (!perTenant.has(key)) perTenant.set(key, { navn, kjerneNavn: coreName(navn), delA: 0 });
      perTenant.get(key).delA = round2(perTenant.get(key).delA + belopJustert);
      continue;
    }
    // Uten treff i Fazile/REMAINING - vises likevel som EGEN rad med Excel sitt eget navn,
    // IKKE en anonym blob (Morten 2026-08-26: alt skal være koblet til en leietaker/ledig areal).
    if (!perUnmatchedNamed.has(norm)) perUnmatchedNamed.set(norm, { navn: row.kontrakt, kjerneNavn: coreName(row.kontrakt), delA: 0 });
    perUnmatchedNamed.get(norm).delA = round2(perUnmatchedNamed.get(norm).delA + belopJustert);
    utenTreffStore.push({ kontrakt: row.kontrakt, bygg: row.bygg, belop: belopJustert, kommentar: row.kommentarInntekt || null });
  }

  const delALeietaker = [];
  for (const t of perTenant.values()) if (t.delA !== 0) delALeietaker.push({ navn: t.navn, kjerneNavn: t.kjerneNavn, budsjett: t.delA });
  for (const t of perUnmatchedNamed.values()) if (t.delA !== 0) delALeietaker.push({ navn: t.navn, kjerneNavn: t.kjerneNavn, budsjett: t.delA });
  // v6 (2026-08-28): "Ledig (vakante lokaler)" splittes nå i én rad pr. bygg (i stedet for én
  // sammenslått rad) - hver byggrad får sine individuelle ledige arealer som `linjer[]`
  // (drilldown), se kommentar ved ledigLinjerByBygg over. Sum-garanti eksplisitt sjekket rett
  // under, ikke bare antatt - dette er en ren re-gruppering av nøyaktig de samme radene som før.
  let ledigByggSum = 0;
  for (const [bygg, linjer] of ledigLinjerByBygg.entries()) {
    const budsjett = round2(linjer.reduce((s, l) => s + l.fullArsverdi2026, 0));
    if (budsjett === 0) continue;
    ledigByggSum = round2(ledigByggSum + budsjett);
    delALeietaker.push({
      navn: `${LEDIG_LABEL_PREFIX} ${BYGG_KORTKODE.get(bygg) ?? bygg}`,
      budsjett,
      linjer: linjer.slice().sort((a, b) => b.fullArsverdi2026 - a.fullArsverdi2026),
    });
  }
  if (Math.abs(ledigByggSum - ledigBelop) >= 0.01) {
    throw new Error(
      `Ledig-splitting stemmer ikke: sum av bygg-radene (${ledigByggSum}) != ledigBelop (${ledigBelop}) - noe gikk tapt/dobbeltalt i grupperingen.`
    );
  }
  if (mustadBelop !== 0) delALeietaker.push({ navn: MUSTAD_INTERN_LABEL, budsjett: mustadBelop });

  // Avstemmingsdifferanse-rad pr. gruppering = offisiell total - sum(det som faktisk er
  // fordelt, ALLTID på en navngitt leietaker/Ledig/Mustad-intern) - garanterer at grupperingen
  // summerer til nøyaktig det offisielle tallet, men uten å skjule noe bak en anonym "Ufordelt".
  function medAvstemming(poster, offisiellTotal) {
    const sumFunnet = round2(poster.reduce((s, p) => s + p.budsjett, 0));
    const diff = round2(offisiellTotal - sumFunnet);
    const resultat = [...poster];
    if (Math.abs(diff) > 0.01) resultat.push({ navn: AVSTEMMING_LABEL, budsjett: diff });
    return resultat.sort((a, b) => b.budsjett - a.budsjett);
  }

  const delA = {
    leietaker: medAvstemming(delALeietaker, OFFICIAL_LEIEINNTEKTER_BUDSJETT_2026),
    bygg: medAvstemming(
      [...perBygg.entries()].filter(([, v]) => v.delA !== 0).map(([bygg, v]) => ({ navn: bygg, budsjett: v.delA })),
      OFFICIAL_LEIEINNTEKTER_BUDSJETT_2026,
    ),
    leietype: medAvstemming(
      [...perLeietype.entries()].filter(([, v]) => v.delA !== 0).map(([leietype, v]) => ({ navn: leietype, budsjett: v.delA })),
      OFFICIAL_LEIEINNTEKTER_BUDSJETT_2026,
    ),
  };
  // Del B: ingen pr.-rad-budsjett - se v5-avsnitt i filhodet. Kun totalDelB brukes videre
  // (forecast-table-scriptet bygger ÉN samlet Totalt-rad av den).
  const delB = { leietaker: [], bygg: [], leietype: [] };

  console.log(`Budsjett (2026, Excel "Budsjett 2026 (redig) (2)"), eierandel-korrigert:`);
  console.log(`  Del A (leieinntekter) pr. leietaker: ${delALeietaker.length} rader, ${round2(delALeietaker.reduce((s, t) => s + t.budsjett, 0)).toLocaleString("nb-NO")} kr, offisiell total ${OFFICIAL_LEIEINNTEKTER_BUDSJETT_2026.toLocaleString("nb-NO")} kr`);
  console.log(`  Herav Ledig: ${round2(ledigBelop).toLocaleString("nb-NO")} kr, Mustad-intern: ${round2(mustadBelop).toLocaleString("nb-NO")} kr, uten Fazile-treff (${perUnmatchedNamed.size} navn): ${round2([...perUnmatchedNamed.values()].reduce((s, t) => s + t.delA, 0)).toLocaleString("nb-NO")} kr`);
  console.log(`  Del B (parkering): ${round2(delBBelop).toLocaleString("nb-NO")} kr i rå-arket, budsjettert kun som totallinje ${OFFICIAL_PARKERING_BUDSJETT_2026.toLocaleString("nb-NO")} kr - ingen pr.-rad-budsjett bygges.`);
  console.log(`  Matching-metode (Del A): ${JSON.stringify(viaCount)}`);
  const avstemmingDiff = delA.leietaker.find((r) => r.navn === AVSTEMMING_LABEL);
  console.log(`  Avstemmingsdifferanse Del A: ${avstemmingDiff ? avstemmingDiff.budsjett.toLocaleString("nb-NO") : 0} kr (${avstemmingDiff ? ((Math.abs(avstemmingDiff.budsjett) / OFFICIAL_LEIEINNTEKTER_BUDSJETT_2026) * 100).toFixed(2) : "0"}% av total) - IKKE en matchefeil, se filhode.`);
  console.log(`  Største uten-treff-rader (>50 000 kr), med Finance sin egen kommentar der den finnes:`);
  utenTreffStore
    .filter((r) => Math.abs(r.belop) > 50000)
    .sort((a, b) => Math.abs(b.belop) - Math.abs(a.belop))
    .forEach((r) => console.log(`    ${r.kontrakt} | ${r.bygg} | ${r.belop.toLocaleString("nb-NO")} kr | ${r.kommentar || "(ingen kommentar)"}`));

  const snapshot = {
    sistOppdatert: "2026-08-26",
    ar: 2026,
    delA,
    delB,
    totalDelA: OFFICIAL_LEIEINNTEKTER_BUDSJETT_2026,
    totalDelB: OFFICIAL_PARKERING_BUDSJETT_2026,
  };

  return pushToRedis(REDIS_HASH_KEY, REDIS_FIELD, snapshot, "tenant-budget-snapshot.json");
}

main();
