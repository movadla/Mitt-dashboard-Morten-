# Oppdatere Inntektsprognose-dataene

Ikke en live-integrasjon - dataene bygges fra rå Fazile/NXT/Excel-uttrekk og pushes til Redis
manuelt, "ved forespørsel" (se undertittelen på Inntektsprognose-siden). Denne filen er
oppskriften for å gjøre det riktig.

## Vanlig kjøring

```
npm run refresh:income-forecast
```

Kjører alle åtte `build-*.js`-scriptene i riktig rekkefølge (se `scripts/refresh-income-forecast.js`
sitt filhode for hele avhengighetsgrafen) og **stopper på første feil** - inkludert
kontrollsum-sjekkene (`verifyTotal()`) i `build-remaining-summary.js` og `build-tenant-budget.js`.
Fortsetter aldri til et senere script hvis et tidligere feilet, siden det ville bygget videre på et
ufullstendig eller foreldet Redis-resultat uten at det er synlig i UI-en.

## Rekkefølgen, og hvorfor

`build-tenant-forecast-table.js` leser BÅDE `build-remaining-summary.js` sitt resultat OG
`build-tenant-budget.js` sitt - må derfor kjøres etter begge. `build-tenant-budget.js`,
`build-contract-expiry-2026.js` og `build-omsetningsavregning.js` leser kun
`build-remaining-summary.js` sitt resultat. `build-nxt-budget.js`, `build-tenant-signals.js` og
`build-vacant-areas.js` er uavhengige. Kjør ALDRI et enkelt script isolert med mindre du vet at
det ikke leser noe fra Redis som allerede er utdatert - orkestreringsscriptet er den trygge
default.

## Før du kjører

Rå-uttrekksfilene i `scripts/refresh-data/` (Fazile rent_roll, NXT booked-tenants, Excel-budsjett
osv.) må være ferske FØR du kjører - byggeskriptene selv henter ikke noe live fra Fazile/NXT-API-et,
de leser kun det som allerede ligger som JSON/Excel i den mappen. Se de enkelte scriptenes
filhoder for hvilken rå-fil hvert av dem forventer.

## Hvis et script feiler

- **verifyTotal()-feil** (kontrollsum-avvik i steg 1 eller 2): sjekk om rå-uttrekksfilen er
  korrupt/avkuttet, eller om matchingen faktisk har regredert (mange flere leieforhold enn normalt
  havner uten treff). IKKE øk toleransen for å få scriptet til å gå gjennom uten å forstå hvorfor
  avviket oppsto.
- **Manglende Redis-nøkkel** ("Fant ikke snapshot i Redis"): et tidligere steg i rekkefølgen ble
  aldri kjørt, eller feilet stille utenfor orkestreringsscriptet (f.eks. kjørt enkeltvis manuelt).
  Kjør `npm run refresh:income-forecast` fra toppen.

## Live varsler etter en kjøring

Data-kvalitetsvarsler (manglende linjer, uklare koblinger osv.) havner nå i snapshotenes
`advarsler`-felt og vises som "Live varsler" i avstemmingspanelet (Tillegg-fanen) - ikke bare i
konsollen. Sjekk den seksjonen etter hver kjøring, ikke bare at scriptene kjørte til slutten uten å
kaste feil.

## Manuelt arbeid overlever en refresh, men lever KUN i Redis

Leietakerkommentarer, "mine manuelle linjer", potensial-kategorier og reforhandlingssignaler
overskrives ALDRI av `npm run refresh:income-forecast` (de ligger i egne Redis-nøkler
byggeskriptene ikke rører). De er derimot ikke re-utledbare fra Fazile/NXT hvis Redis-instansen
mistes - se `/api/income-forecast/backup` for en JSON-eksport av alt manuelt innhold, og ta en
kopi av og til.
