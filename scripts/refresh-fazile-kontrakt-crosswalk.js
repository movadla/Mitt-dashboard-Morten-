// Bygger scripts/refresh-data/fazile-kontrakt-customerno-crosswalk.json - en pålitelig
// kontrakt_id -> NXT customerNo-kobling, som ERSTATTER navnematching (eksakt/kjernenavn/
// FAZILE_TO_NXT_ALIASES) som primær matching-mekanisme i build-remaining-summary.js.
//
// BAKGRUNN (2026-08-26): navnematching mellom Fazile og NXT er strukturelt upålitelig - samme
// leietaker kan hete tre forskjellige ting på tvers av Fazile sin `customer`-tabell, Fazile sin
// `invoice_receiver`-tabell, og NXT sin associate-post (bekreftet konkret for OHLA). Morten
// påpekte at det SKAL finnes en ordentlig kundenummer-kobling - funnet og verifisert:
// `customer.erp_code` (Fazile) === NXT sin `customerNo`, eksakt, for alle sjekkede tilfeller
// (Statkraft 10300, Reitan 10147, OHLA 10627, Quantafuel 10597, m.fl.). `invoice_receiver.
// customer_number` gir SAMME verdi men med kraftig radduplisering (opptil 70+ rader pr. kunde)
// og av og til en foreldet/feil ekstra-verdi (sett for customer_id 101620: både "10" og
// "1002032" - "1002032" er den korrekte, "10" er stale) - bruk derfor ALLTID `customer.erp_code`
// direkte, ikke `invoice_receiver`.
//
// DETTE SCRIPTET GJØR IKKE SELVE DATAHENTINGEN (samme mønster som de andre refresh-*.js -
// Fazile/NXT-tilgang går via Claude sin interaktive MCP-tilkobling). Når Morten ber om et nytt
// øyeblikksbilde:
//
// 1. Trekk ut alle distinkte `kontrakt_id` fra
//    scripts/refresh-data/fazile-remaining-tenants/*.json (918 stk pr. 2026-08-26).
// 2. Batch-spør `contract_customers` for å finne hovedleietaker pr. kontrakt:
//      query { contract_customers(filter: {
//        contract_id: { in: [/* MAKS 20-25 ID-er pr. kall - se punkt 5 */] }
//        main: { eq: true }
//        customer_type: { eq: "TENANT" }
//      }) { items { contract_id customer_id } } }
//    -> gir kontrakt_id -> customer_id. Skal gi 100% dekning (bekreftet 2026-08-26: 918/918).
// 3. Trekk ut distinkte `customer_id` fra steg 2, batch-spør `customers` for erp_code:
//      query { customers(filter: { c_id: { in: [/* maks 20-25 */] } }) {
//        items { c_id erp_code } } }
//    -> gir customer_id -> nxtCustomerNo (erp_code). IKKE bruk `invoice_receivers` her - se
//    BAKGRUNN over for hvorfor.
// 4. INTEGRITETSSJEKK: se etter mistenkelig KORTE erp_code-verdier (<=2 tegn) - normale
//    NXT-customerNo er 5-7 siffer (10xxx/11xxx/20xxx/31xxx/1000xxx/1002xxx-mønstre observert).
//    Fant 2026-08-26: én liten enkeltpersonforetak-lignende leietaker hadde erp_code "11" -
//    åpenbart en feilregistrering i Fazile sin masterdata, IKKE en reell NXT-kobling. Fjern slike
//    fra crosswalken (la den falle tilbake til navnematching i stedet) - ikke stol blindt på tall.
// 5. VIKTIG - "in"-filter-grense: Fabric GraphQL-endepunktet takler batcher på 20-25 ID-er pr.
//    kall pålitelig. Større batcher (testet 50 og 100) feiler med en uklar
//    "Syntax Error: Expected Name, found ')'" som IKKE er en reell syntaksfeil i spørringen -
//    det er en server-/transport-begrensning. Ikke bruk `first` for å kompensere - selve
//    IN-listens LENGDE er det som avgjør, ikke antall rader i svaret.
// 6. Slå sammen steg 2+3 til kontrakt_id -> nxtCustomerNo, skriv til
//    scripts/refresh-data/fazile-kontrakt-customerno-crosswalk.json med formatet:
//      { "sistOppdatert": "YYYY-MM-DD", "antallKontrakter": N,
//        "kontraktIdTilNxtCustomerNo": { "<kontrakt_id>": "<nxtCustomerNo>", ... } }
//
// customerNo er kun unikt INNENFOR ett NXT-selskap - denne fila alene er IKKE nok til å slå opp
// riktig bokføring. build-remaining-summary.js kombinerer denne med eiendom/bygg -> NXT-selskap
// (utledet fra hvilken av de 9 filene i scripts/refresh-data/nxt-booked-tenants/ som har
// byggnavnet i sin `buildings`-liste) for å bygge nøkkelen `selskap||customerNo`.
//
// Kjør: ingen kjørbar del i dette scriptet (kun dokumentasjon) - filen bygges av Claude direkte
// via MCP-kall og skrives med node -e / Write, se historikk i git for eksempel.
