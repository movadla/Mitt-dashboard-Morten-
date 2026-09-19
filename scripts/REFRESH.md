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
de leser kun det som allerede ligger som JSON/Excel i den mappen. Å hente FERSK rådata kan IKKE
automatiseres i et script - det krever Claude sin interaktive Fazile/NXT MCP-tilkobling. Be Claude
følge oppskriften i:
- `scripts/refresh-fazile-remaining-tenants.js` (Fazile rent_roll for gjenstår)
- `scripts/refresh-nxt-booked-tenants.js` (NXT bokført pr. leietaker) - inkluderer nå steg 1b:
  møterom-/auditoriedetalj (`nxt-moterom-detalj/`), FAST del av samme oppskrift, se filhodet
- `scripts/refresh-fazile-kontrakt-crosswalk.js` (kontrakt_id → NXT customerNo)

Se ellers de enkelte byggeskriptenes filhoder for hvilken rå-fil hvert av dem forventer.

### Onepark-estimatet MÅ oppdateres når nye omsetningsrapporter kommer

Onepark-raden (4 729 150 kr pr. 2026-09-11) er ikke et leieforhold, men et **estimat** for
parkeringsinntekt for resten av året, for hele porteføljen samlet og ikke fordelt på bygg. Morten
bekreftet 2026-09-11 at estimatet er kontrollert og skal stå - men det er tidsavhengig: full
årsverdi er satt til 9 457 370 kr, hvorav halvparten faktisk er fakturert fordelt på seks bygg, og
resten forutsetter at andre halvår kommer inn på omtrent samme nivå.

**Når nye omsetningsrapporter fra Onepark foreligger, skal estimatet erstattes med reelle tall.**
Gjøres ikke det, er dette den største enkeltposten i prognosen som ingen lenger ser på - den er
merket "avklart" i Leieforhold til gjennomgang og dukker derfor ikke opp i arbeidslista av seg selv.
Det er et bevisst valg (den skal ikke utfordres ved hver gjennomgang), men det flytter ansvaret hit.

## Etter du kjører: lim inn de hardkodede konstantene

`npm run refresh:income-forecast` oppdaterer KUN Redis-snapshotene (drilldown-blokkene i
Tillegg-fanen). Selve hovedprognosen (KpiStrip/toppboksen) bruker i tillegg noen konstanter limt
inn for hånd i `lib/incomeForecast.local.ts`/`.anon.ts` (`REMAINING`, `BOOKED_3600_3699`,
`INVOICED`, `RECONCILIATION`) - byggeskriptenes konsoll-output sier eksplisitt hva som skal limes
inn ("REMAINING-aggregat (lim inn i ...)"). **Glemmes dette steget, viser toppen av siden et
gammelt tall mens detaljene under viser et nytt** - appen varsler nå om akkurat dette
(SyncVarsel, øverst på Prognose-fanen, vises kun når de faktisk er ute av synk).

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

## Åpne punkter til manuell avklaring (Morten/Finance)

Data-kvalitetsspørsmål funnet 2026-09-07 som IKKE kan avgjøres fra dataene alene - de krever at
noen som kjenner de faktiske avtalene/bokføringen tar stilling. Ingen av dem er kodefeil.

- [ ] **Leietaker bokført på uventet bygg (3 tilfeller).** Funnet ved gjennomgangen av NXT-
      koblingen (v25). Statkraft-tilfellet er avklart av Morten (leier reelt i både Lilleakerveien
      6 og 4E - byggene henger sammen), disse tre står igjen:
      1. *Oslo Kommune Bydel 6 Ullern* er bokført spredt på fire ikke-relaterte bygg (Mustads vei 1,
         Sponhoggveien 2, Lilleakerveien 24C, Lilleakerveien 2E) - reelle separate leieforhold, eller
         feilført kundenummer?
      2. *Lilleakerveien 14 AS*: Mustad Eiendom AS står bokført som "leietaker" på eget bygg (bygg 14
         og 614), med flere konto/kunde-kombinasjoner speilvendt mellom de to - ser ut som en
         ompostering, bør bekreftes.
      3. *Strandveien 4-8 AS*: kundenr 21099 "Strandveien 20 AS" (et annet Mustad-selskap) står som
         leietaker der, og "Vedeld AS" opptrer både i Strandveien 10 AS og med en tilsvarende linje i
         Strandveien 4-8 AS - intercompany-leie eller feilføring?
- [ ] **344 685 kr forskjell mellom leietakertabellens fakturert og BOOKED_3600_3699.** Etter at
      leietaker-grupperingen ble avstemt mot bygg-grupperingen (v28) er dette det ENESTE som står
      igjen mellom seksjonskortene på Prognose-fanen (Leieinntekter 660 940 143 + Parkering
      59 286 809 = 720 226 952 kr) og toppboksen (bokført + gjenstår + reforhandling =
      719 882 267 kr). De to sidene kommer fra to ulike NXT-uttrekk: `accountingTransaction` pr.
      leietaker (tabellen) mot `generalLedgerPeriodBalance` for kontoserien (toppboksen). Avviket
      er 0,06 % og falt fra 40,2 mill etter v25-fiksen av kundekoblingen, men er ikke forklart
      linje for linje. Verdt en avstemming mot hovedbok før tallene brukes eksternt.
- [ ] **1,6 mill kr beholdt vs. 3,1 mill kr nullstilt på skjønn (v13-mekanismen).** Der Fazile ikke
      har planlagt faktura for resten av året, men modellen sier det gjenstår penger, gjør
      `build-remaining-summary.js` to motsatte skjønnsvurderinger avhengig av beløpsgrensen
      (`FAKTURAPLAN_MANGLER_GRENSE`, 5 000 kr): 15 leieforhold BEHOLDT modelltallet (1 630 338 kr,
      status `fazile-plan-mangler`, synlig i "Leieforhold til gjennomgang"), mens 75 ble NULLSTILT
      (−3 103 083 kr). Verdt en stikkprøve på begge sider: er de beholdte reelt fakturerbare, og er
      de nullstilte reelt ferdig fakturert / avsluttet?
