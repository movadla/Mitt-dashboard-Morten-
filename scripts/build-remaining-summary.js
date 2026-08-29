// Bygger og oppdaterer:
//  1) Redis-snapshotet for "Gjenstår per leietaker (Fazile)" (full leietaker/bygg-detalj)
//  2) Konsollutskrift for REMAINING-aggregatet i lib/incomeForecast.local.ts/.anon.ts
//     (kopier tallene inn manuelt - REMAINING er en liten, hardkodet konstant, ikke Redis-basert)
//
// Metodikk (Morten, 2026-08-24 - erstatter en tidligere, feilaktig fremover-rettet
// pro-rata-versjon av dette scriptet): gjenstår = FULL 2026-verdi (Fazile, årsbeløp
// justert for kontraktens faktiske start-/sluttdato i 2026) MINUS allerede fakturert
// i NXT for samme leietaker+bygg i år ("leieforhold" = leietaker+bygg-par - den
// fineste granulariteten NXT sin bokføring faktisk tillater).
//
// FORUTSETTER at disse datasettene allerede er ferske (se egne header-kommentarer):
//  - scripts/refresh-data/fazile-remaining-tenants/*.json (scripts/refresh-fazile-remaining-tenants.js)
//  - scripts/refresh-data/booked-tenants-snapshot.json (dump av jobb:inntektsprognose-bokfort-leietakere,
//    som igjen bygges av scripts/refresh-nxt-booked-tenants.js - MÅ inkludere eierandel-halvering
//    og dump-steget, se punkt 6/7 i den filens header-kommentar) - brukes som FALLBACK, se v3.
//  - scripts/refresh-data/nxt-booked-tenants/<companyNo>.json (de RÅ per-selskaps-filene,
//    customerNo pr. linje - allerede eierandel-halvert for de 3 delt-eide selskapene, se punkt 6
//    i refresh-nxt-booked-tenants.js) - PRIMÆR kilde for v3 sin ID-baserte matching.
//  - scripts/refresh-data/fazile-kontrakt-customerno-crosswalk.json (scripts/refresh-fazile-
//    kontrakt-crosswalk.js) - kontrakt_id -> nxtCustomerNo, PRIMÆR kilde for v3.
//
// v2 (2026-08-26, samme dag): Morten oppdaget ved å drille ned på en leietaker at
// parkerings-/garasjelinjer OG markedsbidragslinjer dukket opp i Del A (leieinntekter). To
// separate bugs, begge fikset her:
//  1) `del` (A/B) ble kun avgjort av SEKSJON-navnet (isDelB) - en linje sin egen `beskrivelse`
//     ble ikke sjekket. Fant 230 garasje-/parkeringslinjer (27,2 mill kr) i bygg der
//     seksjonsnavnet IKKE inneholder "garasje"/"parkering" (f.eks. "Garasje avg.pl. 183 pl" i
//     seksjonen "Strandveien 4-8") som dermed feilaktig havnet i Del A. Fikset ved å OGSÅ sjekke
//     `beskrivelse` pr. linje (PARKERING_LINJE_REGEX), ikke bare seksjonsnavnet.
//  2) Markedsbidragslinjer (alltid 0 kr i rådata, men dukket opp i leietaker-drilldownen) føres
//     ikke på 36xx-inntektskontiene i det hele tatt (Morten, 2026-08-26) - derfor ikke en reell
//     del av denne avstemmingen. Ekskluderes nå helt (hverken lines[] eller fullA/fullB).
//  3) Samme seksjonsnavn-vs-innhold-bug fantes også på NXT-siden (booked-tenants-snapshot.json
//     sin alleredeA/alleredeB-splitt, basert kun på accountNo 3640-3642) - fant 7 linjer (~1,7
//     mill kr) bokført på andre 36xx-konti (3650/3690) men med "Garasje"/"Uteparkering" i
//     NXT sitt eget bygg-navn. Fikset med samme regex mot `bygg`-feltet, ingen ny NXT-uttrekk
//     nødvendig (kjører kun på allerede nedlastet booked-tenants-snapshot.json).
//
// v3 (2026-08-26, samme dag): erstattet navnematching mellom Fazile og NXT med en pålitelig
// KUNDENUMMER-basert kobling som PRIMÆR matching-metode (Morten: "Det skal finnes en slik
// kobling mellom et kundenummer i fazile og nxt"). Bekreftet: Fazile sin `customer.erp_code`
// === NXT sin `customerNo`, eksakt, for alle sjekkede tilfeller - til tross for at samme
// leietaker kan hete tre forskjellige ting på tvers av Fazile sin `customer`-tabell, Fazile sin
// `invoice_receiver`-tabell, og NXT sin associate-post (bekreftet konkret for OHLA). Se
// scripts/refresh-fazile-kontrakt-crosswalk.js for full metodikk bak
// scripts/refresh-data/fazile-kontrakt-customerno-crosswalk.json (kontrakt_id -> nxtCustomerNo,
// 917/918 kontrakter dekket - 1 utelatt pga. en åpenbart feilregistrert erp_code "11" i Fazile).
// customerNo er kun unikt INNENFOR ett NXT-selskap - kombinert derfor med en bygg->selskap-
// oppslagstabell (utledet fra scripts/refresh-data/nxt-booked-tenants/<companyNo>.json sine
// `buildings`-lister) til nøkkelen `selskap||customerNo||bygg`, lest fra DE RÅ per-selskaps-
// filene (som har customerNo pr. linje), IKKE fra den navn-aggregerte booked-tenants-
// snapshot.json (som brukes videre som FALLBACK når ID-koblingen ikke finner noe - se
// matchViaCustomerNo()-funksjonen). Et leieforhold kan bestå av flere Fazile-kontrakter (f.eks.
// OHLA: 6 kontrakter for samme leietaker+bygg) - alle må da peke til SAMME nxtCustomerNo for at
// ID-matchen skal telle som pålitelig, ellers faller den tilbake til navnematching og logges som
// usikker. Dette fikset samtidig den strukturelle rotårsaken bak `FAZILE_TO_NXT_ALIASES`-
// mekanismen fra v2 (den beholdes som ENDA en fallback-lag for leieforhold uten
// crosswalk-dekning, f.eks. helt nye leietakere).
//
// TILLEGGSFIL (2026-08-26): scripts/refresh-data/fazile-remaining-tenants/
// _additions-negativ-gjenstar-2026-08-26.json - manuelt lagt til, håndplukkede EXPIRED
// RENT-type kontraktslinjer for et bekreftet utvalg (9 leieforhold) av de 48 tenantene med
// negativ gjenstår. Rotårsak: rent_roll-baserte uttrekket over henter KUN linjer som er aktive
// PÅ UTTREKKSDATOEN (default aktiv_dato = i dag) - når en kontrakt fornyes midt i 2026 (ny
// kontrakt-ID, ofte samme sats), forsvinner den utløpte linjens del av året helt fra
// datagrunnlaget, selv om NXT korrekt har fakturert for hele perioden. Se
// memory/project_income-forecast-negative-gjenstar-root-cause-2026-08-26.md for full liste over
// hvilke leieforhold som IKKE er dekket av denne tilleggsfilen ennå (samme mønster, ikke
// individuelt bekreftet/lagt inn pga. tidsbruk) - en fullstendig fiks krever et bredere
// Fazile-uttrekk (kun_aktive_linjer:false) for alle ~55 eiendommer, ikke gjort her.
//
// v5 (2026-08-26, samme dag) - flere mindre kontoserie-/eksklusjonsfikser og en ny
// SIGNED_BY_BOTH_PARTIES-sweep:
//  1) Energi (à konto energi/fast energi/energi avg.pl. o.l.) faktureres utenfor 36xx-serien
//     (Morten) - 38 linjer/ca. 2 032 503 kr ekskludert, se ENERGI_REGEX.
//  2) "Markedsføringsbidrag" (lengre variant av "Markedsbidrag") fanges nå også av
//     MARKEDSBIDRAG_REGEX - samme kontoserie-unntak, oppdaget blant SIGNED-kontraktene under.
//  3) 4Service Facility AS (Lilleakerveien 2A) omklassifisert fra generisk
//     "forklart-kontraktsendring" til en presis omsetningsleie-forklaring
//     (OMSETNINGSLEIE_LEIETAKERE) - kontraktslinjen har kun en nominell 0,10 kr-plassholder
//     siden omsetningsleie ikke er et fast årsbeløp.
//  4) NY: leieforhold som ender opp med fullA=fullB=alleredeA=alleredeB=0 etter linje-nivå-
//     ekskludering (typisk SD-anlegg/felleskost-only-leietakere som Lilleaker Vest Boligsameie)
//     droppes nå helt fra output i stedet for å lingre som en tom "ok"-rad.
//  5) NY sweep: kontrakter med status SIGNED_BY_BOTH_PARTIES men IKKE aktive ennå (fremtidig
//     innflytting/flytting, f.eks. Origon AS sin nye Vollsveien 17-kontrakt fra 2026-09-04) var
//     usynlige i uttrekket vårt frem til de faktisk ble aktive i Fazile - motsatt hull av den
//     systematiske EXPIRED-sweepen (v?, tidligere i dag), som fanget FOR TIDLIG avsluttede
//     kontrakter. Fant 10 SIGNED-kontrakter med startdato i 2026 via `contracts(filter:
//     {status:{eq:"SIGNED_BY_BOTH_PARTIES"}})` + `contract_lines`/`contract_customers`/
//     `customers`, lagt til i _additions-signed-not-active-2026-08-26.json (samme
//     rå-dataskjema som de andre addition-filene). 4 av de 10 (Rema 1000 Norge AS/Vollsveien
//     13D, Komplett ASA/Lilleakerveien 2B+Garasje, Origon AS/Vollsveien 17, El Camino AS/
//     Lilleakerveien 16) overlapper med Morten sitt MANUELLE "Potensiell fremtidig inntekt"-
//     anslag i lib/incomeForecastPotential.ts (2 558 244 kr, satt 2026-08-25/26) - ca.
//     1,9 mill kr av det automatiserte tillegget dekker nå samme kontrakter. Morten må selv
//     redusere/nulle den manuelle posten for å unngå dobbelttelling (IKKE gjort automatisk her -
//     det er hans manuelt vedlikeholdte tall). De resterende 6 kontraktene (Norcap AS, Nordic
//     Outdoor AS, Julie Josephine AS, én privatperson, Møllefossen Cafe AS) var ikke i det
//     manuelle anslaget fra før - helt nytt bidrag (~708 000 kr).
//  6) KORRIGERT samme dag: konto 3650 ("Andre leieinntekter avg. pl") sin antatte "felleskost"-
//     forklaring var FEIL - sjekket faktisk NXT-transaksjonstekst direkte (Morten var skeptisk,
//     med rette). Reell forklaring: legitime, ikke-kontraktsfestede tilleggsinntekter (datarom/
//     rack-utleie, møterom-utleie, forlenget gymsal-leie o.l.) som Fazile sitt kontraktslinje-
//     baserte uttrekk aldri kan fange opp, siden det ikke finnes noen tilsvarende kontraktslinje.
//     IKKE en feilføring, IKKE fikset (kan ikke fikses - pengene er reelle, bare uten
//     kontraktsgrunnlag i Fazile).
//
// v6 (2026-08-26, samme dag) - systematisk linjebytte-sweep, portefølje-bredt:
//  Utvidet v5 sitt Teco/Kletor-funn (kontraktslinje byttet MIDT i 2026 innenfor samme, fortsatt
//  aktive kontrakt - gammel linje sluttet, ny startet dager/uker senere, uttrekket vårt fanget
//  kun den nye) til en full portefølje-sweep: alle 819 kjente kontrakt_id sjekket mot FULL
//  linjehistorikk (contract_lines, ikke bare det som er aktivt i dag). Fant 92 manglende linjer,
//  men BEHOLDT KUN 80 av dem (netto +9 940 379 kr) i _additions-line-swap-sweep-2026-08-26.json -
//  ekskluderte bevisst to lavere-tillit-grupper som IKKE er samme mønster:
//   - 11 linjer ("Leierabatt avg.fritt 30%", samme seksjon Lilleakerveien 26/garasje, identisk
//     1.-6. juli-vindu hvert år, netto -670 580 kr) - ser ut som en årlig admin-artefakt i Fazile
//     sin rabatt-håndtering, ikke et reelt "tapt" beløp. IKKE inkludert - avventer Morten sin
//     vurdering før dette ev. tas med.
//   - 1 linje (SWAY PILATES AS, Lilleakerveien 4D, "Leiefritak avg.pl." +369 380 kr, 1.-16. aug
//     2026) - mistenkelig POSITIV verdi for en leiefritak-linje (skal normalt være negativ/et
//     fradrag) - trolig en feilregistrering i Fazile sin masterdata. IKKE inkludert uten videre
//     bekreftelse.
//
// Kjør: node scripts/build-remaining-summary.js

const fs = require("fs");
const path = require("path");

const FAZILE_DIR = path.join(__dirname, "refresh-data", "fazile-remaining-tenants");
const NXT_BOOKED_SNAPSHOT = path.join(__dirname, "refresh-data", "booked-tenants-snapshot.json");
const NXT_BOOKED_TENANTS_DIR = path.join(__dirname, "refresh-data", "nxt-booked-tenants");
const FAZILE_KONTRAKT_CROSSWALK_FILE = path.join(__dirname, "refresh-data", "fazile-kontrakt-customerno-crosswalk.json");
const REDIS_HASH_KEY = "jobb:inntektsprognose-gjenstar-leietakere";
const REDIS_FIELD = "snapshot";

// Se punkt 3 i scripts/refresh-fazile-remaining-tenants.js sin header-kommentar.
const STRANDVEIEN_4_8_MANUAL_HALVING = "Strandveien 4-8_E";

// CC Vest-senteret heter "Lilleakerveien 16" i Fazile (eiendom "Lilleakerveien 16 mm_E")
// men "CC Vest Senter" i NXT - bekreftet ved identisk, stor kjede-/butikk-leietakerliste
// på begge sider (kjente CC Vest-navn gjenkjent på tvers), IKKE gjettet.
const CC_VEST_NXT_BYGG = "CC Vest Senter";

// Bygg-navn-alias: Fazile-seksjon (normalisert) -> NXT-bygg-navn (eksakt streng, som i
// booked-tenants-snapshot.json). Kun trygge, bekreftede sammenslåinger - ALDRI gjett en
// ny en uten å kryssjekke leietakerlisten på begge sider slik disse ble bekreftet.
const BUILDING_ALIASES = {
  "arnstein arnebergsvei 4": "Arnstein Arnebergs vei 4",
  "mustadsvei 1": "Mustads vei 1",
  "lilleakerveien 16": CC_VEST_NXT_BYGG,
  "lilleakerveien 16 skoda": "Lilleakerveien 16 Bilforretning",
  // Bilforhandlerens Audi/VW-forhandlerseksjoner i Fazile tilsvarer NXT sine rene
  // bygg-bøtter i Fåbro Eiendom AS - bekreftet ved at leietakerens årsbeløp
  // (9,89 mill / 13,71 mill) matcher NXT-beløpene på kroneøre.
  "lilleakerveien 20 audi": "Lilleakerveien 20",
  "lilleakerveien 22 vw": "Lilleakerveien 22",
  // Funnet 2026-08-24 ved å undersøke "ikke matchet i NXT"-leieforhold: leietakernavnet
  // fantes eksakt i NXT, bare under et annet bygg-navn enn Fazile sitt - bekreftet ved å
  // sammenligne NXT sin bygg-liste for de samme leietakerne (44/11/5/1/1 leieforhold løst).
  "lilleakerveien 2 garasje": "Lilleakerveien 2 - Garasje", // NXT har bindestrek
  "lilleakerveien 6d hus 3": "Lilleakerveien 6D", // Fazile sin "Hus 3"-detalj finnes ikke i NXT
  "p-bro uteparkering": "P-Bro mellom LV8 og LV4",
  "mustads vei 10 fåbro gård": "Mustads vei 10",
  "mustads vei 12 hagebyen": "Mustads vei 12",
};

const { loadEnvLocal, pushToRedis, normalizeName, coreName } = require("./lib/refresh-helpers");

// Onepark AS - parkeringsdrift utenfor Fazile rent_roll (etterfakturert basert på tilsendt
// omsetningsrapport, ikke en vanlig leiekontrakt). De 6 leieforholdene under nulles derfor
// automatisk til "avsluttet" (ingen aktiv Fazile-kontrakt), men det er FEIL for Onepark - det
// er fortsatt en løpende, ordinær driftsinntekt resten av året. Manuell korreksjon (Morten,
// 2026-08-25): bruk årsestimatet fra Inntektsprognose-arkets "Onepark"-fane (rullerende
// prognose basert på 2025-fakturering × vekstfaktor jan-mai 2026) minus det som allerede er
// fakturert i NXT i år, lagt til Del B (ren parkeringsdrift) som ETT samlet portefølje-tillegg
// - IKKE fordelt bygg for bygg, siden Onepark-arkets bygg-liste (CC Vest P-hus, Carl. L.
// P-kontroll, Lilleakerveien 2, Lilleakerveien 2 Ute, Granfos Næringspark, Lilleakerveien 31,
// Lilleakerveien 8) ikke er 1:1 med Fazile sine 6 byggGrupper for Onepark AS - ville krevd en
// bygg-alias-tabell som ikke er bekreftet.
const ONEPARK_LEIETAKER_KEY = "onepark as";
const ONEPARK_ESTIMAT_2026 = 9457370.44; // Kilde: 2026_08_04_Inntektsprognose_Juli_2026.xlsx, fane "Onepark", rad "Estimert inntekt 2025"-linjen (P40)

// Konto 3632 = avregning av 2025-omsetningsleien, IKKE en 2026-inntekt (funnet 2026-08-25
// etter Mortens spørsmål om en CC Vest-leietaker med fakturert > Fazile sin årsverdi). Bevis fra NXT generalLedgerTransaction (Mustad
// Eiendom AS, CC Vest Senter): et bilag 2025-12-31 "Avsetning/Tbf avsetning omsetningsleie
// 2025 iht vedlegg" bokført på customerNo=0 (ingen leietakerreferanse - blir "Andre (bokført
// uten leietakerreferanse)" i booked-tenants-snapshot.json), NETTO -11 112 558 kr (2026-08-25,
// verifisert direkte mot live NXT groupBy-uttrekk - matcher EKSAKT det som allerede lå i
// rådatafilen fra 2026-08-24, altså IKKE et fersk-data-spørsmål). Gjennom jan-aug 2026 er
// denne avsetningen fordelt ut på ~38 enkeltposteringer pr. leietaker PÅ SAMME KONTO (tekstet
// "Overført fra Fazile"/"Midlertidig avregning omsetningsleie"). Disse postene er en
// ETTERSKUDDSVIS avregning av 2025 sin faktiske omsetning, ikke en 2026-leieinntekt - må IKKE
// telle mot leietakerens 2026-gjenstår (da ville leietaker-tabellen vise leietakere som "over
// budsjett" pga. en 2025-hendelse). Ekskluderes derfor helt fra alleredeFakturertDelA/DelB
// under. "Andre"-pseudotenanten sin egen konto-3632-linje (avsetningen/reverseringen) må
// SKILLES FRA de reelle leietakernes fordelte linjer når vi summerer - ellers netter de to
// mot hverandre og "fordelt til leietakere" blir kunstig lavt (feil jeg selv gjorde i første
// runde av denne fiksen). Spores i stedet separat pr. side (se omsetningsavregning2025-feltet
// på snapshotet) slik at beløpet ikke bare forsvinner stille. Fremtidig, EKTE
// 2026-omsetningsavregning (samme mekanisme, men for 2026 sin omsetning, betales trolig ut i
// 2027) er et eget tema Morten vil se nærmere på senere - IKKE bygget her.
const OMSETNINGSAVREGNING_2025_KONTI = new Set([3632]);
const OMSETNINGSAVREGNING_2025_ANDRE_NAVN = "andre (bokført uten leietakerreferanse)";

// Interne Mustad-selskaper som noen ganger opptrer som "leietaker" i Fazile-data (egne
// lokaler/administrative posteringer) - ikke reelle eksterne leieforhold. Flagges separat
// (status "intern-mustad") i stedet for å telles som et vanlig usikkert avvik.
const INTERN_MUSTAD_NAMES = new Set(["mustad eiendom as", "mustad eiendomsdrift as"]);

// Bekreftet mot faktiske NXT-transaksjoner (2026-08-26, konto 3615 "Erstatning" - HELE
// kontoens 2026-posteringer for Mustad Eiendom AS ble sjekket, kun 5 poster, disse 3 er de
// eneste med reell netto-effekt): et engangs sluttoppgjør/exit fee betalt av leietaker VED
// FLYTTING, bokført direkte i NXT uten noen tilsvarende Fazile-kontraktslinje (det er ikke
// løpende leie, så det finnes ikke noe "årsbeløp" å sammenligne mot) - forklarer HELE eller
// mesteparten av negativ gjenstår for akkurat disse tre leieforholdene, IKKE en indikasjon på
// feil i noen av datakildene.
const ENGANGSGEBYR_LEIETAKERE = new Map([
  ["quantafuel as", "Exit fee ved flytting før utløp kontrakt, 2 261 627 kr (NXT bilag 2026-02-11, konto 3615 Erstatning)."],
  ["ohla norge - obrascón huarte lain s.a. norwegian branch nuf", "Termination agreement/sluttoppgjør, 919 312,11 kr (NXT bilag 2026-04-29, konto 3615 Erstatning)."],
  ["reitan convenience norway as/kiosk 814", "Utkjøpsbeløp ved avslutning av leieforhold, 600 000 kr (NXT bilag 2026-08-17, konto 3615 Erstatning)."],
]);

// Leieforhold der Fazile sin kontraktslinje bevisst har en nominell/ubetydelig kontraktsverdi
// (linjetype RENT, beskrivelse "Omsetningsleie avg.pl.") fordi omsetningsleie per definisjon
// IKKE er et fast årsbeløp - "full 2026-verdi" blir da kunstig nær 0, mens NXT sitt bokførte
// beløp er den reelle, omsetningsbaserte faktureringen. Bekreftet konkret for 4Service Facility
// AS (2026-08-26, Lilleakerveien 2A) etter dyptgående undersøkelse - IKKE samme årsak som den
// bygg-baserte CC Vest-heuristikken over (status "forklart-omsetningsleie" gjenbrukes likevel,
// siden begge beskriver samme underliggende fenomen).
const OMSETNINGSLEIE_LEIETAKERE = new Map([
  ["4service facility as", "Omsetningsleie (Fazile-kontraktslinjen har kun en nominell plassholderverdi på 0,10 kr siden omsetningsleie ikke er et fast årsbeløp) - NXT sitt bokførte beløp er reell omsetningsbasert fakturering, ikke et avvik."],
]);

// Leieforhold der negativ gjenstår skyldes en BEKREFTET feilkoding i NXT sin egen bokføring
// (ikke en Fazile/matching-feil) - grundig verifisert direkte mot faktiske NXT-transaksjoner
// (2026-08-26), ikke antatt. Reell fiks krever at Regnskap korrigerer bilagene i NXT, ikke noe
// som kan rettes i denne rapporten - status forklarer i mellomtiden hvorfor tallet er stort og
// negativt, se Morten sin bekreftelse "Ja" (2026-08-26) på at dette skal merkes på samme måte
// som ENGANGSGEBYR_LEIETAKERE over.
const NXT_FEILKODING_LEIETAKERE = new Map([
  [
    "statkraft as",
    "To bekreftede NXT-feilkodinger for parkering (Lilleakerveien 6): (1) desember-2025-fakturaen (bilag 28228) postet P-husets 237+43+7 plasser (1,44 mill kr) på bygg-koden for «Lilleakerveien 6» i stedet for «Lilleakerveien 6 P-hus» - aldri korrigert i senere kvartaler; (2) gjesteparkeringskontrakten (417 000 kr/år) bokføres av NXT under et annet bygg («Lilleakerveien 12-14»), ikke noen «Lilleakerveien 6»-variant. Øvrige parkeringsbygg (4E, 4CDEF Uteparkering) stemmer på øret mot Fazile.",
  ],
  [
    "human care as",
    "Bekreftet dobbeltposterings-feil i NXT (konto 3650, «Overført fra Fazile», Lilleakerveien 4A): Fazile sin Lagerleie-linje (17 199 kr/år) er postet BÅDE som ett fullt årsbeløp (17 199 kr, 21.05) OG som tre kvartalsstore delbeløp (4 299,75 kr × 3, 21.05 og 01.07) - til sammen 30 098,25 kr, nesten dobbelt av kontraktens reelle årsverdi. Pluss en liten møterom-leie (1 750 kr) - se ENERGI/andre-leieinntekter-mønsteret i v5. IKKE en identitets-/navneforveksling (sjekket «AssisterMeg AS», NXT customerNo 10781 - kun små, urelaterte møterom-belastninger der, ingen kobling til denne kontraktslinjen).",
  ],
]);

function isDelB(seksjon) {
  const s = seksjon.toLowerCase();
  return s.includes("garasje") || s.includes("parkering") || s.includes("p-hus") || s.includes("p-bro");
}

// Linje-nivå-sjekk (i tillegg til isDelB() sin seksjon-nivå-sjekk) - se v2-avsnitt i filhodet.
// Utvidet 2026-08-27 (Morten, Dell AS-funn): noen leietakere (utenlandske selskaper/kontrakter
// ført på engelsk i Fazile) har "Rent Parking..." i stedet for "Parkering"/"Garasje" - fanges
// ikke opp av det norske ordet alene. Samme prinsipp gjelder trolig flere kategorier under, se
// hver enkelt regex-kommentar.
const PARKERING_LINJE_REGEX = /garasje|parkering|\bparking\b/i;
const MARKEDSBIDRAG_REGEX = /markedsf.ringsbidrag|markedsbidrag/i; // "Markedsføringsbidrag" er samme avgiftstype/kontoserie som "Markedsbidrag" - funnet 2026-08-26 blant SIGNED_BY_BOTH_PARTIES-kontraktene, samme regel gjelder
// Fazile-leietakernavn -> NXT-assosiatnavn, for leieforhold der eksakt- og kjernenavn-matching
// mot nxtGroups (se resolveNxtTenantName under) IKKE finner leieforholdet - typisk pga. et
// suffiks Fazile har som NXT mangler. Oppdaget 2026-08-26: "Reitan Convenience Norway AS/Kiosk
// 814" (Fazile) fant aldri "Reitan Convenience Norway AS" (NXT) pga. "/Kiosk 814"-suffikset -
// et reelt sluttoppgjør på 600 000 kr for dette leieforholdet lå derfor helt uattribuert. Samme
// mønster for "Krinor AS" (Fazile) vs. "Krinor AS (benyttes ikke)" (NXT). Selskapsnavn her
// (committet kode er OK, se ANONYMISERING.md) - privatpersoner ligger i en egen gitignored fil,
// se FAZILE_TO_NXT_PRIVATE_ALIASES_FILE under.
const FAZILE_TO_NXT_ALIASES = {
  "reitan convenience norway as/kiosk 814": "reitan convenience norway as",
  "krinor as": "krinor as (benyttes ikke)",
};
const FAZILE_TO_NXT_PRIVATE_ALIASES_FILE = path.join(__dirname, "refresh-data", "_private-fazile-to-nxt-aliases.json");
if (fs.existsSync(FAZILE_TO_NXT_PRIVATE_ALIASES_FILE)) {
  const privateAliases = JSON.parse(fs.readFileSync(FAZILE_TO_NXT_PRIVATE_ALIASES_FILE, "utf8"));
  for (const [key, value] of Object.entries(privateAliases)) {
    if (key.startsWith("_")) continue;
    FAZILE_TO_NXT_ALIASES[key] = value;
  }
}

// Felleskostnader/kantinebidrag er tatt bort fra dette regnestykket (Morten, 2026-08-26) - samme
// prinsipp som markedsbidrag over. IKKE anker mot "kantine" alene uten "bidrag" (ville truffet
// f.eks. "Husleie avg.pl. møterom/kantine", som er ekte husleie for et fysisk lokale, ikke et
// felleskost-/kantinebidrag). Alle treff i rådata pr. 2026-08-26 er 0 kr uansett (kun kosmetisk
// opprydding av leietaker-drilldownen), men filteret er skrevet fremtidssikkert.
// Utvidet 2026-08-27 (Morten, Dell AS-funn): "Canteen Contribution" er engelsk for
// kantinebidrag - IKKE fanget av det norske ordet alene (f.eks. Dell AS sin 1 050 000 kr-linje).
// Utvidet 2026-08-27 (Morten, Medu AS-funn): "Kantine avg. fritt (9)" ble IKKE fanget - den
// gamle `^kantine$` krevde at HELE beskrivelsen var eksakt "Kantine", ingenting mer. Byttet til
// `^kantine(\s|$)` (kantine som FØRSTE ord, evt. med mer tekst etter) - fanger nå "Kantine
// avg. fritt (9)" uten å ramme "Husleie avg.pl. møterom/kantine" (Norconsult Norge AS,
// 881 699,40 kr, ekte husleie for et fysisk lokale - "kantine" står IKKE først der).
const FELLESKOST_KANTINE_REGEX = /^à konto felleskost|^felleskost|kantinebidrag|^kantine(\s|$)|canteen contribution/i;

// Energi faktureres også utenfor 36xx-kontoserien dette tegnestykket dekker (Morten, 2026-08-26
// - bekreftet: NXT sin rå per-selskaps-bokføring (scripts/refresh-data/nxt-booked-tenants/) har
// KUN konti 3600-3690, ingen egen energi-konto der - altså allerede ekskludert på NXT-siden helt
// av seg selv). Fazile-siden hadde derimot 38 rene energi-linjer (à konto energi/fast energi/
// energi avg.pl. o.l., IKKE de som allerede starter med "Felleskostnader for..." og dermed
// fanges av FELLESKOST_KANTINE_REGEX over) på til sammen ca. 2 032 503 kr som fortsatt lå inne i
// Del A - ekskluderes nå helt, samme prinsipp som felleskostnader/SD-anlegg over.
// Utvidet 2026-08-27 (Morten, Dell AS/Systemkjøp AS-funn): engelske varianter ("on account
// energy", "Electricity", stavevarianten "Electrisity" - IKKE fanget av /electric/i alene) og
// norsk "Ladestrøm" (lade-EL-KRAFT, samme prinsipp som energi - ikke å forveksle med
// "Ladestasjon leie" som er reell utleie av selve ladeinfrastrukturen, ikke strømkostnaden).
// Utvidet 2026-08-27 (Morten sitt bygg-spørsmål om CC Vest Stormarked AS ledet til dette funnet):
// "Strøm" (norsk for elektrisk kraft/power) er samme energikategori, bare et annet ord enn
// "energi" - fanget ikke opp "Strøm solcelleanlegg avg.pl." (380 869,17 kr), som trolig ER hele
// forklaringen på CC Vest Stormarked AS sitt tidligere uforklarte +380 620,53 kr-avvik.
const ENERGI_REGEX = /energi|energy|electric|electrisity|ladestrøm|strøm/i;

// Eiendomsskatt er en viderefakturert kostnad (pass-through), ikke reell leieinntekt - samme
// prinsipp som felleskostnader/energi over (Morten, 2026-08-27 - bekreftet at dette var sagt
// tidligere, men ikke fanget opp i praksis: 24 linjer/634 383,38 kr lå fortsatt inne i Del A,
// bl.a. Quantafuel sin "Eiendomsskatt avg.pl."-linje). Dekker "Eiendomsskatt"/"Eiendomskatt"
// (observert stavevariant uten "s") i alle former (avg.pl., avg.fritt, med etasje-/rom-suffiks).
// Utvidet 2026-08-27 (Morten, Dell AS-funn): "Property tax" er engelsk for eiendomsskatt.
const EIENDOMSSKATT_REGEX = /eiendomsskatt|eiendomskatt|property tax/i;

// Administrasjonsbidrag er en viderefakturert kostnad (pass-through), ikke reell leieinntekt -
// samme prinsipp som felleskostnader/energi/eiendomsskatt over (Morten, 2026-08-27, funnet hos
// Elkjøp Norge AS - 5 linjer/105 421,69 kr portefølje-bredt).
const ADMINISTRASJONSBIDRAG_REGEX = /administrasjonsbidrag/i;

// Driftsavtale/vaktmestertjeneste er en viderefakturert driftskostnad, ikke reell leieinntekt -
// samme prinsipp som over (Morten, 2026-08-27, funnet hos Norrøna Sport AS - forklarer trolig
// mye av det tidligere uforklarte -274 278 kr-avviket, se memory).
const DRIFTSAVTALE_REGEX = /driftsavtale|vaktmester/i;

// SD-anlegg (Sentral Driftskontroll - bygningsautomasjon for oppvarming/tappevann/snøsmelting
// o.l.) faktureres på NXT konto 3900, IKKE i 36xx-serien dette tegnestykket dekker (Morten,
// 2026-08-26 - konkret funnet for "Skolehagen Borettslag", 275 000 kr, som dukket opp som
// "ikke-matchet-i-nxt" fordi vi lette i feil kontoserie, ikke fordi fakturering mangler). Sjekket
// om flere leieforhold har samme mønster - fant også "Lilleaker Vest Boligsameie" (108 441,74 kr,
// samme "ikke-matchet-i-nxt"-symptom) og en 0 kr-linje hos Zones AS. Ekskluderes helt, samme
// prinsipp som markedsbidrag/felleskostnader over.
const SD_ANLEGG_REGEX = /sd.?anlegg/i;

function resolveNxtBuilding(fazileSeksjon, nxtBuildingSet) {
  const norm = normalizeName(fazileSeksjon);
  if (BUILDING_ALIASES[norm]) return BUILDING_ALIASES[norm];
  for (const b of nxtBuildingSet) if (normalizeName(b) === norm) return b;
  // Uteparkering/garasje/p-hus-fallback: prøv "X Uteparkering" eller basenavnet uten suffiks.
  const withoutSuffix = norm.replace(/\s*(uteparkering|garasje|p-hus)$/i, "").trim();
  if (withoutSuffix !== norm) {
    for (const b of nxtBuildingSet) {
      const bn = normalizeName(b);
      if (bn === withoutSuffix + " uteparkering" || bn === withoutSuffix) return b;
    }
  }
  return null; // ikke funnet - allerede fakturert=0, hele beløpet telles som gjenstår
}

function daysBetweenInclusive(start, end) {
  return Math.round((end - start) / 86400000) + 1;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function main() {
  loadEnvLocal();

  const yearStart = new Date("2026-01-01");
  const yearEnd = new Date("2026-12-31");
  const daysInYear = daysBetweenInclusive(yearStart, yearEnd);

  const nxtData = JSON.parse(fs.readFileSync(NXT_BOOKED_SNAPSHOT, "utf8"));
  const nxtBuildingSet = new Set();
  for (const t of nxtData.tenants) for (const l of t.lines) nxtBuildingSet.add(l.bygg);
  const nxtGroups = new Map(); // "tenant||bygg" -> { alleredeA, alleredeB }
  let sumOmsetningsavregning2025Fordelt = 0; // reelle leietakeres andel av avregningen
  let sumOmsetningsavregning2025Avsetning = 0; // "Andre" (customerNo=0) sin side - selve avsetningen/reverseringen
  for (const t of nxtData.tenants) {
    const erAndreUtenLeietakerreferanse = normalizeName(t.navn) === OMSETNINGSAVREGNING_2025_ANDRE_NAVN;
    for (const l of t.lines) {
      if (OMSETNINGSAVREGNING_2025_KONTI.has(l.accountNo)) {
        // "Andre" sin linje er avsetningen/reverseringen selv - MÅ holdes separat fra det som
        // er fordelt til reelle leietakere, ellers netter de to seg mot hverandre og "fordelt"
        // blir kunstig lavt (se kommentaren ved OMSETNINGSAVREGNING_2025_KONTI).
        if (erAndreUtenLeietakerreferanse) sumOmsetningsavregning2025Avsetning += l.belop;
        else sumOmsetningsavregning2025Fordelt += l.belop;
        continue; // hører ikke til 2026-gjenstår, uansett hvilken side
      }
      const key = normalizeName(t.navn) + "||" + normalizeName(l.bygg);
      if (!nxtGroups.has(key)) nxtGroups.set(key, { alleredeA: 0, alleredeB: 0 });
      const g = nxtGroups.get(key);
      const erParkeringsbygg = PARKERING_LINJE_REGEX.test(l.bygg || "");
      if ([3640, 3641, 3642].includes(l.accountNo) || erParkeringsbygg) g.alleredeB += l.belop;
      else g.alleredeA += l.belop;
    }
  }
  sumOmsetningsavregning2025Fordelt = round2(sumOmsetningsavregning2025Fordelt);
  sumOmsetningsavregning2025Avsetning = round2(sumOmsetningsavregning2025Avsetning);

  // ID-basert matching (v3, primær metode - se v3-avsnittet i filhodet). Bygges fra de RÅ
  // per-selskaps NXT-filene (customerNo pr. linje), ikke fra den navn-aggregerte
  // booked-tenants-snapshot.json over.
  //
  // 2026-08-27-funn (Morten sin "gjenstår bør være ~1/4"-revisjon): NXT har egne orgUnit3-koder
  // for co-working-underavdelinger av et hovedbygg ("Lilleakerveien 4A Modus" = 415,
  // "Lilleakerveien 2C, Plan 3 Co-work" = 2033) som IKKE finnes som egen bygg-verdi på
  // Fazile-siden - leietakeren har bare ETT leieforhold på hovedbygget der. Uten denne
  // sammenslåingen endte under-koden sin andel av årsleien i en egen nxtGroups-nøkkel som
  // aldri ble slått opp, og "allerede fakturert" ble kunstig lavt for minst 12 leietakere
  // (Norsk Bedriftsmegling, Advokatfirmaet Klose, Sonata, Colgate-Palmolive, Ifm Electronic,
  // Advokat Annicken Iversen, Ors Consulting, Bedriftsakademiet, Recover, S Insurance,
  // Sky Technology, Ingeniør Ivar Pettersen - alle Lilleakerveien 4A/2C). IKKE forveksle med
  // de ekte "Uteparkering"/"P-hus"-underkodene (samme prefiks-mønster, men reelt separate
  // parkeringsbygg som skal forbli i Del B via PARKERING_LINJE_REGEX, ikke slås sammen).
  const BYGG_UNDERBYGG_TIL_HOVEDBYGG = new Map([
    ["Lilleakerveien 4A Modus", "Lilleakerveien 4A"],
    ["Lilleakerveien 2C, Plan 3 Co-work", "Lilleakerveien 2C"],
  ]);
  let kontraktCrosswalk = {};
  const byggTilSelskap = new Map(); // normalisert bygg-navn -> selskap
  const nxtGroupsByCustomerNo = new Map(); // "selskap||customerNo||bygg" -> { alleredeA, alleredeB }
  if (fs.existsSync(FAZILE_KONTRAKT_CROSSWALK_FILE) && fs.existsSync(NXT_BOOKED_TENANTS_DIR)) {
    kontraktCrosswalk = JSON.parse(fs.readFileSync(FAZILE_KONTRAKT_CROSSWALK_FILE, "utf8")).kontraktIdTilNxtCustomerNo || {};
    const companyFiles = fs.readdirSync(NXT_BOOKED_TENANTS_DIR).filter((f) => f.endsWith(".json") && f !== "meta.json");
    for (const file of companyFiles) {
      const company = JSON.parse(fs.readFileSync(path.join(NXT_BOOKED_TENANTS_DIR, file), "utf8"));
      for (const bygg of Object.values(company.buildings)) byggTilSelskap.set(normalizeName(bygg), company.selskap);
      for (const l of company.lines) {
        if (OMSETNINGSAVREGNING_2025_KONTI.has(l.accountNo)) continue; // se OMSETNINGSAVREGNING_2025_KONTI-kommentaren over
        let bygg = company.buildings[String(l.orgUnit3)];
        if (!bygg) continue;
        bygg = BYGG_UNDERBYGG_TIL_HOVEDBYGG.get(bygg) || bygg;
        const key = company.selskap + "||" + l.customerNo + "||" + normalizeName(bygg);
        if (!nxtGroupsByCustomerNo.has(key)) nxtGroupsByCustomerNo.set(key, { alleredeA: 0, alleredeB: 0 });
        const g = nxtGroupsByCustomerNo.get(key);
        const belop = -l.belop; // sign-flip, samme konvensjon som resten av scriptet
        const erParkeringsbygg = PARKERING_LINJE_REGEX.test(bygg || "");
        if ([3640, 3641, 3642].includes(l.accountNo) || erParkeringsbygg) g.alleredeB = round2(g.alleredeB + belop);
        else g.alleredeA = round2(g.alleredeA + belop);
      }
    }
  } else {
    console.log("ADVARSEL: fant ikke crosswalk-fil og/eller nxt-booked-tenants/-mappen - ID-basert matching hoppes over, kun navnematching brukes.");
  }
  // Slår opp NXT-bokføring for et leieforhold via kontrakt_id -> customerNo -> selskap+bygg.
  // Returnerer null (ikke funnet/usikkert) i stedet for å kaste - kalleren faller da tilbake til
  // navnematching. "usikker" (flere ulike customerNo på samme leieforhold) logges eksplisitt.
  function matchViaCustomerNo(kontraktIds, bygg) {
    const customerNos = new Set();
    for (const kid of kontraktIds) {
      const no = kontraktCrosswalk[kid];
      if (no) customerNos.add(no);
    }
    if (customerNos.size === 0) return { nxt: null, usikker: false };
    if (customerNos.size > 1) return { nxt: null, usikker: true }; // motstridende kontrakter - IKKE stol på noen av dem
    const selskap = byggTilSelskap.get(normalizeName(bygg));
    if (!selskap) return { nxt: null, usikker: false }; // bygg finnes ikke i noe NXT-selskap sin buildings-liste
    const customerNo = [...customerNos][0];
    const nxt = nxtGroupsByCustomerNo.get(selskap + "||" + customerNo + "||" + normalizeName(bygg));
    return { nxt: nxt || null, usikker: false };
  }

  // Kjerne-navn-indeks (uten selskapsform/tegnsetting) - fallback-nøkkel når eksakt
  // normalisert navn ikke matcher (f.eks. et leietakernavn skrevet med "A/S" vs "AS").
  // Kun brukt når kjerne-navnet peker til NØYAKTIG ÉN reell NXT-leietaker (unngår
  // feilkobling ved tvetydighet).
  const nxtCoreNameIndex = new Map(); // coreName -> Set(reelt NXT-navn)
  for (const t of nxtData.tenants) {
    const c = coreName(t.navn);
    if (!nxtCoreNameIndex.has(c)) nxtCoreNameIndex.set(c, new Set());
    nxtCoreNameIndex.get(c).add(t.navn);
  }
  function resolveNxtTenantName(fazileLeietaker) {
    const candidates = nxtCoreNameIndex.get(coreName(fazileLeietaker));
    if (candidates && candidates.size === 1) return [...candidates][0];
    return null;
  }

  const files = fs
    .readdirSync(FAZILE_DIR)
    .filter((f) => f.endsWith(".json") && f !== "meta.json" && f !== "properties.json");

  // key = "leietaker||bygg (fazile-navn)" -> { leietaker, bygg, resolvedBygg, fullA, fullB, lines[] }
  const leieforhold = new Map();

  for (const file of files) {
    const rows = JSON.parse(fs.readFileSync(path.join(FAZILE_DIR, file), "utf8"));
    for (const row of rows) {
      if (MARKEDSBIDRAG_REGEX.test(row.beskrivelse || "")) continue; // føres ikke på 36xx, se v2-avsnitt i filhodet
      if (FELLESKOST_KANTINE_REGEX.test((row.beskrivelse || "").trim())) continue; // tatt bort fra tegnestykket, se v2-avsnitt i filhodet
      if (SD_ANLEGG_REGEX.test(row.beskrivelse || "")) continue; // faktureres på konto 3900, ikke 36xx - se kommentar ved SD_ANLEGG_REGEX
      if (ENERGI_REGEX.test(row.beskrivelse || "")) continue; // faktureres utenfor 36xx-serien - se kommentar ved ENERGI_REGEX
      if (EIENDOMSSKATT_REGEX.test(row.beskrivelse || "")) continue; // viderefakturert kostnad, ikke reell leieinntekt - se kommentar ved EIENDOMSSKATT_REGEX
      if (ADMINISTRASJONSBIDRAG_REGEX.test(row.beskrivelse || "")) continue; // viderefakturert kostnad - se kommentar ved ADMINISTRASJONSBIDRAG_REGEX
      if (DRIFTSAVTALE_REGEX.test(row.beskrivelse || "")) continue; // viderefakturert driftskostnad - se kommentar ved DRIFTSAVTALE_REGEX

      const lineStart = row.start_dato ? new Date(row.start_dato) : yearStart;
      const lineEnd = row.slutt_dato ? new Date(row.slutt_dato) : yearEnd;
      const effectiveStart = lineStart > yearStart ? lineStart : yearStart;
      const effectiveEnd = lineEnd < yearEnd ? lineEnd : yearEnd;
      const days = daysBetweenInclusive(effectiveStart, effectiveEnd);
      if (days <= 0) continue; // linjen overlapper ikke 2026 i det hele tatt

      let belop = (row.arsleie_nok * days) / daysInYear;
      if (row.eiendom === STRANDVEIEN_4_8_MANUAL_HALVING) belop *= 0.5;
      belop = round2(belop);

      const del = isDelB(row.seksjon) || PARKERING_LINJE_REGEX.test(row.beskrivelse || "") ? "B" : "A";
      const resolvedBygg = resolveNxtBuilding(row.seksjon, nxtBuildingSet);
      const buildingForMatch = resolvedBygg || row.seksjon;
      const key = normalizeName(row.leietaker) + "||" + normalizeName(buildingForMatch);

      if (!leieforhold.has(key)) {
        leieforhold.set(key, {
          leietaker: row.leietaker.trim(),
          bygg: row.seksjon,
          resolvedBygg,
          fullA: 0,
          fullB: 0,
          lines: [],
          kontraktIds: new Set(),
        });
      }
      const g = leieforhold.get(key);
      if (row.kontrakt_id) g.kontraktIds.add(row.kontrakt_id);
      g.lines.push({
        eiendom: row.eiendom,
        bygg: row.seksjon,
        linjetype: row.linjetype,
        beskrivelse: row.beskrivelse,
        del,
        fullArsverdi2026: belop,
        startDato: row.start_dato || null,
        sluttDato: row.slutt_dato || null,
      });
      if (del === "A") g.fullA += belop;
      else g.fullB += belop;
    }
  }

  // Bygg leieforhold-nivå-resultater (for REMAINING-aggregatet) og grupper samtidig opp til
  // leietaker-nivå (for Redis-snapshotet - hver leietaker kan ha flere byggGrupper).
  const tenantMap = new Map(); // normalisert leietakernavn -> { navn, byggGrupper[], lines[] }
  let sumTotalDelA = 0,
    sumTotalDelB = 0;
  let countMatched = 0,
    countUnmatched = 0,
    countAvsluttet = 0,
    countOmsetning = 0,
    countKontraktsendring = 0,
    countIkkeMatchetFlagget = 0,
    countInternMustad = 0,
    countMatchedViaCoreName = 0;

  let countMatchedViaAlias = 0;
  let countMatchedViaCustomerNo = 0;
  let countUsikkerFlereKontrakter = 0;
  for (const [, g] of leieforhold) {
    const bygg = normalizeName(g.resolvedBygg || g.bygg);
    let nxt = null;

    // Primær metode (v3): kundenummer-basert ID-kobling - se v3-avsnittet i filhodet.
    const idMatch = matchViaCustomerNo(g.kontraktIds, g.resolvedBygg || g.bygg);
    if (idMatch.usikker) {
      countUsikkerFlereKontrakter++;
    } else if (idMatch.nxt) {
      nxt = idMatch.nxt;
      countMatchedViaCustomerNo++;
    }

    // Fallback-kjede (navnematching) - kun hvis ID-koblingen ikke fant noe.
    if (!nxt) nxt = nxtGroups.get(normalizeName(g.leietaker) + "||" + bygg);
    if (!nxt) {
      const resolvedName = resolveNxtTenantName(g.leietaker);
      if (resolvedName) {
        const viaCoreName = nxtGroups.get(normalizeName(resolvedName) + "||" + bygg);
        if (viaCoreName) {
          nxt = viaCoreName;
          countMatchedViaCoreName++;
        }
      }
    }
    if (!nxt) {
      const alias = FAZILE_TO_NXT_ALIASES[normalizeName(g.leietaker)];
      if (alias) {
        const viaAlias = nxtGroups.get(alias + "||" + bygg);
        if (viaAlias) {
          nxt = viaAlias;
          countMatchedViaAlias++;
        }
      }
    }
    const alleredeA = nxt ? nxt.alleredeA : 0;
    const alleredeB = nxt ? nxt.alleredeB : 0;

    const fullA = round2(g.fullA);
    const fullB = round2(g.fullB);

    // Leieforhold uten NOE å vise (ingen full-årsverdi, ingen fakturering registrert) - typisk
    // et leieforhold der ALLE linjer falt bort ved linje-nivå-ekskludering (SD-anlegg,
    // felleskost/kantine, markedsbidrag/garasje-parkering går til Del B) og det ikke finnes noen
    // reell leieinntekt igjen å spore. Morten bekreftet for Lilleaker Vest Boligsameie (kun
    // SD-anlegg + felleskost, begge allerede ekskludert på linjenivå, 2026-08-26): "skal heller
    // ikke være med i denne oversikten" - generalisert til ALLE slike tomme leieforhold (i stedet
    // for en leietaker-spesifikk unntaksliste) slik at fremtidige tilsvarende tilfeller også
    // forsvinner automatisk. Ekte avsluttede leieforhold (fakturert tidligere i år, nå 0 i full-
    // verdi) beholdes fortsatt - de har alleredeA/alleredeB > 0 og treffer ikke denne grenen.
    if (fullA === 0 && fullB === 0 && alleredeA === 0 && alleredeB === 0) continue;

    if (nxt) countMatched++;
    else countUnmatched++;
    // Del A/B-metodikken er ikke identisk på tvers av kilder (Fazile: seksjonsnavn-heuristikk,
    // NXT: accountNo) - for et gitt leieforhold representerer Fazile-siden ENTEN leie ELLER
    // parkering (aldri begge i samme leietaker+bygg-gruppe i praksis), mens NXT sin
    // accountNo-splitt av "allerede fakturert" for SAMME leieforhold noen ganger havner i det
    // andre Del-et (f.eks. en kontorleiekontrakt der NXT har bokført noe under en
    // parkeringskonto). Uten justering ga dette store, meningsløse kunstige avvik i Del A/B
    // hver for seg (f.eks. Del B endte netto negativ for hele porteføljen) selv om SUMMEN
    // (Del A + Del B) er riktig. Fiks: når leieforholdet entydig er ett Del (Fazile-siden har
    // kun full-verdi i én av delene), netter vi HELE "allerede fakturert" (begge NXT-kontoer)
    // mot akkurat det Del-et, i stedet for å la NXT sin kontosplitt lekke over i det andre.
    let gjenstarA, gjenstarB;
    const alleredeTotal = alleredeA + alleredeB;
    if (fullA > 0 && fullB === 0) {
      gjenstarA = round2(fullA - alleredeTotal);
      gjenstarB = 0;
    } else if (fullB > 0 && fullA === 0) {
      gjenstarB = round2(fullB - alleredeTotal);
      gjenstarA = 0;
    } else {
      // Begge deler 0 (uten treff-flagget) eller reelt blandet - behold per-del-subtraksjon.
      gjenstarA = round2(fullA - alleredeA);
      gjenstarB = round2(fullB - alleredeB);
    }

    let status = "ok";
    let forklaring = null;
    const kontraktAvsluttet = fullA === 0 && fullB === 0 && (alleredeA > 0 || alleredeB > 0);
    if (INTERN_MUSTAD_NAMES.has(normalizeName(g.leietaker))) {
      // Mustad Eiendom AS/Mustad Eiendomsdrift AS opptrer selv som "leietaker" i Fazile for
      // egne lokaler/administrative posteringer - ikke et reelt eksternt leieforhold. Beløpet
      // beholdes som beregnet (ingen antagelse om at det skal nulles), men flagges tydelig
      // adskilt fra ekte usikre leieforhold.
      status = "intern-mustad";
      forklaring = "Leietaker er Mustad selv (egne lokaler/administrativ postering i Fazile) - ikke et reelt eksternt leieforhold.";
      countInternMustad++;
    } else if (kontraktAvsluttet) {
      gjenstarA = 0;
      gjenstarB = 0;
      status = "avsluttet";
      forklaring =
        "Leieforholdet er avsluttet i Fazile (ingen aktiv kontrakt i dag) - allerede fakturert i NXT tidligere i år regnes som ferdig, ikke gjenstående.";
      countAvsluttet++;
    } else if (!nxt && (fullA > 0 || fullB > 0)) {
      // Ingen tilsvarende bokføring funnet i NXT i år - kan bety en ny kontrakt (ingen
      // fakturering ennå i år er reelt og forventet), ELLER en bygg-/navnematch-feil som gjør
      // at reell fakturering ikke ble funnet. Ikke skilt fra hverandre automatisk - Morten må
      // sjekke manuelt, derfor egen kategori i gjennomgangslisten.
      status = "ikke-matchet-i-nxt";
      forklaring =
        "Ingen tilsvarende bokføring funnet i NXT for dette leietaker+bygg-paret i år. Kan være en ny kontrakt (ingen fakturering ennå i 2026 er normalt), eller en bygg-/navnematch-feil mellom Fazile og NXT - se bygg-navn-alias-tabellen i scripts/build-remaining-summary.js.";
      countIkkeMatchetFlagget++;
    } else if ((gjenstarA < -100 || gjenstarB < -100) && ENGANGSGEBYR_LEIETAKERE.has(normalizeName(g.leietaker))) {
      status = "forklart-engangsgebyr";
      forklaring = ENGANGSGEBYR_LEIETAKERE.get(normalizeName(g.leietaker));
      countKontraktsendring++; // telles inn under samme "forklart"-paraply i konsollutskriften
      // Morten bekreftet 2026-08-26: nullstill "gjenstår" visuelt her (samme prinsipp som
      // "avsluttet" over) - det reelle, negative tallet er korrekt utledet (se ENGANGSGEBYR_
      // LEIETAKERE sin forklaring), men gir et misvisende "trenger handling"-inntrykk siden det
      // verken skal faktureres eller tilbakebetales noe mer her. Forklaringen forblir synlig.
      gjenstarA = 0;
      gjenstarB = 0;
    } else if ((gjenstarA < -100 || gjenstarB < -100) && OMSETNINGSLEIE_LEIETAKERE.has(normalizeName(g.leietaker))) {
      status = "forklart-omsetningsleie";
      forklaring = OMSETNINGSLEIE_LEIETAKERE.get(normalizeName(g.leietaker));
      countOmsetning++;
    } else if ((gjenstarA < -100 || gjenstarB < -100) && NXT_FEILKODING_LEIETAKERE.has(normalizeName(g.leietaker))) {
      status = "forklart-nxt-feilkoding";
      forklaring = NXT_FEILKODING_LEIETAKERE.get(normalizeName(g.leietaker));
      countKontraktsendring++; // telles inn under samme "forklart"-paraply i konsollutskriften
    } else if ((gjenstarA < -100 || gjenstarB < -100) && normalizeName(g.resolvedBygg || g.bygg) === normalizeName(CC_VEST_NXT_BYGG)) {
      status = "forklart-omsetningsleie";
      forklaring =
        "CC Vest-leieforhold: NXT har trolig bokført en omsetningsleie-/minimumsleie-avregning (periodisk 'Overført fra Fazile'-beløp) i tillegg til grunnleien - fanges ikke opp av Fazile sin kontraktslinje-baserte årsverdi (verifisert mot faktiske NXT-transaksjoner for én CC Vest-leietaker, 2026-08-24). MERK (2026-08-26): denne bygg-baserte auto-merkingen er IKKE pr.-leietaker-bekreftet - sjekket Legevakt Vest AS (en legevakt, ikke en butikk med omsetningsleie) og fant i stedet SAMME rot-årsak som 'forklart-kontraktsendring' under (en linje byttet areal/beskrivelse midt i 2026 innenfor samme kontrakt, og den gamle linjen falt ut av Fazile-uttrekket siden det kun henter det som er aktivt i dag) - reell omsetningsleie er trolig kun en delmengde av disse.";
      countOmsetning++;
    } else if (gjenstarA < -100 || gjenstarB < -100) {
      status = "forklart-kontraktsendring";
      forklaring =
        "Fazile-uttrekket vårt henter KUN kontraktslinjer som er aktive på uttrekksdatoen (rent_roll sin default aktiv_dato = i dag) - når en kontrakt er FORNYET midt i 2026 (ny kontrakt-ID, ofte samme/lignende leiesats), forsvinner den utløpte linjens del av året helt fra vårt datagrunnlag, selv om NXT korrekt har fakturert for hele perioden. 'Full 2026-verdi' blir da kunstig lav, og alt som faktisk er fakturert ser ut som et overforbruk. IKKE en reell indeksregulering/prisøkning i de fleste tilfeller - bekreftet konkret (2026-08-26) mot faktiske Fazile-kontraktshistorikker for 9 leieforhold (bedrifter + én privat leietaker - se memory/project_income-forecast-negative-gjenstar-root-cause-2026-08-26.md for detaljer, ikke navngitt her), som alle viste ny kontrakt fra samme dato til nesten identisk/EKSAKT samme sats som den utløpte. Reell fiks krever et bredere Fazile-uttrekk (kun_aktive_linjer:false / flere aktiv_dato-tidspunkt gjennom året), ikke gjort her ennå - se prosjektnotat i minnet.";
      countKontraktsendring++;
    }

    sumTotalDelA += gjenstarA;
    sumTotalDelB += gjenstarB;

    const tenantKey = normalizeName(g.leietaker);
    if (!tenantMap.has(tenantKey)) {
      tenantMap.set(tenantKey, { navn: g.leietaker, byggGrupper: [], lines: [] });
    }
    const tenant = tenantMap.get(tenantKey);
    tenant.byggGrupper.push({
      bygg: g.bygg,
      fullArsverdi2026DelA: fullA,
      fullArsverdi2026DelB: fullB,
      alleredeFakturertDelA: round2(alleredeA),
      alleredeFakturertDelB: round2(alleredeB),
      // Post-korreksjon (status-avhengig, se if/else-kjeden over) A/B-splitt av gjenstår -
      // lagres separat fra gjenstarTotal fordi Leietaker-tabellen (build-tenant-forecast-
      // table.js) trenger Del A og Del B hver for seg, og korreksjonene (avsluttet->0 osv.)
      // MÅ være bakt inn her - ikke la den nye tabellen prøve å gjenskape denne logikken.
      gjenstarDelA: round2(gjenstarA),
      gjenstarDelB: round2(gjenstarB),
      gjenstarTotal: round2(gjenstarA + gjenstarB),
      status,
      forklaring,
    });
    tenant.lines.push(...g.lines);
  }

  let oneparkKorreksjon = 0;
  const oneparkTenant = tenantMap.get(ONEPARK_LEIETAKER_KEY);
  if (oneparkTenant) {
    const alleredeFakturertOnepark = round2(
      oneparkTenant.byggGrupper.reduce((s, b) => s + b.alleredeFakturertDelA + b.alleredeFakturertDelB, 0),
    );
    oneparkKorreksjon = Math.max(0, round2(ONEPARK_ESTIMAT_2026 - alleredeFakturertOnepark));
    oneparkTenant.byggGrupper.push({
      bygg: "Onepark - parkeringsestimat 2026 (hele porteføljen, ikke bygg-fordelt)",
      fullArsverdi2026DelA: 0,
      fullArsverdi2026DelB: round2(ONEPARK_ESTIMAT_2026),
      alleredeFakturertDelA: 0,
      alleredeFakturertDelB: alleredeFakturertOnepark,
      gjenstarDelA: 0,
      gjenstarDelB: oneparkKorreksjon,
      gjenstarTotal: oneparkKorreksjon,
      status: "forklart-parkering-onepark",
      forklaring: `Onepark-parkering faktureres etter omsetningsrapport, utenfor vanlig Fazile-kontrakt (derfor "avsluttet" på de 6 byggene over). Årsestimat fra Inntektsprognose-arket: ${ONEPARK_ESTIMAT_2026.toLocaleString("nb-NO")} kr, minus allerede fakturert i NXT i år (${alleredeFakturertOnepark.toLocaleString("nb-NO")} kr) = ${oneparkKorreksjon.toLocaleString("nb-NO")} kr gjenstår. Lagt til Del B som ett samlet tillegg, ikke bygg-fordelt.`,
    });
    sumTotalDelB += oneparkKorreksjon;
  } else {
    console.log('ADVARSEL: fant ikke "Onepark AS" i leieforhold-datasettet - Onepark-korreksjonen ble IKKE lagt til.');
  }

  const tenantList = [...tenantMap.values()]
    .map((t) => {
      const fullArsverdi2026 = round2(t.byggGrupper.reduce((s, b) => s + b.fullArsverdi2026DelA + b.fullArsverdi2026DelB, 0));
      const alleredeFakturertNxt2026 = round2(
        t.byggGrupper.reduce((s, b) => s + b.alleredeFakturertDelA + b.alleredeFakturertDelB, 0),
      );
      const totalBelop = round2(t.byggGrupper.reduce((s, b) => s + b.gjenstarTotal, 0));
      return {
        navn: t.navn,
        fullArsverdi2026,
        alleredeFakturertNxt2026,
        totalBelop,
        byggGrupper: t.byggGrupper.sort((a, b) => b.gjenstarTotal - a.gjenstarTotal),
        lines: t.lines.sort((a, b) => b.fullArsverdi2026 - a.fullArsverdi2026),
      };
    })
    .sort((a, b) => b.totalBelop - a.totalBelop);

  const snapshot = {
    sistOppdatert: "2026-08-26",
    ar: 2026,
    totalBelop: round2(sumTotalDelA + sumTotalDelB),
    antallLeietakere: tenantList.length,
    tenants: tenantList,
    // Se OMSETNINGSAVREGNING_2025_KONTI-kommentaren - sporer avsetningen (avsetning, "Andre"
    // uten leietakerreferanse) og fordelingen til reelle leietakere separat, i stedet for å la
    // begge forsvinne stille når konto 3632 ekskluderes fra leietakernes 2026-gjenstår. Begge
    // tallene er lest direkte fra samme ferske NXT-uttrekk som resten av scriptet - ingen
    // hardkodet konstant å huske å oppdatere ved neste kjøring.
    omsetningsavregning2025: {
      avsetning: sumOmsetningsavregning2025Avsetning,
      fordeltPerLeietaker: sumOmsetningsavregning2025Fordelt,
      nettoEffekt2026: round2(sumOmsetningsavregning2025Avsetning + sumOmsetningsavregning2025Fordelt),
    },
  };

  console.log(`Leieforhold: ${leieforhold.size} (matchet=${countMatched}, ikke matchet=${countUnmatched})`);
  console.log(`  hvorav matchet via kundenummer-ID (primær metode, v3): ${countMatchedViaCustomerNo}`);
  console.log(`  hvorav matchet via kjerne-navn-fallback (stavevariant AS/A/S osv.): ${countMatchedViaCoreName}`);
  console.log(`  hvorav matchet via FAZILE_TO_NXT_ALIASES (suffiks/kortnavn NXT mangler): ${countMatchedViaAlias}`);
  console.log(`  hvorav USIKKER (flere kontrakter med ulikt nxtCustomerNo - falt tilbake til navnematching): ${countUsikkerFlereKontrakter}`);
  console.log(`Avsluttede kontrakter nullstilt: ${countAvsluttet}`);
  console.log(`Intern Mustad (ikke reelt leieforhold): ${countInternMustad}`);
  console.log(`Flagget "ikke matchet i NXT" (ny kontrakt eller navnematch-feil - sjekk manuelt): ${countIkkeMatchetFlagget}`);
  console.log(`Forklart omsetningsleie (CC Vest): ${countOmsetning}`);
  console.log(`Forklart kontraktsendring/indeksregulering: ${countKontraktsendring}`);
  console.log(`Onepark-parkeringskorreksjon lagt til Del B: ${oneparkKorreksjon.toLocaleString("nb-NO")} kr`);
  console.log(
    `Omsetningsavregning 2025 (konto 3632) ekskludert fra leietaker-gjenstår: avsetning/reversering (Andre, ingen leietakerreferanse) ${sumOmsetningsavregning2025Avsetning.toLocaleString("nb-NO")} kr, fordelt til reelle leietakere ${sumOmsetningsavregning2025Fordelt.toLocaleString("nb-NO")} kr, nettoeffekt på 2026-bokføringen ${round2(sumOmsetningsavregning2025Avsetning + sumOmsetningsavregning2025Fordelt).toLocaleString("nb-NO")} kr.`,
  );
  console.log(`REMAINING-aggregat (lim inn i lib/incomeForecast.local.ts/.anon.ts):`);
  console.log(`  totalDelA: ${round2(sumTotalDelA)},`);
  console.log(`  totalDelB: ${round2(sumTotalDelB)},`);
  console.log(`  antallLeieforhold: ${leieforhold.size},`);
  console.log(`  antallIkkeMatchetFlagget: ${countIkkeMatchetFlagget},`);
  console.log(`  antallForklartOmsetningsleie: ${countOmsetning},`);
  console.log(`  antallForklartKontraktsendring: ${countKontraktsendring},`);
  console.log(`  antallAvsluttetNullstilt: ${countAvsluttet},`);
  console.log(`  antallInternMustad: ${countInternMustad},`);
  console.log(`Redis-snapshot: ${tenantList.length} leietakere, totalt ${snapshot.totalBelop} kr`);

  return pushToRedis(REDIS_HASH_KEY, REDIS_FIELD, snapshot, "remaining-tenants-snapshot.json");
}

main();
