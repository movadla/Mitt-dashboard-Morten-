// Henter/oppdaterer RÅDATAEN i scripts/refresh-data/fazile-remaining-tenants/ som
// scripts/build-remaining-summary.js bruker til å beregne "Gjenstår å fakturere"
// (REMAINING i lib/incomeForecast.local.ts/.anon.ts) og "Gjenstår per leietaker (Fazile)".
//
// DETTE SCRIPTET GJØR IKKE SELVE BEREGNINGEN LENGER (endret 2026-08-24) - kun
// datahentings-STEGENE under er fortsatt gyldige. Selve beregningslogikken (full
// 2026-verdi minus allerede fakturert i NXT, leieforhold-nivå) ligger i
// scripts/build-remaining-summary.js, som leser rådataene denne prosessen produserer.
//
// Fazile-delen av datahentingen kan IKKE automatiseres i et script - den krever Claude sin
// interaktive MCP-tilkobling (rent_roll-verktøyet, se claude_ai_Fazile_intern). Når Morten ber om
// et nytt øyeblikksbilde:
//
// 1. Hent property-listen: fazile_graphql_query mot `properties` (first:100, filter removed_at
//    isNull) for å få full liste over eiendommer (endres sjelden - se scripts/refresh-data/
//    fazile-remaining-tenants/properties.json for forrige gang sin liste).
//
// 2. For HVER eiendom (55 stk sist gang, hold av tid - dette er en treg, sekvensiell runde):
//    kall rent_roll({ eiendom: "<navn>", max_linjer: 500 }) og lagre "rows" (IKKE "chart" -
//    den dupliserer rows unødvendig og sprenger svarstørrelsen for store eiendommer).
//    - aktiv_dato brukes IKKE eksplisitt (default = i dag) - vi vil ha kontraktslinjer som er
//      aktive NÅ. build-remaining-summary.js beregner selv full 2026-verdi ut fra
//      start_dato/slutt_dato på hver linje.
//    - default inkluder_typer (alle linjetyper) brukes, men i praksis returnerer verktøyet KUN
//      type=RENT for Mustad sine data (COMMON_COSTS/CUSTOM-typer for felleskostnader/energi/
//      eiendomsskatt faller strukturelt utenfor rent_roll - se
//      memory/project_income-forecast-fazile-remaining-tenants-2026-08-24.md).
//    - Hvis responsen blir for stor (skjer for eiendommer med >~30-40 linjer), blir den lagret
//      til fil automatisk av verktøyet - bruk Bash+node til å trekke ut kun `data.rows` derfra
//      i stedet for å lese hele filen inn i kontekst.
//
// 3. VIKTIG KJENT BUG: Fazile sitt rent_roll-verktøy halverer IKKE "Strandveien 4-8_E" korrekt
//    (eierandel vises som 1, ikke 0.5, trolig fordi property-navnet mangler det doble
//    mellomrommet ("Strandveien  4-8_E") som 50%-eierskapslisten i fazile_schema_guide bruker).
//    "Strandveien 10_E" og "Lilleakerveien 20-22_E" halveres KORREKT av verktøyet selv.
//    scripts/build-remaining-summary.js korrigerer Strandveien 4-8 manuelt
//    (STRANDVEIEN_4_8_MANUAL_HALVING) - sjekk om Fazile har fikset bugen før du kjører på
//    nytt (søk etter "eierandel": 0.5 i rådata for Strandveien 4-8 - hvis den nå viser 0.5
//    automatisk, FJERN den manuelle korreksjonen i build-remaining-summary.js).
//
// 4. Skriv resultatet til scripts/refresh-data/fazile-remaining-tenants/<eiendom-slug>.json som
//    en flat liste av rows (samme feltnavn som verktøyet returnerer: eiendom, seksjon, leietaker,
//    kontrakt_id, linje_id, linjetype, beskrivelse, arsleie_nok, start_dato, slutt_dato).
//
// 5. Oppdater scripts/refresh-data/fazile-remaining-tenants/meta.json:
//    { "sistOppdatert": "YYYY-MM-DD" } - dokumentasjon, brukes ikke i selve beregningen lenger
//    (build-remaining-summary.js bruker alltid kalenderåret 2026 i sin helhet, ikke "resten av
//    året fra i dag" - se dens egen header-kommentar for hvorfor metodikken endret seg).
//
// 6. Kjør deretter, i rekkefølge:
//      node scripts/refresh-nxt-booked-tenants.js   (se dens egen header for eierandel-steget)
//      node scripts/build-remaining-summary.js       (selve beregningen + Redis-push)
