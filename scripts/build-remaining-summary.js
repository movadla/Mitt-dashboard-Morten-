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
// v13 (2026-09-04, Morten: "Bytt til å hente invoice_lines i tillegg til å se 3630 og 3632
// sammen") - FAZILE-FAKTURAPLAN SOM GJENSTÅR-KILDE + 3630/3632-PARING:
//  A) Gjenstår pr. leieforhold = Fazile sin FAKTISKE fakturaplan for resten av 2026 (invoice_lines
//     på fakturaer som ikke er sendt til NXT pr. NXT-cachedatoen, alle linjetyper, konto via
//     invoice_line_account, kun 36xx unntatt 3632), IKKE lenger "årsverdi minus bokført". Q4-
//     kontrollen 2026-09-04 viste at årsverdi-modellen bommet med -12,9 mill kr på porteføljen
//     fordi den (1) manglet DISCOUNT-/CUSTOM-linjer (leiefritak, rabatt, investeringsleie),
//     (2) brukte dagens linjeverdi for hele året ved trappetrinn/indeks midt i året, (3) tolket
//     manuelle kreditnotaer i NXT som "ikke fakturert ennå", (4) ikke fanget at Fazile fakturerte
//     over/under kontraktslinjen (justert a-konto minimumsleie), og (5) ikke visste om kontrakter
//     opprettet etter siste rent_roll-uttrekk. Fakturaplanen fanger alt dette direkte. Modellens
//     tall beholdes som sammenligning (modellGjenstarTotal + avvik i forklaringen). Leieforhold
//     med modell-gjenstår > 5 000 kr men UTEN planlagt Fazile-faktura beholder modelltallet med
//     status "fazile-plan-mangler" (Morten må avgjøre: kontrakt ikke aktivert / fakturering
//     stoppet / reelt ikke mer å fakturere). Datakilde: refresh-data/fazile-fakturaplan/
//     (invoices/lines/line-accounts/contracts/meta.json). Onepark holdes utenfor (manuelt estimat).
//     To kjente hull i planen dekkes i koden: (i) Fazile genererer MÅNEDSfakturaer bare ~3 mnd
//     frem (pr. september mangler desember for alle månedsfakturerte, typisk CC Vest-butikker) -
//     siste planlagte måned videreføres til årsslutt/linjens slutt_dato, merket "ekstrapolert";
//     (ii) "Investeringsleie" ligger på 3900 i Fazile men bokføres på 3600 i NXT (verifisert mot
//     kvartalsposteringen) - reklassifiseres til 3600.
//     KJENT SVAKHET: overlegget er pr. leieforhold - har Fazile plan for én linje men ikke en
//     annen (ny kontrakt uten genererte fakturaer ved siden av en aktiv), overstyres modellen
//     likevel. Slike linjer (aktive etter inneværende kvartal, årsleie > 0, ingen planlinje)
//     listes i konsollen og merkes i leieforholdets forklaring, men legges IKKE til beløpet.
//  B) Kreditnotaer for 2025-omsetningsavregningen bokføres på 3630 (minimumsleie), IKKE 3632 -
//     mens selve avregningen ligger på 3632 og ekskluderes. Kreditnotaen alene reduserte da
//     "allerede fakturert" og ga for HØYT gjenstår (fem leietakere, 1,21 mill kr). En ren
//     sammenslåing av 3630+3632 er IKKE trygg: 3630 har 29 positive 2026-posteringer, og de fleste
//     er ekte 2026-korreksjoner (Fenistra-kreditnotaer i jan/mars, feilfakturering rettet innenfor
//     samme bilag) - kun 5 er kryss-konto-motposter til en 3632-avregning (samme kundenr, eksakt
//     samme beløp) + to 2024-avregninger med "avregning" i bilagsteksten. Derfor PARING: en positiv
//     3630-postering nøytraliseres (legges tilbake i fakturert) når beløpet eksakt matcher en
//     3632-postering for samme kundenummer, eller teksten inneholder "vregning". Datakilde:
//     refresh-data/nxt-3630-3632-detalj/<companyNo>.json (transaksjonsnivå, kun disse to kontoene).
//
// Kjør: node scripts/build-remaining-summary.js

const fs = require("fs");
const path = require("path");

const FAZILE_DIR = path.join(__dirname, "refresh-data", "fazile-remaining-tenants");
// v13 - Fazile sin fakturaplan (ikke-sendte fakturaer for resten av året) og NXT-transaksjonsdetalj
// for konto 3630/3632. Begge mapper er gitignored (scripts/refresh-data/*/), som resten av rådataene.
const FAZILE_FAKTURAPLAN_DIR = path.join(__dirname, "refresh-data", "fazile-fakturaplan");
const NXT_3630_3632_DIR = path.join(__dirname, "refresh-data", "nxt-3630-3632-detalj");
// Fazile account.a_id -> kontokode (accounts-tabellen, verifisert 2026-09-03/04). Kun 36xx brukes
// i fakturaplanen, resten er med for fullstendighet/feilsøking.
const FAZILE_A_ID_TIL_KONTO = {
  19944: 3000, 19977: 3010, 19978: 3020, 19980: 3030, 19981: 3031, 19982: 3040, 19984: 3100, 25027: 3033,
  20013: 3600, 20016: 3601, 20307: 3610, 20308: 3611, 20342: 3620, 20346: 3621, 20343: 3630, 20347: 3631,
  20348: 3632, 20406: 3635, 20076: 3640, 20077: 3641, 20349: 3650, 20350: 3651, 20439: 3658, 20014: 3690,
  20015: 3691, 20341: 3092, 20351: 3900, 20352: 3901, 20835: 3900, 20353: 3910, 20354: 3911,
};
// Delt-eide eiendommer (50 %): Fazile fakturerer leietakeren 100 %, men Mustads andel - og NXT-
// bokføringen i nxt-booked-tenants/ (eierandel-halvert, se refresh-nxt-booked-tenants.js) - er
// halvparten. rent_roll halverer selv Strandveien 10/LV20-22 (men ikke 4-8, se
// STRANDVEIEN_4_8_MANUAL_HALVING); rå invoice_lines må halveres for alle tre.
const FAKTURAPLAN_HALVERES_EIENDOM = new Set(["Strandveien 4-8_E", "Strandveien  4-8_E", "Strandveien 10_E", "Lilleakerveien 20-22_E"]);
const FAKTURAPLAN_MANGLER_GRENSE = 5000; // kr - under dette nullstilles modelltallet stille når Fazile ikke har noen faktura igjen
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
  // Funnet 2026-08-30 under "ikke-matchet-i-nxt"-gjennomgangen (Morten: "Tror de bare
  // faktureres under samme bygg som parkeringbygget") - bekreftet for to konkrete leieforhold
  // ved nesten eksakt kronebeløp-match: NXT har IKKE en egen bygg-kode for disse små
  // parkerings-/uteareal-seksjonene i det hele tatt (ingen leietaker har noen postering der),
  // men fakturerer i stedet parkeringen under hovedbyggets egen kode (konto 3640/41/42).
  "lilleakerveien 6 uteparkering": "(Ikke bruk) Uteområde Sør", // Veidekke: 55 032 vs. forventet 55 031,59
  "strandveien uteparkering": "Strandveien 10", // Vedeld: 19 924,03 vs. forventet 20 118,72 (liten rest, trolig delvis år)
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

// Funnet 2026-08-30 under gjennomgangen av "ikke-matchet-i-nxt"-leieforhold (Morten: "Hva sier
// terminer? ... men årsbeløpet bør være fakturert i så fall") - sjekket direkte mot Fazile sin
// `invoice`-tabell OG `contract_line.first_invoice_date`/`prev_invoice_start_date`/
// `next_invoice_start_date` for å avgjøre om dette var "allerede fullt forhåndsfakturert, neste
// faktura for NESTE periode" (i så fall ingen endring nødvendig) eller "aldri fakturert i det
// hele tatt" (i så fall en reell metodikkfeil - vår modell sjekker kun start_date/end_date, ikke
// first_invoice_date). Bekreftet for Sporveien Trikken AS: `invoices`-tabellen har NULL fakturaer
// noensinne for kontrakten (aktiv siden 2024-01-01), `prev_invoice_start_date: null`,
// `next_invoice_start_date: "2027-01-01"`, årlig frekvens - altså faktisk aldri fakturert, ikke et
// forhåndsbetalt år. Strukturelt umulig at dette treffer 36-kontiene i 2026. Lysakerelva
// Fiskeforening har samme mønster (first_invoice_date 2027 + tung rabattperiode) men er IKKE
// like presist bekreftet med egen fakturasjekk - antatt identisk årsak gitt lavt beløp.
const FAKTURERING_UTSATT_TIL_SENERE_AR = new Map([
  [
    "sporveien trikken as",
    "Kontraktslinjen «Leie Vendesløyfe» (kontrakt 82278, aktiv siden 2024-01-01) har first_invoice_date=2027-01-01 i Fazile - bekreftet direkte mot invoice-tabellen: NULL fakturaer sendt noensinne, next_invoice_start_date=2027-01-01, årlig frekvens. Faktureringen er strukturelt utsatt til 2027 - telles derfor ikke som gjenstår i 2026, uavhengig av at kontrakten har vært juridisk aktiv siden 2024.",
  ],
  [
    "lysakerelva fiskeforening",
    "Samme mønster som Sporveien Trikken (first_invoice_date=2027-01-01, i tillegg en tung rabattperiode fram til 2026-09-30) - antatt samme strukturelt utsatte fakturering, ikke individuelt bekreftet mot invoice-tabellen pga. lavt beløp.",
  ],
]);

// Kontrakten er ikke signert/ferdigstilt i Fazile ennå (status DRAFT) - ikke en bekreftet
// leieforpliktelse, bør derfor ikke telles som gjenstår før den er ferdigstilt. Funnet 2026-08-30
// under samme "ikke-matchet-i-nxt"-gjennomgang som FAKTURERING_UTSATT_TIL_SENERE_AR over.
const DRAFT_KONTRAKT_LEIETAKERE = new Map([
  [
    "food folk norge a/s||lilleakerveien 14 uteparkering",
    "Kontrakten (id 93590, «Parkering avg.pl», 26 000 kr/år) har status DRAFT i Fazile, ikke signert/aktiv - ikke en bekreftet leieforpliktelse ennå.",
  ],
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
// Kjente tilfeller der en NY leietaker overtok et areal fra en ANNEN, nå forsvunnet leietaker
// midt i 2026 (selskaps-fusjon), og NXT-posteringene for perioden FØR overtakelsen ligger under
// DEN GAMLE leietakerens kundenummer - reelt mottatt, men usynlig for den NYE leietakerens
// gjenstår-beregning siden det gamle kundenummeret ikke lenger finnes som egen Fazile-leietaker.
// Nøkkel er leietaker+bygg (IKKE bare leietaker-navn som listene under) siden andre bygg for
// samme leietaker ikke skal påvirkes. Krediterer `alleredeFakturertDelA` og trekker tilsvarende
// fra `gjenstarDelA` - eksakt beløp verifisert direkte mot NXT sine posteringer (2026-08-29, se
// project_income-forecast-controller-audit-2026-08-29.md i minnet).
const HISTORISK_KUNDENUMMER_KORREKSJON = new Map([
  [
    "norconsult norge as||lilleakerveien 4a",
    {
      belopA: 3085104.24,
      forklaring:
        "Norconsult Norge AS overtok denne leien fra Dr. Ing. A. Aas-Jakobsen AS (NXT-kundenr. 11134) og Geovita AS (kundenr. 10455) rundt mai 2026. Januar-april-leien (2 797 254,78 + 287 849,46 = 3 085 104,24 kr) ble reelt betalt og bokført i NXT, men under de gamle kundenumrene - Norconsult sitt eget kundenummer (10619) har 0 kr postert i Lilleakerveien 4A før 01.05.2026 (bekreftet direkte mot NXT generalLedgerTransaction, 2026-08-29). Kreditert her siden Aas-Jakobsen/Geovita ikke lenger finnes som egne Fazile-leietakere å attribuere beløpet til.",
    },
  ],
  // v11 (2026-09-03) - samme prinsipp som over, men for PARKERING (Del B). Aas-Jakobsen og
  // Geovita sine gamle kundenumre (11134/10455) hadde EGNE, separate garasje-/parkeringsposteringer
  // i 2026 - usynlige for Norconsult sin Del B-gjenstår siden HISTORISK_KUNDENUMMER_KORREKSJON
  // over kun dekket Del A da den ble laget. Beløp verifisert direkte mot NXT
  // generalLedgerTransaction (customerNo 11134/10455), inkl. duplikat-/reverseringsposteringer i
  // periode 5 nettet ut.
  [
    "norconsult norge as||lilleakerveien 10",
    {
      belopB: 472303.55,
      forklaring:
        "Aas-Jakobsen (kundenr. 11134, 402 787,58 kr) og Geovita (kundenr. 10455, 69 515,97 kr) sin garasjeleie i Lilleakerveien 10, bokført under de gamle kundenumrene i 2026 - usynlig for Norconsult sin egen Del B-gjenstår. Samme mønster/årsak som Del A-korreksjonen over.",
    },
  ],
  [
    "norconsult norge as||lilleakerveien 4a uteparkering",
    {
      belopB: 53627.92,
      forklaring:
        "Aas-Jakobsen (kundenr. 11134) sin parkeringsleie i Lilleakerveien 4A Uteparkering, bokført under det gamle kundenummeret i 2026 - usynlig for Norconsult sin egen Del B-gjenstår. Samme mønster/årsak som Del A-korreksjonen over.",
    },
  ],
]);

// v12 (2026-09-03): DEL_A_INNEHOLDER_PARKERING_NOTAT (PGS 688 543 kr bevisst i Del A) er FJERNET -
// Morten snudde samme dag ("parkering må inneholde alt som er på parkeringskontoer uavhengig av
// bygg"), så beløpet ligger nå i Del B via den kundenummer-brede poolen (se v12-blokken).

// Kontraktslinjer som eksisterer reelt i Fazile, men som IKKE plukkes opp av rent_roll-uttrekket
// vårt av årsaker et bredere historisk uttrekk ikke løser - funnet 2026-08-29 ("grundig
// gjennomgang av alle leieforhold under budsjett"). MERK: Erco Lighting sin tilsvarende
// korreksjon (FA0929-fornyelsen) er FJERNET herfra igjen (2026-08-29, samme dag) - den er nå
// dekket naturlig av den fullstendige 12-måneders historiske rent_roll-hentingen (se
// scripts/refresh-data/fazile-remaining-tenants/meta.json), og ville dobbelttalt okt-des-verdien
// om den ble stående. Head Norway sin CUSTOM-linje-korreksjon under er IKKE påvirket av den
// historiske hentingen (CUSTOM-typen filtreres bort av rent_roll UANSETT hvilken aktiv_dato som
// brukes - ikke et tidspunkt-problem), og forblir derfor nødvendig.
//  - Head Norway AS: en aktiv, reelt fakturert kontraktslinje ("Wifi first avg.pl.") er type=
//    CUSTOM i Fazile, ikke RENT - faller derfor utenfor rent_roll sitt standard linjetype-filter
//    selv om den er en ordinær, løpende del av kjerneleien. Både `fullABelop` OG `alleredeABelop`
//    (samme beløp, bekreftet identisk mot NXT konto 3100) - ingen effekt på gjenstår, kun på
//    fakturert/avvik.
// Legges til BEGGE i g.fullA/alleredeA rett før gjenstår/avvik-utregningen, se anvendelsen der.
const MANGLENDE_LINJE_KORREKSJON = new Map([
  [
    "head norway as||vollsveien 13h",
    {
      fullABelop: 50782.76,
      alleredeABelop: 50782.76,
      forklaring:
        "Kontraktslinjen «Wifi first avg.pl.» (50 782,76 kr/år, del av kontrakt GL6409) er type=CUSTOM i Fazile, ikke RENT - faller derfor utenfor rent_roll-uttrekkets standard linjetype-filter selv om den er en ordinær, aktivt fakturert del av kjerneleien (bekreftet mot NXT konto 3100, kvartalsvis ca. 12 696 kr, kundenr. 10825, 2026-08-29).",
    },
  ],
  // De to under ble funnet 2026-08-30 under en fullstendig gjennomgang av "gjenstår å fakturere"
  // (Morten: "Få enda sikrere tall" - se project_income-forecast-gjenstar-topplevel-audit-2026-08-30
  // i minnet for full metode). Samme rotårsak som Head Norway over (type=CUSTOM i Fazile, faller
  // utenfor rent_roll sitt RENT-only-filter) - bekreftet direkte mot Fazile sin contract_line-
  // tabell via fazile_graphql_query (ikke bare antatt fra en agentrapport).
  [
    "kletor as||lilleakerveien 10",
    {
      fullABelop: 10350.62,
      alleredeABelop: 0,
      forklaring:
        "Kontraktslinjen «Ladestasjon avg.fritt 2 pl» (cl_id 169192, 15 423 kr/år, 2026-05-01–2028-03-31, del av kontrakt 82119) er type=CUSTOM i Fazile, ikke RENT - faller utenfor rent_roll-uttrekkets standard linjetype-filter. Beløpet er proratert for 245 dager i 2026 (01.05–31.12). Ingen kjent NXT-fakturering funnet for denne spesifikke linjen ennå (alleredeABelop=0) - hele beløpet telles derfor som gjenstår.",
    },
  ],
  [
    "moss maritime as||vollsveien 17",
    {
      fullBBelop: 497371,
      alleredeBBelop: 0,
      forklaring:
        "Kontraktslinjen «Garasje avg.pl. 25 pl fri-flyt» (cl_id 166633, 497 371 kr/år, aktiv hele 2026, del av kontrakt 82312) er type=CUSTOM i Fazile, ikke RENT - faller utenfor rent_roll-uttrekkets standard linjetype-filter. Ingen kjent NXT-fakturering funnet for denne spesifikke linjen ennå (alleredeBBelop=0) - hele beløpet telles derfor som gjenstår. Del B (garasje).",
    },
  ],
]);

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
      if (!nxtGroups.has(key)) nxtGroups.set(key, { alleredeA: 0, alleredeB: 0, kontoerA: new Map(), kontoerB: new Map() });
      const g = nxtGroups.get(key);
      const erParkeringsbygg = PARKERING_LINJE_REGEX.test(l.bygg || "");
      const kontoMap = [3640, 3641, 3642].includes(l.accountNo) || erParkeringsbygg ? g.kontoerB : g.kontoerA;
      kontoMap.set(l.accountNo, round2((kontoMap.get(l.accountNo) || 0) + l.belop));
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
  // v12 (2026-09-03): normalisert bygg-navn -> Set(selskap). Var tidligere Map<bygg, ETT selskap>
  // ("siste fil vinner") - men samme bygg-navn finnes i FLERE NXT-selskap ("Lilleakerveien 14" og
  // "Lilleakerveien 14 Uteparkering" i både Mustad Eiendom AS og Lilleakerveien 14 AS,
  // "Lilleakerveien 20" i Mustad Eiendom AS og Fåbro, "Arnstein Arnebergs vei 4" i Mustad Eiendom
  // AS og Mustadboliger). Mustad Eiendom AS fakturerer reelt parkeringsplasser på SIN
  // "Lilleakerveien 14 Uteparkering"-kode, men oppslaget landet alltid i Lilleakerveien 14 AS
  // (263 004 kr Del B-bokføring for 13 leietakere ble aldri funnet - se Q4-revisjonen
  // 2026-09-03 i minnet). Nå slås ALLE selskap med bygg-navnet opp og summeres.
  const byggSelskaper = new Map();
  const nxtGroupsByCustomerNo = new Map(); // "selskap||customerNo||bygg" -> { alleredeA, alleredeB }
  const nxtCompaniesByNo = new Map(); // companyNo (filnavn) -> rå selskapsfil (buildings/tenantNames) - brukes av v13 3630-paringen
  let nxtCacheDato = null; // sistOppdatert for NXT-cachen - grensen for "allerede i NXT" i v13
  if (fs.existsSync(FAZILE_KONTRAKT_CROSSWALK_FILE) && fs.existsSync(NXT_BOOKED_TENANTS_DIR)) {
    kontraktCrosswalk = JSON.parse(fs.readFileSync(FAZILE_KONTRAKT_CROSSWALK_FILE, "utf8")).kontraktIdTilNxtCustomerNo || {};
    const nxtMetaFile = path.join(NXT_BOOKED_TENANTS_DIR, "meta.json");
    if (fs.existsSync(nxtMetaFile)) nxtCacheDato = JSON.parse(fs.readFileSync(nxtMetaFile, "utf8")).sistOppdatert || null;
    const companyFiles = fs.readdirSync(NXT_BOOKED_TENANTS_DIR).filter((f) => f.endsWith(".json") && f !== "meta.json");
    for (const file of companyFiles) {
      const company = JSON.parse(fs.readFileSync(path.join(NXT_BOOKED_TENANTS_DIR, file), "utf8"));
      nxtCompaniesByNo.set(path.basename(file, ".json"), company);
      for (const bygg of Object.values(company.buildings)) {
        const nb = normalizeName(bygg);
        if (!byggSelskaper.has(nb)) byggSelskaper.set(nb, new Set());
        byggSelskaper.get(nb).add(company.selskap);
      }
      for (const l of company.lines) {
        if (OMSETNINGSAVREGNING_2025_KONTI.has(l.accountNo)) continue; // se OMSETNINGSAVREGNING_2025_KONTI-kommentaren over
        let bygg = company.buildings[String(l.orgUnit3)];
        if (!bygg) continue;
        bygg = BYGG_UNDERBYGG_TIL_HOVEDBYGG.get(bygg) || bygg;
        const key = company.selskap + "||" + l.customerNo + "||" + normalizeName(bygg);
        if (!nxtGroupsByCustomerNo.has(key)) nxtGroupsByCustomerNo.set(key, { alleredeA: 0, alleredeB: 0, kontoerA: new Map(), kontoerB: new Map() });
        const g = nxtGroupsByCustomerNo.get(key);
        const belop = -l.belop; // sign-flip, samme konvensjon som resten av scriptet
        const erParkeringsbygg = PARKERING_LINJE_REGEX.test(bygg || "");
        const kontoMap = [3640, 3641, 3642].includes(l.accountNo) || erParkeringsbygg ? g.kontoerB : g.kontoerA;
        kontoMap.set(l.accountNo, round2((kontoMap.get(l.accountNo) || 0) + belop));
        if ([3640, 3641, 3642].includes(l.accountNo) || erParkeringsbygg) g.alleredeB = round2(g.alleredeB + belop);
        else g.alleredeA = round2(g.alleredeA + belop);
      }
    }
  } else {
    console.log("ADVARSEL: fant ikke crosswalk-fil og/eller nxt-booked-tenants/-mappen - ID-basert matching hoppes over, kun navnematching brukes.");
  }

  // v13 B) 3630/3632-PARING - se filhodet. Kreditnotaen for en 2025-omsetningsavregning (positiv
  // 3630-postering) legges TILBAKE i "allerede fakturert" for kundenummeret/bygget når den matcher
  // en 3632-postering eksakt (samme kundenr, samme absoluttbeløp - hvert 3632-beløp brukes maks én
  // gang) eller har "vregning" i bilagsteksten. Posteringer etter NXT-cachedatoen ignoreres (de er
  // ikke i nxt-booked-tenants/ heller). Påføres BÅDE kundenummer-gruppene (primær) og de
  // navnebaserte gruppene (fallback), som egen synlig "konto"-linje i drilldownen.
  const AVREGNING_3630_KONTO_LABEL = "3630 (kreditnota omsetningsavregning 2025, nøytralisert)";
  let sumAvregning3630Noytralisert = 0;
  let countAvregning3630Noytralisert = 0;
  if (fs.existsSync(NXT_3630_3632_DIR) && nxtCompaniesByNo.size > 0) {
    const alleTx = [];
    for (const file of fs.readdirSync(NXT_3630_3632_DIR).filter((f) => f.endsWith(".json") && f !== "meta.json")) {
      const d = JSON.parse(fs.readFileSync(path.join(NXT_3630_3632_DIR, file), "utf8"));
      for (const tx of d.transaksjoner) {
        if (nxtCacheDato && tx.voucherDate > nxtCacheDato) continue;
        alleTx.push({ ...tx, companyNo: String(d.companyNo) });
      }
    }
    const avregningBelopPrKunde = new Map(); // customerNo -> [absoluttbeløp på 3632, ikke brukt ennå]
    for (const tx of alleTx) {
      if (tx.accountNo !== 3632 || tx.customerNo === 0) continue;
      if (!avregningBelopPrKunde.has(tx.customerNo)) avregningBelopPrKunde.set(tx.customerNo, []);
      avregningBelopPrKunde.get(tx.customerNo).push(round2(Math.abs(tx.belop)));
    }
    for (const tx of alleTx) {
      if (tx.accountNo !== 3630 || tx.belop <= 0) continue;
      const abs = round2(tx.belop);
      const liste = avregningBelopPrKunde.get(tx.customerNo) || [];
      const idx = liste.indexOf(abs);
      const erAvregningTekst = /vregning/i.test(tx.text || "");
      if (idx < 0 && !erAvregningTekst) continue; // ekte 2026-korreksjon, skal fortsatt redusere fakturert
      if (idx >= 0) liste.splice(idx, 1);
      const company = nxtCompaniesByNo.get(tx.companyNo);
      if (!company) continue;
      let bygg = company.buildings[String(tx.orgUnit3)];
      if (!bygg) continue;
      bygg = BYGG_UNDERBYGG_TIL_HOVEDBYGG.get(bygg) || bygg;
      const erParkeringsbygg = PARKERING_LINJE_REGEX.test(bygg);
      const leggTil = (g) => {
        const kontoMap = erParkeringsbygg ? g.kontoerB : g.kontoerA;
        kontoMap.set(AVREGNING_3630_KONTO_LABEL, round2((kontoMap.get(AVREGNING_3630_KONTO_LABEL) || 0) + abs));
        if (erParkeringsbygg) g.alleredeB = round2(g.alleredeB + abs);
        else g.alleredeA = round2(g.alleredeA + abs);
      };
      const key = company.selskap + "||" + tx.customerNo + "||" + normalizeName(bygg);
      if (!nxtGroupsByCustomerNo.has(key)) nxtGroupsByCustomerNo.set(key, { alleredeA: 0, alleredeB: 0, kontoerA: new Map(), kontoerB: new Map() });
      leggTil(nxtGroupsByCustomerNo.get(key));
      const navn = company.tenantNames[String(tx.customerNo)];
      const navneGruppe = navn ? nxtGroups.get(normalizeName(navn) + "||" + normalizeName(bygg)) : null;
      if (navneGruppe) leggTil(navneGruppe);
      sumAvregning3630Noytralisert = round2(sumAvregning3630Noytralisert + abs);
      countAvregning3630Noytralisert++;
    }
  } else {
    console.log("ADVARSEL: fant ikke nxt-3630-3632-detalj/ - 3630-kreditnotaer for 2025-avregningen nøytraliseres IKKE (gjenstår blir for høyt for berørte leietakere).");
  }
  // Slår opp NXT-bokføring for et leieforhold via kontrakt_id -> customerNo -> selskap+bygg.
  // Returnerer null (ikke funnet/usikkert) i stedet for å kaste - kalleren faller da tilbake til
  // navnematching. "usikker" (flere ulike customerNo på samme leieforhold) logges eksplisitt.
  // Returnerer også `byggKeys` (alle "selskap||customerNo||bygg"-nøkler som ble slått sammen) -
  // brukes av v12-poolingen under til å holde avsluttede leieforholds bokføring utenfor poolen.
  function matchViaCustomerNo(kontraktIds, bygg) {
    const tom = { nxt: null, usikker: false, customerNo: null, byggKeys: [] };
    const customerNos = new Set();
    for (const kid of kontraktIds) {
      const no = kontraktCrosswalk[kid];
      if (no) customerNos.add(no);
    }
    if (customerNos.size === 0) return tom;
    if (customerNos.size > 1) return { ...tom, usikker: true }; // motstridende kontrakter - IKKE stol på noen av dem
    const customerNo = [...customerNos][0];
    const selskaper = byggSelskaper.get(normalizeName(bygg));
    if (!selskaper) return { ...tom, customerNo }; // bygg finnes ikke i noe NXT-selskap sin buildings-liste
    let nxt = null;
    const byggKeys = [];
    for (const selskap of selskaper) {
      const key = selskap + "||" + customerNo + "||" + normalizeName(bygg);
      const g = nxtGroupsByCustomerNo.get(key);
      if (!g) continue;
      byggKeys.push(key);
      if (!nxt) {
        nxt = { alleredeA: g.alleredeA, alleredeB: g.alleredeB, kontoerA: new Map(g.kontoerA), kontoerB: new Map(g.kontoerB) };
      } else {
        // Samme bygg-navn i to selskap for samme kunde (f.eks. Mustad Eiendom AS + Lilleakerveien
        // 14 AS på "Lilleakerveien 14") - summeres, ikke "siste vinner".
        nxt.alleredeA = round2(nxt.alleredeA + g.alleredeA);
        nxt.alleredeB = round2(nxt.alleredeB + g.alleredeB);
        for (const [k, v] of g.kontoerA) nxt.kontoerA.set(k, round2((nxt.kontoerA.get(k) || 0) + v));
        for (const [k, v] of g.kontoerB) nxt.kontoerB.set(k, round2((nxt.kontoerB.get(k) || 0) + v));
      }
    }
    return { nxt, usikker: false, customerNo, byggKeys };
  }

  // v12 (2026-09-03) - ALL Del B-bokføring (parkeringskonto 3640-3642, eller ikke-parkeringskonto
  // på en parkeringsbygg-kode) for ett kundenummer, på tvers av ALLE bygg-koder og ALLE selskap.
  // Morten: "Parkering må inneholde alt som er på parkeringskontoer uavhengig av bygg." Erstatter
  // v11 sin selskaps-begrensede nxtDelBTotalForCustomer() + reneDelB/_delBMixedByggKeys-
  // mekanikk, som (a) ikke fant Mustad Eiendom AS sine posteringer på bygg-navn som også finnes
  // i et annet selskap, (b) dobbelttalte når en ren parkeringsgruppe hadde en liten Del A-
  // postering, og (c) lot et parkeringskvartal bokført på hovedbygg-koden bli nettet i Del A.
  // `excludeByggKeys`: nøkler som tilhører AVSLUTTEDE leieforhold (deres bokføring er allerede
  // "ferdig", skal ikke nettes mot aktive linjer).
  function nxtDelBPoolForCustomer(customerNo, excludeByggKeys) {
    let sum = 0;
    const kontoer = new Map();
    for (const [key, g] of nxtGroupsByCustomerNo) {
      const deler = key.split("||");
      if (deler[1] !== String(customerNo)) continue;
      if (excludeByggKeys && excludeByggKeys.has(key)) continue;
      sum += g.alleredeB;
      for (const [k, v] of g.kontoerB) kontoer.set(k, round2((kontoer.get(k) || 0) + v));
    }
    return { sum: round2(sum), kontoer };
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
  // v13 - ALLE rent_roll-rader (også de som ekskluderes under) - fakturaplanen slår opp
  // kontraktslinje-id/kontrakt-id her for å finne leieforholdet; konto avgjør om linjen teller.
  const alleFazileRader = [];

  for (const file of files) {
    const rows = JSON.parse(fs.readFileSync(path.join(FAZILE_DIR, file), "utf8"));
    for (const row of rows) {
      alleFazileRader.push(row);
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
    countFaktureringUtsatt = 0,
    countDraftKontrakt = 0,
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
    let alleredeA = nxt ? nxt.alleredeA : 0;
    let alleredeB = nxt ? nxt.alleredeB : 0;
    // Klones (ikke referert direkte) siden HISTORISK_KUNDENUMMER_KORREKSJON/
    // MANGLENDE_LINJE_KORREKSJON under legger til synteiske konto-oppføringer her - må ikke
    // mutere den delte nxt-gruppen (samme selskap||customerNo||bygg-nøkkel kan i prinsippet bli
    // slått opp av mer enn ett leieforhold).
    const kontoerA = new Map(nxt ? nxt.kontoerA : []);
    const kontoerB = new Map(nxt ? nxt.kontoerB : []);

    let fullA = round2(g.fullA);
    let fullB = round2(g.fullB);

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
    // Historisk kundenummer-kreditering (se HISTORISK_KUNDENUMMER_KORREKSJON over) - påføres FØR
    // gjenstår-utregningen under, slik at korreksjonen flyter naturlig gjennom samme formel i
    // stedet for å justere gjenstår i etterkant.
    const historiskNokkel = normalizeName(g.leietaker) + "||" + normalizeName(g.resolvedBygg || g.bygg);
    const historiskOvertakelse = HISTORISK_KUNDENUMMER_KORREKSJON.get(historiskNokkel);
    if (historiskOvertakelse) {
      if (historiskOvertakelse.belopA) {
        alleredeA = round2(alleredeA + historiskOvertakelse.belopA);
        // Syntetisk "konto" (ikke en ekte NXT-kontokode) - vises i drilldownen slik at fakturert-
        // summen der stemmer overens med totalen, i stedet for å bare forsvinne stille.
        kontoerA.set("Overtatt fra gammelt kundenummer", round2((kontoerA.get("Overtatt fra gammelt kundenummer") || 0) + historiskOvertakelse.belopA));
      }
      if (historiskOvertakelse.belopB) {
        alleredeB = round2(alleredeB + historiskOvertakelse.belopB);
        kontoerB.set("Overtatt fra gammelt kundenummer", round2((kontoerB.get("Overtatt fra gammelt kundenummer") || 0) + historiskOvertakelse.belopB));
      }
    }

    // Manglende-linje-kreditering (se MANGLENDE_LINJE_KORREKSJON over) - samme prinsipp som
    // historisk kundenummer-krediteringen over, påføres FØR gjenstår-utregningen.
    const manglendeLinje = MANGLENDE_LINJE_KORREKSJON.get(historiskNokkel);
    if (manglendeLinje) {
      if (manglendeLinje.fullABelop) fullA = round2(fullA + manglendeLinje.fullABelop);
      if (manglendeLinje.alleredeABelop) {
        alleredeA = round2(alleredeA + manglendeLinje.alleredeABelop);
        kontoerA.set("Manglende linje lagt til", round2((kontoerA.get("Manglende linje lagt til") || 0) + manglendeLinje.alleredeABelop));
      }
      if (manglendeLinje.fullBBelop) fullB = round2(fullB + manglendeLinje.fullBBelop);
      if (manglendeLinje.alleredeBBelop) {
        alleredeB = round2(alleredeB + manglendeLinje.alleredeBBelop);
        kontoerB.set("Manglende linje lagt til", round2((kontoerB.get("Manglende linje lagt til") || 0) + manglendeLinje.alleredeBBelop));
      }
    }

    // v12 (2026-09-03) - Del B (parkering) nettes IKKE lenger pr. bygg her. Konto-først: alt som
    // er bokført på parkeringskonto (eller parkeringsbygg-kode) for kundenummeret, uavhengig av
    // bygg og selskap, samles i én pool pr. leietaker og fordeles proporsjonalt på leietakerens
    // Fazile-parkeringslinjer i v12-blokken lenger ned. Her beregnes derfor bare Del A endelig,
    // pluss et FORELØPIG Del B-tall (kun brukt til status-kjeden under, overskrives i v12).
    //  - Rent Del A-leieforhold (fullB=0): gjenstarA = fullA - alleredeA. Parkeringskonto-
    //    bokføring på dette bygget (alleredeB) går til poolen - tidligere ble den nettet mot
    //    husleien her (Norrøna: Q3-parkering bokført på "Vollsveien 13H" ga 2 kvartaler gjenstår
    //    i Del B og 1 kvartal for lite i Del A; PGS: 688 543 kr Q1-garasje på "Lilleakerveien 4C").
    //  - Rent Del B-leieforhold (fullA=0): ALT bokført (også husleiekonto) regnes som parkering -
    //    et rent parkeringsleieforhold har ingen husleie å nette mot (Hyre, Better Business, Food
    //    Folk: parkering fakturert på konto 3600 - vises med kommentar, ikke som "feil").
    //  - Blandet: pr. Del.
    let gjenstarA, gjenstarB;
    const alleredeTotal = alleredeA + alleredeB;
    if (fullA > 0 && fullB === 0) {
      gjenstarA = round2(fullA - alleredeA);
      gjenstarB = 0; // alleredeB går til poolen (v12), ikke et negativt tall her
    } else if (fullB > 0 && fullA === 0) {
      gjenstarB = round2(fullB - alleredeTotal);
      gjenstarA = 0;
    } else {
      // Begge deler 0 (uten treff-flagget) eller reelt blandet - behold per-del-subtraksjon.
      gjenstarA = round2(fullA - alleredeA);
      gjenstarB = round2(fullB - alleredeB);
    }

    let status = historiskOvertakelse ? "forklart-historisk-kundenummer" : manglendeLinje ? "forklart-manglende-linje" : "ok";
    let forklaring = historiskOvertakelse ? historiskOvertakelse.forklaring : manglendeLinje ? manglendeLinje.forklaring : null;
    const kontraktAvsluttet = fullA === 0 && fullB === 0 && (alleredeA > 0 || alleredeB > 0);
    // v12 - "frosset" = gjenstår er tvunget til 0 av en forklaring (avsluttet/utsatt/draft/
    // engangsgebyr) og skal IKKE regnes om av Del B-poolingen.
    let frosset = false;
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
      frosset = true;
      status = "avsluttet";
      forklaring =
        "Leieforholdet er avsluttet i Fazile (ingen aktiv kontrakt i dag) - allerede fakturert i NXT tidligere i år regnes som ferdig, ikke gjenstående.";
      countAvsluttet++;
    } else if (!nxt && (fullA > 0 || fullB > 0) && FAKTURERING_UTSATT_TIL_SENERE_AR.has(normalizeName(g.leietaker))) {
      status = "forklart-fakturering-senere-ar";
      forklaring = FAKTURERING_UTSATT_TIL_SENERE_AR.get(normalizeName(g.leietaker));
      gjenstarA = 0;
      gjenstarB = 0;
      frosset = true;
      countFaktureringUtsatt++;
    } else if (!nxt && (fullA > 0 || fullB > 0) && DRAFT_KONTRAKT_LEIETAKERE.has(historiskNokkel)) {
      status = "forklart-draft-kontrakt";
      forklaring = DRAFT_KONTRAKT_LEIETAKERE.get(historiskNokkel);
      gjenstarA = 0;
      gjenstarB = 0;
      frosset = true;
      countDraftKontrakt++;
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
      frosset = true;
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
    // Konto-fordeling (pr. NXT-bokføringskonto) - kun til drilldown-visning, ikke brukt i noen
    // beregning. Filtrerer bort ~0-rader (avrundingsstøv) og sorterer størst først.
    const tilKontoArray = (map) =>
      [...map.entries()]
        .map(([konto, belop]) => ({ konto: String(konto), belop: round2(belop) }))
        .filter((k) => Math.abs(k.belop) >= 1)
        .sort((a, b) => Math.abs(b.belop) - Math.abs(a.belop));

    tenant.byggGrupper.push({
      bygg: g.bygg,
      fullArsverdi2026DelA: fullA,
      fullArsverdi2026DelB: fullB,
      alleredeFakturertDelA: round2(alleredeA),
      alleredeFakturertDelB: round2(alleredeB),
      kontoFordelingDelA: tilKontoArray(kontoerA),
      kontoFordelingDelB: tilKontoArray(kontoerB),
      // Post-korreksjon (status-avhengig, se if/else-kjeden over) A/B-splitt av gjenstår -
      // lagres separat fra gjenstarTotal fordi Leietaker-tabellen (build-tenant-forecast-
      // table.js) trenger Del A og Del B hver for seg, og korreksjonene (avsluttet->0 osv.)
      // MÅ være bakt inn her - ikke la den nye tabellen prøve å gjenskape denne logikken.
      gjenstarDelA: round2(gjenstarA),
      gjenstarDelB: round2(gjenstarB),
      gjenstarTotal: round2(gjenstarA + gjenstarB),
      status,
      forklaring,
      // v12 - interne felt (prefiks "_"), ALDRI i det publiserte snapshotet (slettes etter
      // poolingen, samme mønster som _kommentarRaw i build-tenant-forecast-table.js).
      _key: historiskNokkel, // leieforhold-nøkkel (leietaker||bygg) - v13-fakturaplanen slår opp gruppen på denne
      _customerNo: idMatch.customerNo || null,
      _byggKeys: idMatch.byggKeys || [],
      _navnematchet: !!nxt && !idMatch.nxt, // NXT-tall kom fra navnematching, ikke kundenummer
      _frosset: frosset,
      // Synteiske Del B-krediteringer (ikke ekte NXT-data, finnes ikke i kundenummer-poolen).
      _kredittB: round2((historiskOvertakelse?.belopB || 0) + (manglendeLinje?.alleredeBBelop || 0)),
      _kredittBKontoer: kontoerB.size
        ? [...kontoerB.entries()].filter(([k]) => k === "Overtatt fra gammelt kundenummer" || k === "Manglende linje lagt til")
        : [],
    });
    tenant.lines.push(...g.lines);
  }

  // Morten bekreftet direkte 2026-08-31: "Head Sport Gmbh" (Vollsveien 13D, customer_id 67253,
  // kontrakt CA4644 fra 2025-10-01) og "Head Norway AS" (Vollsveien 13H/19, customer_id 67266)
  // er samme reelle leietaker, selv om de er to separate Fazile-kunder med hver sin
  // kontrakt/customer_id. Slås sammen HER til én "Head Norway AS"-rad (FØR v12-poolingen og tenantList)
  // slik at budsjett-matching (build-tenant-budget.js sin byExactName), fakturert/gjenstår, og
  // Ledig-flyttet-inn-koblingen (build-tenant-forecast-table.js) alle ser dem som én leietaker.
  // Reverserer samtidig den tidligere "RETTET 2026-08-26"-konklusjonen om at de var separate -
  // Morten presiserte nå at det er samme selskap uansett Fazile-strukturen.
  const HEAD_SPORT_KEY = normalizeName("Head Sport Gmbh");
  const HEAD_NORWAY_KEY = normalizeName("Head Norway AS");
  if (tenantMap.has(HEAD_SPORT_KEY)) {
    const headSport = tenantMap.get(HEAD_SPORT_KEY);
    if (!tenantMap.has(HEAD_NORWAY_KEY)) tenantMap.set(HEAD_NORWAY_KEY, { navn: "Head Norway AS", byggGrupper: [], lines: [] });
    const headNorway = tenantMap.get(HEAD_NORWAY_KEY);
    headNorway.byggGrupper.push(...headSport.byggGrupper);
    headNorway.lines.push(...headSport.lines);
    tenantMap.delete(HEAD_SPORT_KEY);
  }

  // v12 (2026-09-03, Morten etter Q4-revisjonen: "Parkering må inneholde alt som er på
  // parkeringskontoer uavhengig av bygg ... om noe er ført feil så bør det vises korrekt i
  // prognosen vår, bare med en kommentar") - KONTO-FØRST, KUNDENUMMER-BRED Del B.
  //
  // Bakgrunn: Q4-gjenstår for parkering lå 6,3 mill kr over et normalkvartal. Utenom Onepark/
  // internleie/kontraktsendringer skyldtes ~0,7 mill kr netto tre pipeline-svakheter i v11:
  //  D) Parkeringskvartal bokført på HOVEDBYGG-koden til et blandet leieforhold ble nettet i Del A
  //     (Norrøna 113 112 på "Vollsveien 13H", Sats 105 154 på "Lilleakerveien 14", Nitschke,
  //     Brødrene Dahl, CMA CGM, Ecoguard, PGS 688 543 på "Lilleakerveien 4C" ...) - Del B viste
  //     2 kvartaler gjenstår, Del A 1 kvartal for lite.                           (+410 145)
  //  E) Del B-bokføring ble ikke funnet: bygg-navn som finnes i flere selskap (se byggSelskaper),
  //     og Q1 på generelle koder ("(Ikke bruk) Uteområde Sør", "Parkering ute Lilleakerveien")
  //     uten noen ren Del B-gruppe i samme selskap.                               (+553 641)
  //  F) Dobbelttelling når en ren parkeringsgruppe hadde en liten Del A-postering (Nord Pool,
  //     Dell, Systra, Lego - ladegebyr 2 875 kr på V17 el-bil-garasje).           (-268 214)
  //
  // Modell: pr. leietaker samles ÉN Del B-pool = alle Del B-klassifiserte NXT-posteringer
  // (konto 3640-3642 uansett bygg, + ikke-parkeringskonto på parkeringsbygg-kode) for
  // leietakerens kundenummer på tvers av ALLE bygg og selskap, + synteiske krediteringer, + for
  // RENE parkeringsleieforhold også husleiekonto-posteringer på det bygget (ingen husleie å
  // nette mot). Poolen fordeles proporsjonalt (etter fullB) på leietakerens Fazile-
  // parkeringslinjer pr. bygg, slik at bygg-/leietype-visningen fortsatt stemmer linje for
  // linje. Avsluttede/frosne grupper holdes utenfor. Har leietakeren parkeringsbokføring men
  // INGEN Fazile-parkeringslinje, vises den som egen Del B-rad med gjenstår 0 og kommentar
  // (status "forklart-parkering-uten-fazile-linje") - IKKE nettet mot husleien som før.
  // Delt kundenummer mellom to Fazile-leietakere: poolen deles etter fullB.
  const customerNoTilTenantKeys = new Map();
  for (const [tKey, tenant] of tenantMap) {
    if (tKey === ONEPARK_LEIETAKER_KEY) continue;
    for (const bg of tenant.byggGrupper) {
      if (!bg._customerNo) continue;
      if (!customerNoTilTenantKeys.has(bg._customerNo)) customerNoTilTenantKeys.set(bg._customerNo, new Set());
      customerNoTilTenantKeys.get(bg._customerNo).add(tKey);
    }
  }
  const fullBAktiv = (tenant) => round2(tenant.byggGrupper.filter((bg) => !bg._frosset).reduce((s, bg) => s + bg.fullArsverdi2026DelB, 0));
  function negativDelBStatus(leietakerKey) {
    if (ENGANGSGEBYR_LEIETAKERE.has(leietakerKey)) return { status: "forklart-engangsgebyr", forklaring: ENGANGSGEBYR_LEIETAKERE.get(leietakerKey), nullstill: true };
    if (OMSETNINGSLEIE_LEIETAKERE.has(leietakerKey)) return { status: "forklart-omsetningsleie", forklaring: OMSETNINGSLEIE_LEIETAKERE.get(leietakerKey), nullstill: false };
    if (NXT_FEILKODING_LEIETAKERE.has(leietakerKey)) return { status: "forklart-nxt-feilkoding", forklaring: NXT_FEILKODING_LEIETAKERE.get(leietakerKey), nullstill: false };
    return {
      status: "forklart-kontraktsendring",
      forklaring:
        "Parkering: fakturert på parkeringskonto i NXT (alle bygg/selskap for kundenummeret) overstiger leietakerens aktive Fazile-parkeringslinjer for 2026. Vanligste årsak: en parkeringslinje som er avsluttet/fornyet i løpet av året mangler i Fazile-uttrekket (kun aktive linjer hentes), eller Fazile mangler en linje for plasser som reelt faktureres. Sjekk kontraktshistorikken før beløpet tolkes som overfakturering.",
      nullstill: false,
    };
  }
  let countPooletLeietakere = 0;
  let countParkeringUtenFazileLinje = 0;
  let sumParkeringUtenFazileLinje = 0;
  let countDeltKundenummer = 0;
  for (const [tKey, tenant] of tenantMap) {
    if (tKey === ONEPARK_LEIETAKER_KEY) continue;
    const aktive = tenant.byggGrupper.filter((bg) => !bg._frosset);
    const fullBTotal = fullBAktiv(tenant);
    const customerNos = [...new Set(tenant.byggGrupper.map((bg) => bg._customerNo).filter(Boolean))];
    const excludeKeys = new Set(tenant.byggGrupper.filter((bg) => bg._frosset).flatMap((bg) => bg._byggKeys));
    // Rå, bygg-attribuert Del B på gruppene som faktisk HAR Fazile-parkeringslinjer - kun til
    // kommentaren ("X kr hentet fra andre bygg-koder", inkl. hovedbygg-koden til rene Del A-
    // grupper), ikke til beregning.
    const raaByggB = round2(aktive.filter((bg) => bg.fullArsverdi2026DelB > 0).reduce((s, bg) => s + bg.alleredeFakturertDelB, 0));

    let pool = 0;
    const kontoer = new Map();
    const leggKonto = (konto, belop) => {
      if (Math.abs(belop) < 0.005) return;
      kontoer.set(konto, round2((kontoer.get(konto) || 0) + belop));
    };
    const noter = [];
    // 1) Kundenummer-bred pool (alle bygg, alle selskap).
    for (const cno of customerNos) {
      const r = nxtDelBPoolForCustomer(cno, excludeKeys);
      const deltMed = customerNoTilTenantKeys.get(cno);
      let andel = 1;
      if (deltMed && deltMed.size > 1) {
        // Samme NXT-kundenummer på flere Fazile-leietakere - del poolen etter fullB.
        const sumFullB = [...deltMed].reduce((s, k) => s + fullBAktiv(tenantMap.get(k)), 0);
        andel = sumFullB > 0 ? fullBTotal / sumFullB : [...deltMed][0] === tKey ? 1 : 0;
        if (r.sum !== 0) {
          countDeltKundenummer++;
          noter.push(
            `kundenr. ${cno} deles med ${[...deltMed].filter((k) => k !== tKey).map((k) => tenantMap.get(k).navn).join(", ")} - ${Math.round(andel * 100)} % av parkeringsbokføringen (${round2(r.sum).toLocaleString("nb-NO")} kr) tilordnet hit etter Fazile-andel`,
          );
        }
      }
      pool += r.sum * andel;
      for (const [k, v] of r.kontoer) leggKonto(String(k), v * andel);
    }
    // 2) Uten kundenummer i det hele tatt: navnematchede tall pr. bygg (som før).
    if (customerNos.length === 0) {
      for (const bg of aktive) {
        pool += bg.alleredeFakturertDelB;
        for (const k of bg.kontoFordelingDelB) leggKonto(k.konto, k.belop);
      }
    } else {
      // Synteiske krediteringer ligger i kontoFordelingDelB, men ikke i NXT-poolen - legg til.
      for (const bg of aktive) {
        pool += bg._kredittB;
        for (const [k, v] of bg._kredittBKontoer) leggKonto(k, v);
      }
    }
    // 3) Rene parkeringsleieforhold: husleiekonto-posteringer på bygget regnes som parkering -
    //    flyttes HELT over (Del A-fakturert nullstilles, ellers dobbelttelles det i leietakerens
    //    "fakturert"-sum som er A+B på tvers av byggGrupper).
    //    Gjelder KUN når leietakeren ikke har husleie noe sted (Hyre) - har leietakeren Del A-
    //    linjer på andre bygg, er husleiekonto-postering på en parkeringsbygg-kode langt mer
    //    sannsynlig husleie på FEIL bygg-kode (Møller Bil Vest: konto 3620 på "Lilleakerveien 16"
    //    mens Fazile-linjen heter "Lilleakerveien 16 Skoda"). Da flyttes den til Del A-gruppen
    //    med samme bygg-prefiks hvis én finnes, ellers står den ufordelt (gjenstår 0, kommentar).
    let husleiekontoSomParkering = 0;
    const erIntern = INTERN_MUSTAD_NAMES.has(tKey);
    // Intern Mustad (P-Bro-linjene til Eiendomsdrift): alt er samme lomme - husleiekonto-postering
    // på parkeringsbygg regnes som parkering uansett om det finnes husleie andre steder.
    const harHusleie = !erIntern && aktive.some((bg) => bg.fullArsverdi2026DelA > 0);
    for (const bg of aktive) {
      if (bg.fullArsverdi2026DelA !== 0 || bg.fullArsverdi2026DelB === 0 || bg.alleredeFakturertDelA === 0) continue;
      const belop = bg.alleredeFakturertDelA;
      const kontoTekst = bg.kontoFordelingDelA.map((k) => k.konto).join("/");
      // Passer beløpet innenfor leietakerens parkeringslinjer for året (pool + beløp <= fullB),
      // er det parkering på feil konto (Better Business/Sustevo: nøyaktig 3 kvartaler etter
      // tillegget; små ladegebyr på V17 el-bil-garasjen) - ikke husleie på feil bygg-kode.
      const passerSomParkering = round2(pool + belop) <= round2(fullBTotal + 1);
      if (!harHusleie || passerSomParkering) {
        pool += belop;
        husleiekontoSomParkering += belop;
        for (const k of bg.kontoFordelingDelA) leggKonto(`${k.konto} (husleiekonto, regnet som parkering)`, k.belop);
        noter.push(
          `${belop.toLocaleString("nb-NO")} kr på ${bg.bygg} er fakturert på husleiekonto (${kontoTekst}), ikke parkeringskonto - regnet som parkering siden ${harHusleie ? "beløpet passer innenfor leietakerens Fazile-parkeringslinjer for året (husleien ligger på andre bygg)" : "leieforholdet kun har parkering i Fazile"}. Bør rettes i NXT`,
        );
        bg.alleredeFakturertDelA = 0;
        bg.kontoFordelingDelA = [];
        continue;
      }
      const nb = normalizeName(bg.bygg);
      const mottaker = aktive.find((o) => o !== bg && o.fullArsverdi2026DelA > 0 && (normalizeName(o.bygg).startsWith(nb) || nb.startsWith(normalizeName(o.bygg))));
      if (mottaker) {
        mottaker.alleredeFakturertDelA = round2(mottaker.alleredeFakturertDelA + belop);
        for (const k of bg.kontoFordelingDelA) {
          const eks = mottaker.kontoFordelingDelA.find((m) => m.konto === k.konto);
          if (eks) eks.belop = round2(eks.belop + k.belop);
          else mottaker.kontoFordelingDelA.push({ konto: k.konto, belop: k.belop });
        }
        mottaker.gjenstarDelA = round2(mottaker.fullArsverdi2026DelA - mottaker.alleredeFakturertDelA);
        mottaker.gjenstarTotal = round2(mottaker.gjenstarDelA + mottaker.gjenstarDelB);
        if (mottaker.status === "ikke-matchet-i-nxt") {
          mottaker.status = "ok";
          mottaker.forklaring = null;
        }
        const notat = `${belop.toLocaleString("nb-NO")} kr husleie (konto ${kontoTekst}) var bokført på parkeringsbygg-koden "${bg.bygg}" i NXT - flyttet hit (samme bygg-prefiks) og nettet mot husleien (v12). Bør rettes til riktig bygg-kode i NXT.`;
        mottaker.forklaring = mottaker.forklaring ? `${mottaker.forklaring} ${notat}` : notat;
        bg.alleredeFakturertDelA = 0;
        bg.kontoFordelingDelA = [];
        bg.forklaring = bg.forklaring ? `${bg.forklaring} ${notat.replace("flyttet hit", `flyttet til ${mottaker.bygg}`)}` : notat.replace("flyttet hit", `flyttet til ${mottaker.bygg}`);
      } else {
        // Ufordelt: vises som fakturert på dette bygget, men nettes ikke mot noe.
        noter.push(
          `${belop.toLocaleString("nb-NO")} kr på ${bg.bygg} er fakturert på husleiekonto (${kontoTekst}) selv om Fazile kun har parkering her - leietakeren har husleie på andre bygg, så dette er sannsynligvis husleie på feil bygg-kode (eller et gebyr uten Fazile-linje). Vises som fakturert, IKKE nettet mot parkering eller husleie. SJEKK`,
        );
      }
    }
    pool = round2(pool);
    const paaParkeringsbyggIkkeKonto = [...kontoer.entries()].filter(([k]) => /^\d+$/.test(k) && ![3640, 3641, 3642].includes(Number(k)));
    if (paaParkeringsbyggIkkeKonto.length) {
      noter.push(
        `${round2(paaParkeringsbyggIkkeKonto.reduce((s, [, v]) => s + v, 0)).toLocaleString("nb-NO")} kr er bokført på parkeringsbygg-kode men på konto ${paaParkeringsbyggIkkeKonto.map(([k]) => k).join("/")} (ikke parkeringskonto 3640-3642) - regnet som parkering. Bør rettes i NXT`,
      );
    }
    const flyttet = round2(pool - raaByggB - husleiekontoSomParkering);
    if (Math.abs(flyttet) >= 1) {
      noter.unshift(
        `${Math.abs(flyttet).toLocaleString("nb-NO")} kr ${flyttet > 0 ? "hentet fra" : "gitt til"} andre NXT-bygg-koder/selskap for samme kundenummer (parkeringskonto-postering på hovedbygg-kode, "(Ikke bruk)"-koder, Fenistra-migreringens Q1-postering o.l.)`,
      );
    }
    if (pool === 0 && fullBTotal === 0) continue; // ingen parkering i det hele tatt for denne leietakeren

    const kontoArray = (skala) =>
      [...kontoer.entries()]
        .map(([konto, belop]) => ({ konto, belop: round2(belop * skala) }))
        .filter((k) => Math.abs(k.belop) >= 1)
        .sort((a, b) => Math.abs(b.belop) - Math.abs(a.belop));
    const poolNotat = `Del B (parkering) er beregnet konto-først og kundenummer-bredt (v12): all parkeringsbokføring for kundenummeret på tvers av bygg og selskap (${pool.toLocaleString("nb-NO")} kr) er nettet mot leietakerens samlede Fazile-parkeringslinjer (${fullBTotal.toLocaleString("nb-NO")} kr) og fordelt proporsjonalt på byggene${noter.length ? " - " + noter.join("; ") : ""}.`;

    // Rene Del A-grupper med parkeringskonto-bokføring: pengene er nå i poolen - si det i Del A.
    for (const bg of aktive) {
      if (bg.fullArsverdi2026DelA > 0 && bg.fullArsverdi2026DelB === 0 && bg.alleredeFakturertDelB !== 0) {
        const notat = `${bg.alleredeFakturertDelB.toLocaleString("nb-NO")} kr bokført på parkeringskonto for dette bygget er flyttet til leietakerens Del B (parkering) - ikke nettet mot husleien her (v12).`;
        bg.forklaring = bg.forklaring ? `${bg.forklaring} ${notat}` : notat;
      }
    }

    if (fullBTotal > 0) {
      countPooletLeietakere++;
      const medB = aktive.filter((bg) => bg.fullArsverdi2026DelB > 0);
      let fordelt = 0;
      medB.forEach((bg, i) => {
        const andel = bg.fullArsverdi2026DelB / fullBTotal;
        const alleredeB = i === medB.length - 1 ? round2(pool - fordelt) : round2(pool * andel);
        fordelt = round2(fordelt + alleredeB);
        bg.alleredeFakturertDelB = alleredeB;
        bg.kontoFordelingDelB = kontoArray(andel);
        bg.gjenstarDelB = round2(bg.fullArsverdi2026DelB - alleredeB);
        if (bg.fullArsverdi2026DelA === 0) {
          // Rent parkeringsleieforhold - status avledes av det POOLEDE tallet.
          if (erIntern) {
            // beholder intern-mustad
          } else if (bg.gjenstarDelB < -100) {
            const n = negativDelBStatus(tKey);
            bg.status = n.status;
            bg.forklaring = n.forklaring;
            if (n.nullstill) bg.gjenstarDelB = 0;
          } else if (bg.status === "ikke-matchet-i-nxt" && alleredeB !== 0) {
            bg.status = "ok";
            bg.forklaring = null;
          } else if (["forklart-kontraktsendring", "forklart-omsetningsleie", "forklart-nxt-feilkoding", "forklart-engangsgebyr"].includes(bg.status)) {
            bg.status = "ok";
            bg.forklaring = null;
          }
        }
        bg.gjenstarTotal = round2(bg.gjenstarDelA + bg.gjenstarDelB);
        bg.forklaring = bg.forklaring ? `${bg.forklaring} ${poolNotat}` : poolNotat;
      });
      for (const bg of aktive) {
        if (bg.fullArsverdi2026DelB > 0) continue;
        bg.alleredeFakturertDelB = 0;
        bg.kontoFordelingDelB = [];
        bg.gjenstarDelB = 0;
        bg.gjenstarTotal = round2(bg.gjenstarDelA);
      }
    } else {
      // Parkering fakturert, men ingen Fazile-parkeringslinje - egen rad, gjenstår 0, kommentar.
      countParkeringUtenFazileLinje++;
      sumParkeringUtenFazileLinje = round2(sumParkeringUtenFazileLinje + pool);
      for (const bg of aktive) {
        bg.alleredeFakturertDelB = 0;
        bg.kontoFordelingDelB = [];
        bg.gjenstarDelB = 0;
        bg.gjenstarTotal = round2(bg.gjenstarDelA);
      }
      tenant.byggGrupper.push({
        bygg: "Parkering (bokført på parkeringskonto, ingen Fazile-linje)",
        fullArsverdi2026DelA: 0,
        fullArsverdi2026DelB: 0,
        alleredeFakturertDelA: 0,
        alleredeFakturertDelB: pool,
        kontoFordelingDelA: [],
        kontoFordelingDelB: kontoArray(1),
        gjenstarDelA: 0,
        gjenstarDelB: 0,
        gjenstarTotal: 0,
        status: erIntern ? "intern-mustad" : "forklart-parkering-uten-fazile-linje",
        forklaring: `${pool.toLocaleString("nb-NO")} kr er fakturert på parkeringskonto (3640-3642) i NXT for denne leietakeren i 2026, men Fazile har ingen aktiv parkeringslinje for leietakeren. Vises som fakturert parkering (Del B) med 0 kr gjenstår - ikke nettet mot husleien (v12). SJEKK: mangler parkeringslinjen i Fazile (da skal Q4 også faktureres og gjenstår er for lavt), eller er husleie feilført på parkeringskonto?${noter.length ? " " + noter.join("; ") + "." : ""}`,
        _frosset: true,
      });
    }
  }
  // v13 A) FAZILE-FAKTURAPLAN SOM GJENSTÅR-KILDE - se filhodet. Kjøres ETTER v12-poolingen (slik at
  // "allerede fakturert"/kontofordeling og Del B-kommentarene er endelige) og FØR Onepark (som
  // beholder sitt manuelle estimat). Modellens gjenstår beholdes som `modellGjenstarTotal` og i
  // forklaringen, så avviket pr. leieforhold er synlig i drilldownen.
  const fmtKr = (n) => round2(n).toLocaleString("nb-NO");
  let fakturaplanInfo = null;
  let countPlanOverlagt = 0;
  let sumPlanOverlagt = 0;
  let countPlanMangler = 0;
  let sumPlanMangler = 0;
  let countNullstiltUtenPlan = 0;
  let sumNullstiltUtenPlan = 0;
  let countNyeGrupperFraPlan = 0;
  let sumNyeGrupperFraPlan = 0;
  const gamlePerioder = []; // fakturalinjer for perioder FØR planens start som fortsatt ikke er sendt - rapporteres separat
  const planUtenLeieforhold = []; // plan-linjer som ikke kunne knyttes til noe leieforhold
  const planUtenKonto = [];
  const ekstrapolerteLinjer = []; // månedsfakturerte linjer forlenget til årsslutt (Fazile genererer bare ~3 mnd frem)
  const delvisDekning = []; // aktive rent_roll-linjer uten planlinje i leieforhold som ellers har plan
  if (fs.existsSync(FAZILE_FAKTURAPLAN_DIR)) {
    const les = (f) => JSON.parse(fs.readFileSync(path.join(FAZILE_FAKTURAPLAN_DIR, f), "utf8"));
    const planMeta = les("meta.json");
    const planInvoices = les("invoices.json");
    const planLines = les("lines.json");
    const planLineAccounts = les("line-accounts.json");
    const planContracts = fs.existsSync(path.join(FAZILE_FAKTURAPLAN_DIR, "contracts.json")) ? les("contracts.json") : {};
    const planCacheDato = planMeta.nxtCacheDato || nxtCacheDato;
    if (nxtCacheDato && planMeta.nxtCacheDato && planMeta.nxtCacheDato !== nxtCacheDato) {
      console.log(`ADVARSEL: fakturaplanens nxtCacheDato (${planMeta.nxtCacheDato}) != nxt-booked-tenants/meta.json (${nxtCacheDato}) - "allerede i NXT"-grensen kan være feil, hent fakturaplanen på nytt.`);
    }
    // Planens første periode = måneden etter NXT-cachen. Alt før det som fortsatt ikke er sendt, er
    // tilbakedaterte/ubehandlede utkast - regnes med (Fazile VIL sende dem), men rapporteres separat.
    const planStart = (() => {
      const d = new Date(planCacheDato);
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + 1);
      return d.toISOString().slice(0, 10);
    })();

    const radPrLinjeId = new Map();
    const raderPrKontraktId = new Map();
    for (const row of alleFazileRader) {
      radPrLinjeId.set(row.linje_id, row);
      if (!raderPrKontraktId.has(row.kontrakt_id)) raderPrKontraktId.set(row.kontrakt_id, []);
      raderPrKontraktId.get(row.kontrakt_id).push(row);
    }
    const leieforholdKey = (leietaker, seksjon) => normalizeName(leietaker) + "||" + normalizeName(resolveNxtBuilding(seksjon, nxtBuildingSet) || seksjon);
    const erDelBRad = (row) => isDelB(row.seksjon) || PARKERING_LINJE_REGEX.test(row.beskrivelse || "");

    // Målfakturaer: perioder i 2026, ikke allerede sendt til NXT pr. cachedatoen. Avregningstyper
    // holdes utenfor (omsetningsavregning har egen fane; felleskostavregning er ikke 36xx).
    // Betalte kreditnotaer er allerede gjort opp i NXT.
    const maalFakturaer = new Map();
    for (const i of planInvoices) {
      if (!i.date_from || i.date_from > "2026-12-31") continue;
      if (i.type === "TURNOVER_DIFFERENCE" || i.type === "TENANT_OWNER_SETTLEMENT") continue;
      if (i.type === "CREDIT_NOTE" && i.status === "PAID") continue;
      if (i.sending_status === "SENT" && i.sent_at && i.sent_at.slice(0, 10) <= planCacheDato) continue;
      maalFakturaer.set(i.i_id, i);
    }

    // Fakturalinje -> leieforhold: kontraktslinje-id (primær) -> kontrakt-id (alle rader på
    // kontrakten, velg lik beskrivelse / samme Del) -> fornyelseskjede via contracts.json -> ren
    // contracts.json-oppføring (ny kontrakt uten rent_roll-rader).
    function finnRadForPlanlinje(l, inv, planDelB) {
      const viaLinje = radPrLinjeId.get(l.cl_id);
      if (viaLinje) return viaLinje;
      const kontrakt = planContracts[String(inv.c_id)];
      let rader = raderPrKontraktId.get(inv.c_id);
      if ((!rader || !rader.length) && kontrakt && kontrakt.fornyelseAv) rader = raderPrKontraktId.get(kontrakt.fornyelseAv);
      if (rader && rader.length) {
        const desc = (l.description || "").trim();
        return rader.find((r) => (r.beskrivelse || "").trim() === desc) || rader.find((r) => erDelBRad(r) === planDelB) || rader[0];
      }
      if (kontrakt) return { leietaker: kontrakt.leietaker, seksjon: kontrakt.seksjon, eiendom: kontrakt.eiendom };
      return null;
    }

    const plan = new Map(); // leieforhold-nøkkel -> { leietaker, seksjon, delA, delB, antall, gamlePerioder, ekstrapolert, ekstrapolertMnd }
    let sumPlanTotal = 0;
    const sistePeriodePrLinje = new Map(); // cl_id -> siste planlagte periode (for månedsekstrapolering)
    const leggTilPlan = (key, rad, del, belop) => {
      if (!plan.has(key)) plan.set(key, { leietaker: rad.leietaker.trim(), seksjon: rad.seksjon, delA: 0, delB: 0, antall: 0, gamlePerioder: 0, ekstrapolert: 0, ekstrapolertMnd: 0 });
      const p = plan.get(key);
      if (del === "A") p.delA = round2(p.delA + belop);
      else p.delB = round2(p.delB + belop);
      p.antall++;
      sumPlanTotal = round2(sumPlanTotal + belop);
    };
    for (const l of planLines) {
      const inv = maalFakturaer.get(l.i_id);
      if (!inv) continue;
      const desc = l.description || "";
      let konto = FAZILE_A_ID_TIL_KONTO[planLineAccounts[String(l.il_id)]];
      if (konto == null) {
        // Enkelte parkeringslinjer mangler kontokobling i Fazile - parkering er alltid 3640.
        if (PARKERING_LINJE_REGEX.test(desc)) konto = 3640;
        else {
          planUtenKonto.push({ il_id: l.il_id, i_id: l.i_id, desc, belop: l.total_price_excl_vat });
          continue;
        }
      }
      // "Investeringsleie" ligger på Fazile-kontoen for annen inntekt (3900), men NXT bokfører den
      // på 3600 sammen med husleien - verifisert 2026-09-04: kvartalsposteringen på 3600 for den
      // aktuelle kunden (Strandveien 4-8) = kontorleie + mørke arealer + investeringsleie, eksakt.
      if (konto === 3900 && /investeringsleie/i.test(desc)) konto = 3600;
      if (konto < 3600 || konto > 3699 || OMSETNINGSAVREGNING_2025_KONTI.has(konto)) continue;
      const planDelB = [3640, 3641, 3642].includes(konto) || PARKERING_LINJE_REGEX.test(desc);
      const rad = finnRadForPlanlinje(l, inv, planDelB);
      if (!rad) {
        planUtenLeieforhold.push({ il_id: l.il_id, i_id: l.i_id, c_id: inv.c_id, desc, belop: l.total_price_excl_vat });
        continue;
      }
      let belop = l.total_price_excl_vat;
      if (FAKTURAPLAN_HALVERES_EIENDOM.has(rad.eiendom)) belop *= 0.5;
      belop = round2(belop);
      const del = planDelB || isDelB(rad.seksjon) ? "B" : "A";
      const key = leieforholdKey(rad.leietaker, rad.seksjon);
      leggTilPlan(key, rad, del, belop);
      if (inv.date_to < planStart) {
        const p = plan.get(key);
        p.gamlePerioder = round2(p.gamlePerioder + belop);
        gamlePerioder.push({ leietaker: rad.leietaker.trim(), bygg: rad.seksjon, i_id: l.i_id, type: inv.type, status: inv.status, periode: `${inv.date_from}..${inv.date_to}`, desc, belop });
      }
      // Siste planlagte periode pr. kontraktslinje - grunnlag for månedsekstrapolering under.
      if (inv.type === "GENERATED_BY_SYSTEM") {
        const s = sistePeriodePrLinje.get(l.cl_id);
        if (!s || l.date_to > s.to) sistePeriodePrLinje.set(l.cl_id, { from: l.date_from, to: l.date_to, belop, key, rad, del, desc });
        else if (l.date_to === s.to) s.belop = round2(s.belop + belop);
      }
    }

    // Månedsfakturerte linjer: Fazile genererer månedsfakturaer bare ~3 måneder frem, så pr.
    // september finnes sep/okt/nov men ikke desember (kvartalsfakturaer for Q4 finnes derimot
    // komplett). Uten dette ville alle månedsfakturerte leieforhold (typisk CC Vest-butikker) mangle
    // én måned. Regel: siste planlagte periode er én kalendermåned, slutter før 31.12, og
    // kontraktslinjen løper videre (rent_roll slutt_dato etter perioden, eller linjen er ukjent for
    // rent_roll - rabatt-/fritakslinjer - da følger den husleielinjen den hører til). Forlenges med
    // siste måneds beløp pr. gjenstående måned, merket i forklaringen.
    const erKalendermaaned = (from, to) => {
      if (!from || !to || from.slice(0, 7) !== to.slice(0, 7) || from.slice(8) !== "01") return false;
      const d = new Date(to + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + 1);
      return d.getUTCDate() === 1;
    };
    for (const [clId, s] of sistePeriodePrLinje) {
      if (s.to >= "2026-12-31" || !erKalendermaaned(s.from, s.to)) continue;
      const rrRad = radPrLinjeId.get(clId);
      let horisont = "2026-12-31";
      if (rrRad && rrRad.slutt_dato && rrRad.slutt_dato < horisont) horisont = rrRad.slutt_dato;
      if (horisont <= s.to) continue;
      const [ay, am] = s.to.split("-").map(Number);
      const [by, bm] = horisont.split("-").map(Number);
      const mnd = (by - ay) * 12 + (bm - am);
      if (mnd <= 0) continue;
      const tillegg = round2(s.belop * mnd);
      if (tillegg === 0) continue;
      leggTilPlan(s.key, s.rad, s.del, tillegg);
      const p = plan.get(s.key);
      p.ekstrapolert = round2(p.ekstrapolert + tillegg);
      p.ekstrapolertMnd = Math.max(p.ekstrapolertMnd, mnd);
      ekstrapolerteLinjer.push({ leietaker: s.rad.leietaker.trim(), bygg: s.rad.seksjon, desc: s.desc, sisteMnd: s.to.slice(0, 7), mnd, belop: tillegg });
    }

    // Delvis dekning: rent_roll-linjer med årsleie som løper videre etter inneværende kvartal, men
    // som ikke har én eneste fakturalinje i planen - i et leieforhold som ellers HAR plan. Typisk en
    // ny kontraktslinje Fazile ikke har begynt å generere fakturaer for. Merkes, legges ikke til.
    const kvartalSlutt = (() => {
      const d = new Date(planStart);
      const q = Math.floor(d.getUTCMonth() / 3);
      return new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 3, 0)).toISOString().slice(0, 10);
    })();
    const linjerMedPlan = new Set();
    for (const l of planLines) if (maalFakturaer.has(l.i_id)) linjerMedPlan.add(l.cl_id);
    const manglendeLinjerPrKey = new Map();
    for (const row of alleFazileRader) {
      if (!(row.arsleie_nok > 0) || linjerMedPlan.has(row.linje_id)) continue;
      if (normalizeName(row.leietaker) === ONEPARK_LEIETAKER_KEY) continue;
      if (row.slutt_dato && row.slutt_dato <= kvartalSlutt) continue;
      if (row.start_dato && row.start_dato > "2026-12-31") continue;
      const key = leieforholdKey(row.leietaker, row.seksjon);
      if (!plan.has(key)) continue; // helt uten plan -> håndteres som "fazile-plan-mangler" under
      if (!manglendeLinjerPrKey.has(key)) manglendeLinjerPrKey.set(key, []);
      manglendeLinjerPrKey.get(key).push(row);
    }

    // Overlegg pr. byggGruppe.
    for (const [tKey, tenant] of tenantMap) {
      if (tKey === ONEPARK_LEIETAKER_KEY) continue; // manuelt estimat, se Onepark-blokken under
      for (const bg of tenant.byggGrupper) {
        if (!bg._key) continue; // synteiske rader (parkering uten Fazile-linje)
        const modellTotal = round2(bg.gjenstarDelA + bg.gjenstarDelB);
        bg.modellGjenstarTotal = modellTotal;
        const p = plan.get(bg._key);
        if (p) {
          plan.delete(bg._key);
          const planTotal = round2(p.delA + p.delB);
          bg.gjenstarDelA = round2(p.delA);
          bg.gjenstarDelB = round2(p.delB);
          bg.gjenstarTotal = planTotal;
          bg.gjenstarKilde = "fazile-fakturaplan";
          countPlanOverlagt++;
          sumPlanOverlagt = round2(sumPlanOverlagt + planTotal);
          const avvik = round2(planTotal - modellTotal);
          let notat = `Gjenstår = Fazile sin faktiske fakturaplan for resten av 2026 (${p.antall} fakturalinjer på konto 36xx som ikke er sendt til NXT pr. ${planCacheDato}): ${fmtKr(planTotal)} kr. Modellen (Fazile-årsverdi minus NXT-bokført) ga ${fmtKr(modellTotal)} kr, avvik ${fmtKr(avvik)} kr.`;
          if (p.gamlePerioder) notat += ` MERK: ${fmtKr(p.gamlePerioder)} kr av dette gjelder perioder før ${planStart} (tilbakedaterte/ubehandlede fakturautkast i Fazile) - sjekk at de faktisk skal sendes.`;
          if (p.ekstrapolert) notat += ` Herav ${fmtKr(p.ekstrapolert)} kr ekstrapolert for ${p.ekstrapolertMnd} måned${p.ekstrapolertMnd > 1 ? "er" : ""} Fazile ikke har generert månedsfaktura for ennå (siste planlagte måneds beløp videreført til årsslutt).`;
          const manglende = manglendeLinjerPrKey.get(bg._key);
          if (manglende) {
            notat += ` MERK: ${manglende.length} aktiv${manglende.length > 1 ? "e" : ""} kontraktslinje${manglende.length > 1 ? "r" : ""} har INGEN planlagt faktura i Fazile og er ikke med i beløpet: ${manglende.map((r) => `${r.beskrivelse || r.linjetype} (kontrakt ${r.kontrakt_id}, årsleie ${fmtKr(r.arsleie_nok)} kr, ${r.start_dato || "?"}..${r.slutt_dato || "løpende"})`).join("; ")} - sjekk om kontrakten er aktivert / skal faktureres.`;
            manglende.forEach((r) => delvisDekning.push({ leietaker: r.leietaker.trim(), bygg: r.seksjon, desc: r.beskrivelse, kontrakt: r.kontrakt_id, arsleie: r.arsleie_nok, periode: `${r.start_dato || "?"}..${r.slutt_dato || "løpende"}` }));
          }
          if (bg.status === "intern-mustad" || bg.status === "ikke-matchet-i-nxt") {
            bg.forklaring = bg.forklaring ? `${bg.forklaring} ${notat}` : notat;
          } else {
            bg.status = "ok";
            bg.forklaring = notat;
          }
        } else if (bg._frosset || modellTotal === 0) {
          bg.gjenstarKilde = "modell";
        } else if (modellTotal > FAKTURAPLAN_MANGLER_GRENSE) {
          // Modellen sier det gjenstår penger, men Fazile har ingen faktura igjen for året - kan
          // være en kontrakt som ikke er aktivert ennå (SIGNED, ikke ACTIVE), fakturering som er
          // stoppet manuelt, eller reelt ikke mer å fakturere. Beholdes (ikke nullstilt stille) med
          // egen status så Morten kan avgjøre.
          bg.gjenstarKilde = "modell";
          bg.status = "fazile-plan-mangler";
          const notat = `Fazile har INGEN planlagt faktura for dette leieforholdet for resten av 2026, men modellen (Fazile-årsverdi minus NXT-bokført) gir ${fmtKr(modellTotal)} kr gjenstår. Beholdt inntil videre - avgjør: kontrakt ikke aktivert i Fazile ennå (ingen faktura generert), fakturering stoppet, eller reelt ikke mer å fakturere (da skal beløpet ut av prognosen).`;
          bg.forklaring = bg.forklaring ? `${bg.forklaring} ${notat}` : notat;
          countPlanMangler++;
          sumPlanMangler = round2(sumPlanMangler + modellTotal);
        } else {
          // Småbeløp eller negativt modelltall, og ingen faktura igjen i Fazile: ingenting mer
          // kommer - gjenstår 0. Status/forklaring beholdes (negativt tall = forklart over-/
          // endringsfakturering, fortsatt nyttig kontekst), med tillegg om nullstillingen.
          bg.gjenstarKilde = "fazile-fakturaplan";
          bg.gjenstarDelA = 0;
          bg.gjenstarDelB = 0;
          bg.gjenstarTotal = 0;
          const notat = `Fazile har ingen planlagt faktura igjen for 2026 for dette leieforholdet - gjenstår satt til 0 (modellen ga ${fmtKr(modellTotal)} kr).`;
          bg.forklaring = bg.forklaring ? `${bg.forklaring} ${notat}` : notat;
          countNullstiltUtenPlan++;
          sumNullstiltUtenPlan = round2(sumNullstiltUtenPlan + modellTotal);
        }
      }
    }
    // Plan-linjer uten eksisterende byggGruppe (kontrakt opprettet etter siste rent_roll-uttrekk,
    // eller leieforhold som falt helt ut av modellen) - egne rader.
    for (const [key, p] of plan) {
      const tKey = normalizeName(p.leietaker);
      if (tKey === ONEPARK_LEIETAKER_KEY) continue;
      const planTotal = round2(p.delA + p.delB);
      if (planTotal === 0) continue;
      if (!tenantMap.has(tKey)) tenantMap.set(tKey, { navn: p.leietaker, byggGrupper: [], lines: [] });
      const erIntern = INTERN_MUSTAD_NAMES.has(tKey);
      tenantMap.get(tKey).byggGrupper.push({
        bygg: p.seksjon,
        fullArsverdi2026DelA: 0,
        fullArsverdi2026DelB: 0,
        alleredeFakturertDelA: 0,
        alleredeFakturertDelB: 0,
        kontoFordelingDelA: [],
        kontoFordelingDelB: [],
        gjenstarDelA: round2(p.delA),
        gjenstarDelB: round2(p.delB),
        gjenstarTotal: planTotal,
        modellGjenstarTotal: 0,
        gjenstarKilde: "fazile-fakturaplan",
        status: erIntern ? "intern-mustad" : "ok",
        forklaring: `Leieforholdet finnes ikke i rent_roll-uttrekket (kontrakt opprettet i Fazile etter uttrekket, eller ingen aktiv kontraktslinje på uttrekksdatoen) - gjenstår hentet direkte fra Fazile sin fakturaplan: ${p.antall} fakturalinjer på konto 36xx, ${fmtKr(planTotal)} kr.${p.gamlePerioder ? ` MERK: ${fmtKr(p.gamlePerioder)} kr gjelder perioder før ${planStart}.` : ""}${p.ekstrapolert ? ` Herav ${fmtKr(p.ekstrapolert)} kr ekstrapolert for ${p.ekstrapolertMnd} måned(er) uten generert månedsfaktura ennå.` : ""}`,
        _key: key,
      });
      countNyeGrupperFraPlan++;
      sumNyeGrupperFraPlan = round2(sumNyeGrupperFraPlan + planTotal);
    }
    fakturaplanInfo = {
      uttrekksdato: planMeta.uttrekksdato,
      nxtCacheDato: planCacheDato,
      planStart,
      antallFakturaer: maalFakturaer.size,
      sumPlan36xx: sumPlanTotal,
      antallLeieforholdMedPlan: countPlanOverlagt + countNyeGrupperFraPlan,
      antallPlanMangler: countPlanMangler,
      sumPlanMangler,
      gamlePerioderBelop: round2(gamlePerioder.reduce((s, g) => s + g.belop, 0)),
      ekstrapolertBelop: round2(ekstrapolerteLinjer.reduce((s, e) => s + e.belop, 0)),
      antallEkstrapolerteLinjer: ekstrapolerteLinjer.length,
    };
    console.log(
      `v13 Fazile-fakturaplan (uttrekk ${planMeta.uttrekksdato}, NXT-cache ${planCacheDato}, plan fra ${planStart}): ${maalFakturaer.size} fakturaer, ${fmtKr(sumPlanTotal)} kr på 36xx. ${countPlanOverlagt} leieforhold overlagt (${fmtKr(sumPlanOverlagt)} kr), ${countNyeGrupperFraPlan} nye rader (${fmtKr(sumNyeGrupperFraPlan)} kr), ${countPlanMangler} uten plan men modell > ${FAKTURAPLAN_MANGLER_GRENSE} kr (beholdt ${fmtKr(sumPlanMangler)} kr, status fazile-plan-mangler), ${countNullstiltUtenPlan} nullstilt uten plan (modell ${fmtKr(sumNullstiltUtenPlan)} kr).`,
    );
    if (planUtenKonto.length) console.log(`  ${planUtenKonto.length} plan-linjer uten kontokobling (hoppet over): ${fmtKr(planUtenKonto.reduce((s, x) => s + x.belop, 0))} kr`, planUtenKonto.slice(0, 10));
    if (planUtenLeieforhold.length) console.log(`  ${planUtenLeieforhold.length} plan-linjer uten leieforhold (hoppet over): ${fmtKr(planUtenLeieforhold.reduce((s, x) => s + x.belop, 0))} kr`, planUtenLeieforhold.slice(0, 20));
    if (gamlePerioder.length) {
      console.log(`  ${gamlePerioder.length} plan-linjer for perioder før ${planStart} (ubehandlede/tilbakedaterte utkast, regnet med): ${fmtKr(gamlePerioder.reduce((s, g) => s + g.belop, 0))} kr`);
      for (const g of gamlePerioder) console.log(`    ${g.leietaker} | ${g.bygg} | ${g.periode} | ${g.type}/${g.status} | ${g.desc} | ${fmtKr(g.belop)}`);
    }
    if (ekstrapolerteLinjer.length) {
      console.log(`  ${ekstrapolerteLinjer.length} månedsfakturerte linjer ekstrapolert til årsslutt (Fazile har ikke generert alle månedene ennå): ${fmtKr(ekstrapolerteLinjer.reduce((s, e) => s + e.belop, 0))} kr`);
      for (const e of ekstrapolerteLinjer.sort((a, b) => Math.abs(b.belop) - Math.abs(a.belop))) console.log(`    ${e.leietaker} | ${e.bygg} | ${e.desc} | siste planlagte ${e.sisteMnd}, +${e.mnd} mnd | ${fmtKr(e.belop)}`);
    }
    if (delvisDekning.length) {
      console.log(`  ${delvisDekning.length} aktive kontraktslinjer UTEN planlinje i leieforhold som ellers har plan (merket i forklaringen, IKKE lagt til):`);
      for (const d of delvisDekning.sort((a, b) => b.arsleie - a.arsleie)) console.log(`    ${d.leietaker} | ${d.bygg} | ${d.desc} | kontrakt ${d.kontrakt} | årsleie ${fmtKr(d.arsleie)} | ${d.periode}`);
    }
  } else {
    console.log("ADVARSEL: fant ikke fazile-fakturaplan/ - gjenstår beregnes KUN med årsverdi-modellen (v12-metodikk).");
  }

  // v12 opprydding - interne felt, skal aldri havne i det publiserte Redis-snapshotet.
  for (const tenant of tenantMap.values()) {
    for (const bg of tenant.byggGrupper) {
      for (const k of Object.keys(bg)) if (k.startsWith("_")) delete bg[k];
    }
  }
  console.log(
    `v12 Del B-pooling: ${countPooletLeietakere} leietakere poolet kundenummer-bredt, ${countParkeringUtenFazileLinje} med parkeringsbokføring uten Fazile-parkeringslinje (${sumParkeringUtenFazileLinje.toLocaleString("nb-NO")} kr, gjenstår 0), ${countDeltKundenummer} delte kundenumre.`,
  );

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
      // v2 (2026-08-30, Morten: "hvor får du fra at det er fakturert 9 mnok?") - fant og rettet
      // en reell dobbelttellingsfeil: dette feltet var tidligere satt til `alleredeFakturertOnepark`
      // (en ren KOPI av de 6 ekte byggenes egen alleredeFakturert-sum, brukt KUN som mellomregning
      // for gjenstarDelB under) - men siden leietaker-tabellen (buildLeietakerMap() i
      // build-tenant-forecast-table.js) summerer alleredeFakturertDelA/DelB på tvers av ALLE
      // byggGrupper for en leietaker, ble Onepark sitt "Fakturert"-tall dermed dobbelt opp
      // (4 622 785 kr ekte + 4 622 785 kr kopi = 9 245 570 kr vist i UI). Nullstilt her - selve
      // gjenstarDelB-utregningen under er uendret/uavhengig av dette feltet.
      alleredeFakturertDelA: 0,
      alleredeFakturertDelB: 0,
      gjenstarDelA: 0,
      gjenstarDelB: oneparkKorreksjon,
      gjenstarTotal: oneparkKorreksjon,
      status: "forklart-parkering-onepark",
      forklaring: `Onepark-parkering faktureres etter omsetningsrapport, utenfor vanlig Fazile-kontrakt (derfor "avsluttet" på de 6 byggene over). Årsestimat fra Inntektsprognose-arket: ${ONEPARK_ESTIMAT_2026.toLocaleString("nb-NO")} kr, minus allerede fakturert i NXT i år (${alleredeFakturertOnepark.toLocaleString("nb-NO")} kr, se de 6 byggene over) = ${oneparkKorreksjon.toLocaleString("nb-NO")} kr gjenstår. Lagt til Del B som ett samlet tillegg, ikke bygg-fordelt.`,
    });
  } else {
    console.log('ADVARSEL: fant ikke "Onepark AS" i leieforhold-datasettet - Onepark-korreksjonen ble IKKE lagt til.');
  }

  // v12: REMAINING-totalene beregnes fra de ENDELIGE byggGruppene (etter pooling, Head-merge og
  // Onepark) - v11 justerte gruppene uten å oppdatere sumTotalDelA/B (latent avvik mot summen av
  // radene). Onepark-tillegget ligger allerede i sin egen gruppe, så ingen separat += lenger.
  sumTotalDelA = 0;
  sumTotalDelB = 0;
  for (const tenant of tenantMap.values()) {
    for (const bg of tenant.byggGrupper) {
      sumTotalDelA = round2(sumTotalDelA + bg.gjenstarDelA);
      sumTotalDelB = round2(sumTotalDelB + bg.gjenstarDelB);
    }
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
    sistOppdatert: fakturaplanInfo ? fakturaplanInfo.uttrekksdato : "2026-08-26",
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
      // v13 - kreditnotaer for avregningen bokført på 3630 som er lagt tilbake i "allerede fakturert"
      kreditnotaerPaa3630Noytralisert: sumAvregning3630Noytralisert,
      antallKreditnotaerPaa3630Noytralisert: countAvregning3630Noytralisert,
    },
    // v13 - metadata om fakturaplan-kilden (null hvis mappen manglet og modellen ble brukt alene)
    fazileFakturaplan: fakturaplanInfo,
  };

  console.log(`Leieforhold: ${leieforhold.size} (matchet=${countMatched}, ikke matchet=${countUnmatched})`);
  console.log(`  hvorav matchet via kundenummer-ID (primær metode, v3): ${countMatchedViaCustomerNo}`);
  console.log(`  hvorav matchet via kjerne-navn-fallback (stavevariant AS/A/S osv.): ${countMatchedViaCoreName}`);
  console.log(`  hvorav matchet via FAZILE_TO_NXT_ALIASES (suffiks/kortnavn NXT mangler): ${countMatchedViaAlias}`);
  console.log(`  hvorav USIKKER (flere kontrakter med ulikt nxtCustomerNo - falt tilbake til navnematching): ${countUsikkerFlereKontrakter}`);
  console.log(`Avsluttede kontrakter nullstilt: ${countAvsluttet}`);
  console.log(`Intern Mustad (ikke reelt leieforhold): ${countInternMustad}`);
  console.log(`Flagget "ikke matchet i NXT" (ny kontrakt eller navnematch-feil - sjekk manuelt): ${countIkkeMatchetFlagget}`);
  console.log(`Forklart fakturering utsatt til senere år (first_invoice_date > 2026): ${countFaktureringUtsatt}`);
  console.log(`Forklart draft-kontrakt (ikke signert/aktiv ennå): ${countDraftKontrakt}`);
  console.log(`Forklart omsetningsleie (CC Vest): ${countOmsetning}`);
  console.log(`Forklart kontraktsendring/indeksregulering: ${countKontraktsendring}`);
  console.log(`Onepark-parkeringskorreksjon lagt til Del B: ${oneparkKorreksjon.toLocaleString("nb-NO")} kr`);
  console.log(
    `Omsetningsavregning 2025 (konto 3632) ekskludert fra leietaker-gjenstår: avsetning/reversering (Andre, ingen leietakerreferanse) ${sumOmsetningsavregning2025Avsetning.toLocaleString("nb-NO")} kr, fordelt til reelle leietakere ${sumOmsetningsavregning2025Fordelt.toLocaleString("nb-NO")} kr, nettoeffekt på 2026-bokføringen ${round2(sumOmsetningsavregning2025Avsetning + sumOmsetningsavregning2025Fordelt).toLocaleString("nb-NO")} kr.`,
  );
  console.log(
    `v13 3630/3632-paring: ${countAvregning3630Noytralisert} kreditnotaer for 2025-avregningen på konto 3630 nøytralisert (lagt tilbake i fakturert): ${sumAvregning3630Noytralisert.toLocaleString("nb-NO")} kr.`,
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
