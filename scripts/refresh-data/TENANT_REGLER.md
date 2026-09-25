# Inntektsprognose — regelverk og leietaker-fakta

Denne filen samler ALT vi har lært om Inntektsprognose-pipelinen på tvers av
mange måneders arbeid (2026-08 til 2026-09), slik at neste store hendelse —
oppsett av **2027-prognosen** — kan starte fra dette i stedet for å
gjenoppdage hver regel fra bunnen via nye Fazile/NXT-undersøkelser.

**Les denne FØR du starter noe arbeid på 2027-prognosen.** Oppdater den
fortløpende når nye regler/fakta oppdages — ikke la den bli utdatert slik
minnefilene alene lett blir.

Kronologisk endringslogg (hva som ble bygget når) finnes i
`docs/inntektsprognose-endringslogg.md` — denne filen dupliserer ikke den
historien, men refererer til den der det er nyttig.
**MERK (funnet ved runde 2 av pipeline-revisjonen, 2026-09-25): den
endringsloggen er IKKE lenger levende** — siste reelle oppføring er v27
(2026-09-07), mens denne filen og selve pipelinen står på v76 (2026-09-25).
~46 versjoner (inkl. hele v48-mekanismen og hele denne ukens revisjon) er
udokumentert der. Ingen kommentar i den filen sier at vedlikehold bevisst
ble stanset — den ble rett og slett glemt. Denne filen (TENANT_REGLER.md)
er det som faktisk har blitt den levende referansen siden da. Avklar med
Morten om endringsloggen skal gjenopplives eller formelt legges ned før
2027 (ikke avgjort her).

## 0. Anonymisering — les dette først

- Denne filen er COMMITTET og PUSHET til GitHub. Ekte **selskapsnavn** er
  akseptert her (samme praksis som `EXCEL_TO_FAZILE_ALIASES` i
  `build-tenant-budget.js`, som allerede har dusinvis av selskapsnavn).
- Ekte **privatpersonnavn skal ALDRI stå i denne filen** — verken som
  leietaker, alias eller i en forklarende kommentar. De lever kun i
  gitignorede filer (`_private-tenant-aliases.json`,
  `_private-fazile-to-nxt-aliases.json`, `_private-konsern-grupper.json`
  m.fl., se seksjon 8). Denne regelen er brutt to ganger tidligere ved et
  uhell (et privatpersonnavn i en `forklaring`-streng i
  `build-remaining-summary.js`, og selskapsnavn i "hvorfor"-kommentarer i
  flere filer) — grep for navnet UMIDDELBART etter å ha skrevet en ny
  forklarende streng, ikke bare som én sweep til slutt.
- Kontonumre lagres/skrives aldri.
- `scripts/refresh-data/*.json/.txt/.tsv/.csv` og alle undermapper er
  gitignored — men `.md`- og `.js`-filer direkte i `scripts/refresh-data/`
  (som denne filen, README.md og `assemble-nxt-booked-tenants.js`) er
  IKKE gitignored og blir committet som normalt.
- **KRITISK, uløst (funnet ved runde 2 av pipeline-revisjonen, 2026-09-25)**:
  commit `b18762e` ("Inntektsprognose: to alias-mal rettet etter
  v48-fiksen"), allerede pushet til GitHub, har en ekte privatpersons
  fulle navn skrevet ut flere ganger I SELVE COMMIT-MELDINGEN (koden selv
  var korrekt — navnet ble riktig holdt ute og lagt i en gitignored
  `_private-*.json`-fil). Commit-meldinger er like permanente/pushede som
  kode, og retting krever historikk-omskriving (`git rebase`/
  `filter-repo`), som er eksplisitt underlagt CLAUDE.md sin
  sikkerhetsregel om å alltid spørre om bekreftelse først — et tidligere,
  urelatert forsøk på nettopp dette ble i tillegg blokkert av Claude
  Code sin egen plattform-klassifiserer ("Git Destructive"). **Ingen
  handling gjort her ennå — krever Mortens eksplisitte beslutning om
  hvordan (om i det hele tatt) historikken skal ryddes.**

## 0.1 To verktøy som gjør denne filen sjekkbar, ikke bare lesbar (2026-09-23, utvidet 2026-09-25)

- **`node scripts/check-override-freshness.js [--ar=2027]`** — leser `@override`-tagger rett
  etter hver override-definisjon i de **seks** committede pipeline-scriptene (utvidet fra fire
  2026-09-25: `build-omsetningsavregning.js` og `refresh-fazile-kontrakt-crosswalk.js` var tidligere
  ALDRI skannet - ingen aktive tagger der i dag, men `build-omsetningsavregning.js` skal få en ekte
  2026-avregning bygget for 2027, se seksjon 2/3, og ville da fått en tagg dette verktøyet aldri så)
  og `_bekreftetForAr`-feltet i hver gitignoret `_private-*.json`-fil, og lister konkret hva som
  IKKE er bekreftet for målåret ennå, pluss det som uansett MÅ bygges/rettes
  (`status=todo`-tagger). Kjør denne FØRST når 2027-prognosen settes opp - den er den faktiske,
  maskinsjekkbare versjonen av seksjon 3 under. Rent tekst-skann, kjører ALDRI noen kode fra
  build-scriptene. Fanger nå også (2026-09-25) linjer som inneholder `@override` men IKKE matcher
  det strenge tag-formatet (f.eks. feil feltrekkefølge) - disse forsvant tidligere 100% stille.
- **`node scripts/verify-income-forecast.js`** — kjøres ETTER hele pipelinen. Fanger opp: (1) at
  REMAINING/BOOKED_3600_3699/INVOICED-konstantene i `lib/incomeForecast.local.ts`/`.anon.ts`
  faktisk stemmer med det som ligger i Redis akkurat nå (den klart vanligste "glemt å lime inn på
  nytt"-feilen denne høsten), (2) at build-tenant-forecast-table.js faktisk er kjørt på nytt etter
  siste build-remaining-summary.js-kjøring, (3) ferskheten til Omsetningsavregning- og
  Kontraktsutløp-2026-satellittsnapshottene (lagt til 2026-09-25 - kun ferskhet, ikke en full
  finansiell kryssjekk, se seksjon 1 for hvorfor de trengte dette), (4) informativt: leieforhold
  med budsjett men ~0 kr fakturert+gjenstår, og stort negativt gjenstår uten forklaringstekst.
  Exit code 1 ved reelt avvik. `sumField()` stripper nå (2026-09-25) `//`-linjekommentarer før
  summering og validerer forventet antall treff — fanget en reell (demonstrert, ikke bare
  teoretisk) sårbarhet der en kommentar med "feltnavn: tall"-mønster ble summert inn ved en
  feiltakelse.

Legg til en `@override`-tag (se eksisterende for mønster) eller et `_bekreftetForAr`-felt når du
lager en NY tidsbestemt override, ellers blir den usynlig for `check-override-freshness.js`.

## 0.2 Anonymisering av leietakernavn i prod/`/dele` — funnet ved runde 2 (2026-09-25)

`lib/tenantAnonymize.ts` (`withProdAnonymization()`) er den delte vakten som anonymiserer
privatperson-leietakernavn i produksjon/`/dele` (se ANONYMISERING.md). Runde 2 av
pipeline-revisjonen fant og rettet **fire** steder der ekte navn lekket gjennom uendret:

1. `avstemmingMotNxt.ikkeKonsumertNxt.storste[].navn`
   (`lib/incomeForecastRemainingTenants.ts`) — glemt i `anonymizeSnapshot()` selv om resten av
   snapshotet ble anonymisert. Rettet.
2. `lib/incomeForecastReviewMarks.ts` (Morten sine vurderinger av leieforhold) — manglet
   anonymisering HELT, sto likevel på `/dele` sin `DELE_TILLATTE_GET_API`-liste. Rettet
   (`leietaker`-feltet anonymiseres nå; `notat` er fritekst og IKKE anonymisert, se punkt under).
3. `app/api/income-forecast/tenant-comments` sin GET (`lib/tenantForecastComments.ts`) — returnerte
   et kart med EKTE leietakernavn som nøkkel uansett miljø. Rettet med en ny, egen
   `getTenantForecastCommentsForApi()` som anonymiserer nøkkelen i prod — den opprinnelige
   `getTenantForecastComments()`/`-Authors()` MÅ forbli rå, siden `lib/tenantForecastTable.ts`
   kobler kommentarer inn på ekte navn FØR sin egen anonymisering, og
   `app/api/income-forecast/backup` (Redis-only disaster-recovery-eksport) også trenger ekte data.
4. `lib/incomeForecastManual.ts` (manuelle inntektslinjer) — samme mønster. Rettet med en egen
   `getManualIncomeLinesForApi()` (anonymiserer `selskap`-feltet) brukt KUN av
   `app/api/income-forecast/manual-lines` sin GET — `getManualIncomeLines()` selv MÅ forbli rå,
   siden den også brukes av `lib/backup.ts` (den CRON_SECRET-autoriserte `/api/backup`, en reell
   katastrofe-sikring av EKTE data som kjører i produksjon).

**Mønster å huske ved en FREMTIDIG ny Redis-only-getter i denne pipelinen**: sjekk ALLTID om (a)
en API-rute eksponerer resultatet direkte til klienten (spesielt om ruten står på `/dele`-listen i
`middleware.ts`) og (b) om en backup-/eksport-rute (`lib/backup.ts`, `app/api/income-forecast/
backup`) trenger RÅ data fra samme getter — disse to kravene kan motsi hverandre, og løsningen er
da to separate eksporterte funksjoner (rå + en `-ForApi()`-variant), ikke én funksjon med en
miljøsjekk inni.

**IKKE rettet, kjent restrisiko (fritekst kan ikke pålitelig maskeres)**: `ReviewMark.notat`,
`TenantForecastComment.kommentar` (Mortens/Claudes egne analysekommentarer),
`ManualIncomeLine.beskrivelse`, og `OmsetningsavregningButikk.kommentar`
(`lib/omsetningsavregning.ts`) er alle frie tekstfelt som i teorien kan nevne et leietakernavn i
selve teksten — ingen av dem anonymiseres. Kun `LEDIG_AUTO_KOMMENTAR_PREFIX`-den autogenererte
Ledig-kommentaren i `lib/tenantForecastTable.ts`, bygges korrekt på nytt fra anonymiserte poster.

**Åpent, arkitektonisk spørsmål til Morten, IKKE avgjort her**: anonymisering styres utelukkende av
`NODE_ENV === "production"`, uavhengig av om forespørselen kom fra Morten sin egen `auth`-cookie
eller en ekstern `/dele`-bruker sin `dele_auth`-cookie — begge kjører mot samme produksjons-Vercel-
instans. Det betyr at Morten selv, hvis han bruker `/dele`-lenken (eller besøker produksjons-URL-en
uten den vanlige lokale tunnelen), ville sett "Demokunde NNNN" i stedet for ekte navn i de fem
anonymiserte snapshotene — mens de fire lekkasjene over (før denne rettingen) samtidig viste ekte
navn til akkurat samme `/dele`-bruker. Om `/dele` er ment å vise ekte tall til en navngitt kollega,
løser IKKE dagens NODE_ENV-baserte vakt det for privatperson-leietakere. Ikke endret her — krever
en bevisst beslutning (f.eks. en cookie-basert i stedet for miljø-basert vakt) fra Morten.

## 0.3 Øvrige mindre kodefiks — runde 2 (2026-09-25)

- To Excel-eksport-ruter (`contract-expiry-2026/export`, `remaining-tenants/export`) manglet fra
  `middleware.ts` sin `DELE_TILLATTE_GET_API` — "Eksporter til Excel"-knappene ville feilet stille
  for en `/dele`-bruker. Begge er trygge GET-er (går via de anonymiserende snapshot-getterne).
  Lagt til.
- `lib/incomeForecastBookedTenants.ts` brukte en egen
  `if (NODE_ENV === "production")`-sjekk i stedet for den delte `withProdAnonymization()`-vakten —
  funksjonelt likt, men usikret mot fremtidige endringer i vakten selv. Rettet.
- `app/api/income-forecast/manual-lines/[id]/route.ts` sin PATCH returnerte 500 på ALLE feil,
  inkl. vanlige valideringsfeil (manglende beskrivelse/selskap/bygg/konto) som søsterruta
  (`manual-lines/route.ts` sin POST) riktig svarer 400 på. Rettet til 400, matcher CLAUDE.md sin
  feilhåndteringskonvensjon.
- Misvisende kommentar i `scripts/lib/refresh-helpers.js` hevdet `coreName()` var delt med
  `build-omsetningsavregning.js` — verifisert (grep) at den fila aldri bruker funksjonen. Rettet.

## 1. Pipeline — rekkefølge og datastrøm

```
refresh-nxt-booked-tenants.js   (kjøres SEPARAT, ikke del av under-kjeden)
        |
        v
build-remaining-summary.js      -> Redis: jobb:inntektsprognose-gjenstar-leietakere
        |                           (REMAINING: tenantMap, totalDelA/B)
        v
build-tenant-budget.js          -> Redis: jobb:inntektsprognose-leietaker-budsjett
        |                           (leser REMAINING.tenants for byExactName-match)
        v
build-tenant-forecast-table.js  -> Redis: jobb:inntektsprognose-leietaker-tabell
                                    (endelig Leieinntekter/Parkering-tabell)
```

- `refresh-nxt-booked-tenants.js` er **ikke** med i `refresh-income-forecast.js`
  sin automatiske rekkefølge — glemmes lett, gir "ute av synk"-varsel i UI-en
  hvis den ikke kjøres separat.
- Etter **enhver** full pipeline-kjøring: kopier konsoll-utskriftens nye
  `REMAINING`/`INVOICED`/`MANUAL_NXT`-aggregater manuelt inn i
  `lib/incomeForecast.local.ts` **og** `.anon.ts`. Dette er IKKE Redis-basert
  og oppdateres ALDRI automatisk — glemt i minst 3-4 dager ved minst én
  anledning, og er hovedkilden til at toppboksen "ikke stemmer" etter en
  ellers vellykket rebuild.
- `MainForecastBox` (`app/IncomeForecastSection.tsx`) leser altså IKKE de
  samme kildene som resten av tabellene: `total = bokfort (hardkodet
  INVOICED+MANUAL_NXT) + gjenstar (hardkodet REMAINING) +
  reforhandlingFull (live Redis) + omsetningsavregningSum (live Redis) +
  potensielleKategorier`. De hardkodede delene MÅ limes inn manuelt; de
  live delene oppdateres av seg selv.
- **Hardingsplan-tiltak 1** (se seksjon 7) foreslår å gjøre REMAINING
  Redis-basert i stedet for hardkodet konstant — ikke gjort ennå, men
  vurder ved neste større ombygging av pipelinen.
- **Diagrammet over viser kun 3 av de FAKTISKE 8 scriptene** som
  `scripts/refresh-income-forecast.js` (`npm run refresh:income-forecast`)
  kjører automatisk, pluss en blokkerende preflight-dato-konsistenssjekk
  (funnet ved runde 2 av pipeline-revisjonen, 2026-09-25 — verken denne
  filen eller `verify-income-forecast.js` kjente til de resterende fem:
  `build-contract-expiry-2026.js`, `build-omsetningsavregning.js`,
  `build-nxt-budget.js`, `build-tenant-signals.js`,
  `build-vacant-areas.js`). `verify-income-forecast.js` fikk 2026-09-25
  utvidet ferskhetssjekk for Omsetningsavregning/Kontraktsutløp-2026 (se
  0.1) — de tre andre (`nxt-budget`, `tenant-signals`, `vacant-areas)`
  har fortsatt INGEN post-kjøring-verifisering.
- **`scripts/build-tenant-signals.js`** hadde en frosset ABSOLUTT
  tidsstempel (`new Date("2026-08-24T00:00:00Z")`, ikke bare et
  årstall) brukt til å avgjøre om en Salesforce-reforhandlingspost er
  ">12 mnd gammel". Rettet 2026-09-25 til `new Date()` — i motsetning
  til årstall-konstantene i seksjon 3 (feil FRA en bestemt dato), ble
  denne feil MER for hver dag som gikk uten at noen rørte filen.
- **Kundefordringer/garanti-undermodulen** (`RECEIVABLES`,
  `GARANTI_SJEKKET_NAVN/-DATO`, `computeFordringer()`, del av samme
  Inntektsprognose-seksjon) er UDOKUMENTERT i denne filen og usporet av
  `check-override-freshness.js`, til tross for å være nøyaktig samme
  "manuelt datert, blir stille foreldet"-risikoklasse som resten av
  pipelinen (funnet ved runde 2, 2026-09-25). Selve
  `RECEIVABLES`↔`GARANTI_SJEKKET_NAVN`-interaksjonen ble sjekket og er
  korrekt selvforsvarende — ingen bug der, kun en dokumentasjons-/
  sporings-mangel. Den ukentlige `receivables-snapshot`-Vercel-cronen
  friskner IKKE opp selve dataen — den re-tidsstempler kun agings-grafen
  på hva som til enhver tid ligger hardkodet i `RECEIVABLES` (sist rørt
  2026-09-18), som vil se fersk ut i trend-grafen mens
  underliggende tall stille eldes. Ikke i seg selv ødelagt i dag, men en
  felle å kjenne til før 2027.
- **`scripts/assemble-nxt-booked-tenants.js`** har sin egen, separate
  hardkodet 9-selskapsliste OG en egen eierandel-halvering som IKKE går
  via den delte `lib/data/ownership-shares.json`-mekanismen (seksjon 2) —
  usporet av dagens dokumentasjon/verktøy (funnet ved runde 2,
  2026-09-25). Reverifiser begge (selskapslisten og at eierandel-logikken
  fortsatt gir samme svar som `ownership-shares.json`) før 2027, og
  vurder å konsolidere til den delte mekanismen for å unngå fremtidig
  desync (samme feilklasse som `ownership-shares.json` selv ble innført
  for å løse én gang før).

## 2. Strukturelle mekanismer (arkitektur — skal bestå til 2027 uendret)

Disse er **måten** systemet regner på, ikke årsspesifikke tall. De skal
IKKE bygges om for 2027 — bare de konkrete verdiene under punkt 3 må
fornyes.

- **Gjenstår-definisjon**: `gjenstår = full 2026-Fazile-verdi (justert for
  kontraktens start/slutt) − allerede fakturert i NXT`, PER (leietaker,
  bygg, del)-leieforhold. Ikke en fremover-rettet run-rate/pro-rata (denne
  ble eksplisitt forkastet av Morten), ikke leietaker-nivå uten
  bygg-oppdeling (ga 39% negative verdier).
- **v13-prinsippet (fortsatt gjeldende)**: Fazile sin FAKTISKE fakturaplan
  er primærkilde for gjenstår; den kontraktsverdi-baserte modellen er kun
  fallback. Fanger automatisk rabattlinjer, trappetrinn, kreditnotaer og
  nye kontrakter uten manuell sweep.
- **Matching-rekkefølge — TO SEPARATE funksjoner, IKKE én** (rettet
  2026-09-25 etter pipeline-revisjon, tidligere versjon av dette punktet
  slo de sammen til én feil, sammensmeltet rekkefølge):
  - **Fazile ↔ NXT** (`build-remaining-summary.js`, ingen funksjon heter
    `findTenant` her): `matchViaCustomerNo()` (kundenr) → `navn-eksakt` →
    `resolveNxtTenantName()`/kjerne-navn → `FAZILE_TO_NXT_ALIASES`-alias
    (SIST i kjeden, ikke nr. 2). "Bygg+beskrivelse" finnes IKKE i denne
    kjeden i det hele tatt.
  - **Excel ↔ REMAINING** (`build-tenant-budget.js` sin egen
    `findTenant()`): `EXCEL_TO_FAZILE_ALIASES`-alias → eksakt → kjerne-navn
    → bygg+beskrivelse → **`delstreng`** (et femte fallback-nivå, reelt
    brukt — 40 treff i en typisk kjøring — men manglet helt fra denne
    dokumentasjonen inntil nå). Ingen kundenummer-steg her.
  Bygg+beskrivelse-fallbacken (kun i Excel↔REMAINING-kjeden) er sårbar for
  generiske linjetekster ("Husleie avg.pl.") — verifiser et nytt
  `via: "bygg+beskrivelse"`-treff mot Fazile `customers`-søk før det stoles
  på; legg falske positiver i `BYGG_BESKRIVELSE_FALSE_POSITIVES`.
- **Del A/B-splitt** sjekker BÅDE seksjonsnavn (`isDelB`) OG linjebeskrivelse
  (`PARKERING_LINJE_REGEX`) — en seksjonsnavn-only-sjekk mistet 230
  garasjelinjer historisk.
- **CUSTOM-linjer klassifiseres med en ALLOWLIST**, ikke et
  utelukkelsesfilter: rabatt/fritak, parkering/garasje og ladestasjon
  slippes eksplisitt inn på 36xx; energi/eiendomsskatt/adm/kantine/
  ladestrøm holdes eksplisitt utenfor. En egen UKJENT_36XX-diagnose kjøres
  ved hvert uttrekk og lister beskrivelser som havner på 36xx uten å være
  allowlistet — **kjør denne diagnosen ved hvert nytt uttrekk, det er selve
  sikringsmekanismen mot at nye linjetyper stille faller feil vei.**
- **Eierandel-korreksjon (50%)** for sameide bygg/selskaper leses fra delt
  fil `lib/data/ownership-shares.json` (bygg- og selskapsnivå separat, fordi
  generiske bygg-etiketter som "Adm felles" deles av flere selskaper med
  ulik eierandel). Samme fil brukes av både app-kode og scripts (etter en
  tidligere desync-bug).
- **Konsern-sammenslåing** (`konsernNavn()`/`konsernGrupper()` i
  `scripts/lib/refresh-helpers.js`) slår sammen navngitte konsern til én
  visningsrad. Matching mot NXT/Fazile skjer fortsatt per juridisk enhet —
  kun VISNINGEN slås sammen.
- **`erFornyelseAvEksisterendeLeieforhold()`** gjenkjenner kontraktsfornyelser
  (gammelt kontraktsnummer → nytt, samme leietaker) slik at de ikke
  feilklassifiseres som "ny leietaker flyttet inn" (v68-bugklassen).
- **v48-mekanismen** (`build-remaining-summary.js`, 2026-09-22/23): en
  leietaker med ekte NXT-`customerNo` men UTEN aktiv Fazile-rent_roll-linje
  får nå en ekte `tenantMap`-oppføring (`status:
  "avsluttet-uten-fazile-linje"`, fakturert bevart, gjenstår=0) i stedet
  for å forsvinne inn i den anonyme "NXT uten Fazile-leieforhold"-bøtta.
  **Viktig lærdom denne mekanismen kodifiserer**: "leietaker mangler fra
  REMAINING" betyr IKKE automatisk "0 kr er riktig" — sjekk alltid om det
  finnes ekte NXT-bokføring før den konklusjonen trekkes.
  `FLYTTET_INN_OVERRIDE_KOLLISJON` (5 navn, se kildekoden for hvilke) er
  eksplisitt unntatt fra denne mekanismen pga. kollisjon med to andre
  fuzzy-matching-mekanismer i `build-tenant-forecast-table.js`.
  **STATUS USIKKER (funnet ved pipeline-revisjon 2026-09-25) — IKKE stol
  blindt på at alle 5 fortsatt faller til budsjett=0**: en direkte sjekk
  mot dagens Redis-data viste at minst 2 av 5 (`mustad eiendomsdrift as`,
  `urbanium eiendom as`) IKKE lenger viser budsjett=0 - senere endringer
  (v48-v74) kan ha løst deler av roten uten at denne notisen ble oppdatert.
  **Før 2027**: verifiser alle 5 navn på nytt fra bunnen (er kollisjonen
  fortsatt reell, eller kan unntaket fjernes helt?) i stedet for å anta at
  denne beskrivelsen fortsatt er korrekt.
- **Proporsjonal linjefordeling MÅ ha en eksplisitt fallback** for "gruppe
  med beløp men ingen klassifiserte linjer å fordele over" — denne bug-
  klassen har rammet minst 3 uavhengige steder (Bygg-/Leietype-gruppering,
  "Mustad Eiendom (intern bruk)"-raden) og er alltid usynlig (andre
  visninger av samme tall ser fortsatt riktige ut). **Sjekkemetode ved
  enhver ny proporsjonal fordeling: kryssjekk eksplisitt at ALLE visninger
  av samme underliggende tall summerer likt.**
- **Enhver UI-lags-justering av et tall (f.eks. "ekstra ved
  reforhandling") må gjøres i én delt funksjon** brukt av ALLE komponenter
  som viser "samme" tall, PR. LEIETAKERNAVN (ikke pr. kontrakt — viktig for
  leietakere med flere åpne kontrakter i ulike bygg), og må ha en synlig
  "syntetisk linje" i eventuelle drilldowns av samme tall.
- **Dobbelttellingsrisiko mellom `gjenstår` (REMAINING) og
  `reforhandlingFull`** (MainForecastBox-formelen i
  `app/IncomeForecastSection.tsx`): disse to komponentene av toppboksen KAN
  dobbelttelle samme beløp hvis en kontraktsfornyelse ikke er lenket via
  Fazile sin `renewed_contract_id`. Delvis håndtert via
  `MANUELT_BEKREFTET_REFORHANDLET`-kartet i `build-contract-expiry-2026.js`
  (kobler en gammel kontraktsnøkkel til sin ikke-lenkede etterfølger), men
  dette prinsippet sto tidligere KUN spredt i seksjon 5 sine
  enkelttilfeller (Erco Lighting, Møllefossen Cafe, Follestad Trend) - løftet
  hit som en generell regel 2026-09-25 (pipeline-revisjon) slik at en NY
  reforhandlingssak i 2027 blir sjekket mot dette mønsteret fra start,
  ikke oppdaget på nytt via en tilfeldig dobbelttelling.
- **Systemrad-navn (`isSystemRow()`/`SYSTEM_ROW_LABELS`) er HÅNDDUPLISERT
  TRE steder** (`lib/tenantForecastSystemRow.ts` er kanonisk kilde,
  `scripts/build-tenant-forecast-table.js` og
  `scripts/verify-income-forecast.js` har hver sin egne, separate kopi -
  TypeScript/ESM vs. plain Node CommonJS kan ikke trivielt dele én fil i
  dag). Funnet og rettet et reelt avvik her 2026-09-25 ("Ledig " med
  mellomrom i én kopi matchet ikke kanonisk "Ledig" uten mellomrom - virket
  i praksis, men er nøyaktig samme feilklasse som traff "Ukodet bokføring"
  én gang før, v3 2026-09-22). **Legger du til en ny systemrad-type: rett
  ALLE TRE stedene**, eller bedre - konsolider til én delt kilde (f.eks. en
  ren `.json`-fil) før 2027.
- **Omsetningsavregning (CC Vest)**: `forventet omsetningsleie = omsetning
  (rullerende 12 mnd) × avtalt %` minus `fakturertPlusGjenstår` (full
  årsverdi), gulvet på 0. Kontorer avregnes ALDRI ved omsetning — scope
  NXT-uttrekket til riktig orgUnit3, ikke bare kundenummer, for leietakere
  med både CC Vest-butikk og kontor et annet sted. Fjorårets
  merleie-oppgjør (konto 3632, `OMSETNINGSAVREGNING_2025_KONTI`) MÅ
  ekskluderes fra inneværende års "fakturert" — match mot leietakerens
  `avregnetMerleie2025`-verdi (±500 kr).
  **Åpent for 2027**: en genuin 2026-omsetningsavregning (som forfaller i
  starten av 2027) er eksplisitt IKKE bygget ennå — dette MÅ bygges før
  2027-prognosen, ikke bare kopiere 2025-mekanismen med nytt årstall.
- **Negativ-gjenstår-forklaring for CC Vest-bygg er SLÅTT SAMMEN med den
  generelle kontraktsendring-forklaringen** (rettet 2026-09-25, pipeline-
  revisjon): en tidligere, egen bygg-basert CC Vest-heuristikk ("trolig
  omsetningsleie") sto FØR den generelle kontraktsendring-grenen i
  if/else-kjeden i `build-remaining-summary.js`, og "vant" derfor for ALLE
  negative CC Vest-tilfeller - selv om heuristikkens EGEN kommentar sa at
  den ene gangen den faktisk ble etterprøvd (Legevakt Vest AS), var
  rotårsaken kontraktsendring, ikke omsetningsleie. Nå er kontraktsendring
  standardforklaringen for ALLE bygg (den eneste bekreftet flere ganger),
  med en tilleggsnote for CC Vest-bygg om at omsetningsleie også kan være
  en medvirkende, ikke-bekreftet årsak. Ren tekstendring - ingen tall
  endret seg.
- **"0 kr fakturert/gjenstår mot stor omsetning"** er en gjenbrukbar
  diagnosemetode for feil match (feil selskap/manglende bygg-scope) — kjør
  denne skanningen på nytt datasett før noe konkluderes som "ny/ukjent
  leietaker".
- **Fazile sitt uttrekk (2026-09-17-metoden, 6 GraphQL-spørringer i stedet
  for 55 rent_roll-kall)** tar ALLE RENT-linjer som overlapper
  regnskapsåret, ikke bare "aktiv i dag" (`aktiv_i_dag`-feltet skiller de
  to settene) — dette erstattet den gamle manuelle EXPIRED-sweep-prosessen
  helt. To feller å huske ved neste uttrekk: DISCOUNT-linjer har
  `ro_id = null` (må arve leieobjekt fra kontraktens andre linjer), og
  enkelte linjer (Onepark-parkering) står på 0,1 kr i stedet for 0 — bruk
  `|årspris| >= 1 kr` som terskel, men ALDRI ekskluder nullverdi-RENT.
- **Prorateringsstøy (0,1-1,4%) mellom modell og faktisk fakturering er
  systematisk (kalendermåned/360-dager vs. kalenderdager/365), IKKE en
  datafeil** — bekreftet på 20+ uavhengige kontraktslinjer. Skal ikke
  undersøkes videre som "feil" når gjenkjent.

## 3. Årsspesifikke verdier som MÅ fornyes for 2027

Disse er tidsbestemte og vil være FEIL hvis de gjenbrukes uendret:

- **KRITISK, rettet delvis 2026-09-25 (pipeline-revisjon)**: kalenderåret
  2026 lå tidligere spredt som løsrevne strenglitteraler ("2026-01-01",
  "2026-12-31") på minst 9 steder på tvers av 4 filer, UTEN én felles
  kilde - å bytte til 2027 krevde å finne ALLE, og å glemme ett sted ville
  gitt et stille feil tall (f.eks. at 2027-fakturaer filtreres bort ett
  sted, men ikke et annet). **Nå konsolidert** til `const AR = 2026` (+
  `AR_ISO_START`/`AR_ISO_SLUTT`) øverst i `build-remaining-summary.js` og
  `build-tenant-budget.js` (samme mønster som allerede fantes i
  `build-contract-expiry-2026.js`/`build-omsetningsavregning.js`) - **for
  2027 holder det å endre ÉN linje pr. fil**, IKKE lete gjennom hele filen
  på nytt. MERK likevel:
  - `build-tenant-budget.js` sin `AR`-konstant styrer OGSÅ filnavnet på
    råtataen (`budsjett-${AR}-excel-raw.json`) - selve råtatafilen må
    likevel hentes/bygges på nytt for 2027 (se filhodet for prosedyren),
    kun filnavnet oppdateres automatisk når `AR` endres.
  - `scripts/build-contract-expiry-2026.js` har ÅRSTALLET I SELVE
    FILNAVNET (ikke bare i en intern konstant) - må enten omdøpes (og alle
    referanser til den) eller parametriseres før 2027.
  - `scripts/refresh-nxt-booked-tenants.js` bruker allerede riktig mønster
    (eksplisitt `<ÅR>`-plassholder i sin egen dokumentasjon) - IKKE
    berørt av dette funnet, men reverifiser likevel at de 9 hardkodede
    NXT-selskapene i kommentaren der (Mustad Eiendom AS, Fåbro Eiendom AS,
    Lilleaker Næring AS, Lilleaker Sentrum AS, Lilleakerveien 14 AS,
    Lilleakerveien 32B AS, Mustadboliger AS, Strandveien 10 AS, Strandveien
    4-8 AS) fortsatt er de aktive selskapene før 2027 - listen hentes IKKE
    dynamisk.
- `ONEPARK_ESTIMAT_2026 = 9 457 370,44` (`build-remaining-summary.js`) —
  et manuelt anslag fra et gammelt Excel-ark
  (`2026_08_04_Inntektsprognose_Juli_2026.xlsx`, fane "Onepark") som
  trolig ikke finnes lenger. Manglet `@override`-tag helt frem til
  2026-09-25 (nå rettet, sporet av `check-override-freshness.js`) - dette
  er nøyaktig den typen konstant som ellers ville blitt stille gjenbrukt
  uendret i 2027.
- `OFFICIAL_LEIEINNTEKTER_BUDSJETT_2026 = 665 780 066` og
  `OFFICIAL_PARKERING_BUDSJETT_2026 = 58 970 570,16` (`build-tenant-budget.js`)
  — erstatt med 2027-Excel-arkets "Oppsummering"-totaler.
- `BOOKED_3600_3699`, `INVOICED`, `MANUAL_NXT`, `REMAINING`
  (`lib/incomeForecast.local.ts`/`.anon.ts`) — regenereres og limes inn på
  nytt manuelt etter hver pipeline-kjøring (se seksjon 1).
- `EXCEL_TO_FAZILE_ALIASES` (~35 oppføringer, `build-tenant-budget.js`) —
  ALLE er tidsbestemt til 2026-budsjettarkets eksakte stavemåte. Gå
  igjennom hver linje mot 2027-arket, ikke anta at de bare "fortsatt
  virker".
- `MANUAL_FLYTTET_INN_OVERRIDES` (~25 committede + 4 private, i
  `build-tenant-forecast-table.js`) — 100% tidsbestemt til 2026s
  ledig-til-leid-bevegelser. Bygges fra scratch hvert år fra det årets
  Finance-vakans-kommentarer, gjenbrukes IKKE.
- `MANUAL_UNTRACKED_OVERTAKELSER` (committert objekt nå tomt, innhold i
  gitignored `_private-untracked-overtakelser.json`) — tidsbestemt,
  leietaker-spesifikt.
- `ENGANGSGEBYR_LEIETAKERE`-kartet (exit fee-forklaringer for negativ
  gjenstår: 2026-hendelser, gjentas IKKE identisk i 2027 — nye exit fees
  krever nye oppføringer).
- `MANUELT_BEKREFTET_REFORHANDLET`-kartet (`build-contract-expiry-2026.js`)
  — kontrakt-ID-par spesifikke for 2026-utløp. Nullstill/gjennomgå ved
  årsskiftet.
- `_private-omsetningsavregning-heltfakturert.json` (18 leietakere,
  display-dempende, verifisert 2026-09-21) — trenger re-verifisering, ikke
  en permanent fasit.
- `_private-usikre-kontrakter.json` (Rema 1000, 100% risiko midlertidig) —
  fjern override når overtakelsen er bekreftet i Fazile.
- `_private-manuelle-kontrakter.json` (signerte, ikke-Fazile-registrerte
  kontrakter, f.eks. en leietaker i Vollsveien 19 pr. 2026-09) — fjern
  raden når kontrakten dukker opp i Fazile, ellers dobbelttelling.
- Konsern-gruppe-medlemskap (`_private-konsern-grupper.json`) og
  eierandeler (`lib/data/ownership-shares.json`) — reconfirm at ingen
  endringer har skjedd (nye/utgåtte medlemmer, endret eierandel) før 2027.
- `KUNDENUMMER_ALIASER`-kartet (`build-remaining-summary.js`) — historiske
  NXT-kundenummerbytter (f.eks. etter en fusjon). Sjekk om restdiffen
  (−179 062 kr, gamle kundenumre fortsatt brukt i 2026-bokføring) har
  løst seg selv i 2027-data.

## 4. Kjente feller / systemiske mønstre — sjekk igjen ved 2027-oppsett

1. **Fazile rent_roll er et snapshot på uttrekksdato** — kontrakter som
   utløper/fornyes mister historikk med mindre historiske snapshots
   brukes. Kilde til de fleste "0 kr fakturert tross budsjett"-sakene.
2. **Excel-kortnavn ≠ Fazile/NXT-fullnavn** er et tilbakevendende mønster.
   Sjekk alltid "uten treff"-lista mot kjente leietakeres kortformer/
   rabattlinjer før man antar en helt ny/ukjent leietaker.
3. **`contract.created_at` er upålitelig som signeringsdato** for rader nær
   2026-01-15 (bulk-migrert historikk, ikke nysignering). Ekskluder rader
   som starter nøyaktig på migreringsdatoen når `created_at` brukes som
   "nylig signert"-proxy.
4. **Fazile sitt per-linje `invoice_line`-tall er upålitelig for perioder
   rett etter en bulk-regenerering av `contract_line`-tabellen** (skjedde
   15.-20. januar 2026) — `cl_id`-koblinger til gamle, slettede rader gir
   falske "0 kr fakturert". Ikke bytt til invoice_line-basert per-linje-tall
   uten en migrasjonssikker kobling (via `ro_id`+periode+beskrivelse).
5. **NXT `voucherDate` (heltall YYYYMMDD) filtrerer feil med `_gte`/`_lte`**
   — bruk `voucherDateAsDate: {_between: {...}}}`.
6. **NXT `customerNo` er PER SELSKAP, ikke globalt** — bruk aldri
   customerNo alene på tvers av selskaper, slå opp `associate.companyNo`
   (org.nr) separat per selskap.
7. **Parallelle NXT-spørringer for flere selskaper i samme melding gir
   risiko for feil transkribering/tilordning** — kjør sekvensielt, eller
   bruk unik identifikator + uavhengig kontrollsum før tallet stoles på.
8. **Store MCP-svar spilles til fil over ~85 000 tegn** — utnytt dette
   bevisst (utvid `aggregates`) i stedet for å stole på manuell
   transkribering av rader. Kjør alltid en uavhengig kontrollsum
   (`groupBy`+`sum`+`count`) — transkripsjonsfeil fanges ALDRI av
   avskriften selv.
9. **En agents "fant en feil/manglende linje"-konklusjon MÅ verifiseres
   uavhengig og kryssjekkes mot om leietakeren allerede har en egen,
   korrekt rad** før noe legges til eller "rettes" — flere runder har vist
   at flertallet av slike forslag (5 av 6 i én runde) var feilaktige og
   ville dobbelttalt.
10. **Navnekollisjons-risiko**: samme streng kan bety to helt ulike ting i
    to ulike kilder (et konkret, bekreftet eksempel fra 2026: én
    Excel-budsjett-placeholder og én ekte, avsluttet Fazile-leietaker delte
    tilfeldigvis navn). Sjekk EKSPLISITT om et navn som "matcher" faktisk
    er samme juridiske enhet, ikke bare samme streng.
11. **Dyp resonnering kreves ved avviksklassifisering >10% eller ukjent
    årsak** — vis tankeprosessen, ikke bare konklusjonen. Små/opplagte avvik
    kan konkluderes raskt.
12. **Ved leietaker-spesifikt "finnes ikke"/uforklart avvik: sjekk
    tenant-fakta-minnet FØRST**, før noe Fazile/NXT-kall dispatches — unngå
    å re-undersøke allerede avklarte fakta fra bunnen.
13. **`REMAINING.sistOppdatert` reflekterer KUN fakturaplanens alder, ALDRI
    rent_roll-siden sin** (funnet ved pipeline-revisjon 2026-09-25): de to
    kildene aldres uavhengig av hverandre (fornyet kun rent_roll 2026-09-24
    uten å røre fakturaplanen, og `sistOppdatert` viste fortsatt riktig
    21.09 - fakturaplanens dato, ikke rent_roll sin ferskere 24.09). Stol
    ALDRI på at "sist oppdatert" i UI-en betyr at BEGGE kildene er ferske -
    sjekk begge eksplisitt (`fazileFakturaplan.uttrekksdato` i snapshotet
    vs. når `fazile-remaining-tenants/`-filene faktisk ble skrevet).
    Mangler fakturaplan-mappen HELT, faller `sistOppdatert` tilbake til
    dagens dato (rettet 2026-09-25, var tidligere en evig hardkodet, stadig
    mer misvisende "2026-08-26"-streng) - kombinert med en ADVARSEL i
    `advarsler`-lista (allerede fantes) er dette nå et ærligere signal enn
    før, men fortsatt ikke det samme som en ekte fersk fakturaplan.

## 5. Selskapsspesifikke fakta og alias (ikke uttømmende — se også koden selv)

Organisert alfabetisk. Kun selskaper/organisasjoner (AS/ASA/NUF) —
privatpersoner er bevisst utelatt her, se seksjon 8.

- **AFRY** (konsern, 4 juridiske enheter) — slått sammen til én rad via
  konsern-mekanismen (seksjon 2). [KODET]
- **Aquarium A/S ("Buddy")** — samme bygg som en annen leietaker i
  Lilleakerveien 14, men alle budsjettlinjer er 0 kr. [AVKLART, ingen
  kodeendring]
- **Baker Hansen AS** (CC Vest) — reforhandlet minimumsleie til 1 785 000
  kr fra 2026-01-01 t.o.m. 2030-12-31 (ned fra 2 130 991, som var 8,5% av
  2025-omsetning). [ÅPENT: ikke bekreftet mot signert tillegg]
- **Corvita AS** — gammel kontrakt (Lilleakerveien 8, 691 487/år, løper til
  2030) uten planlagt Q4-faktura; ny kontrakt (1,2 mill/år fra
  2026-09-01) mangler septemberfaktura. [ÅPENT: skal gammel kontrakt
  termineres i Fazile?]
- **Dataserver AS** — fornyet kontrakt (tilbakedatert 2026-04-01) genererte
  Q2-faktura for passerte perioder. [ÅPENT: reell etterfakturering eller
  duplikat av gammel kontrakt?]
- **Dell AS** — v68-fiks (2026-09-22): fornyelse gjenkjent riktig via
  `erFornyelseAvEksisterendeLeieforhold()`. Har også en bankgaranti
  registrert på kun deler av sine kontrakter — uavklart om den dekker alt
  forfalt. [KODET (fornyelse) / ÅPENT (garantidekning)]
- **Dr. Ing. A. Aas-Jakobsen AS / Geovita AS → Norconsult Norge AS**
  (kundenr. 10619) — fusjonert. **Norcap AS er IKKE del av denne
  fusjonen** — egen, separat leietaker i Vollsveien 19, ikke rør. Alias:
  `"dr ing aas-jakobsen as": "norconsult norge as"`. Historisk
  kundenummerbytte (11134/10455 → 10619) kodet i `KUNDENUMMER_ALIASER`.
  [KODET, liten uforklart restdiff −179 062 kr]
- **Eviny Elektrifisering AS** — "budsjett>0/fakturert≈0"-tilfelle
  (Lilleakerveien 16, kontrakt MD0731): Fazile-kontraktslinjen "Omsetningsbasert
  leie avg.pl." har en nominell plassholderverdi (0,05 kr) - samme mønster
  som 4Service Facility AS. Lagt til `OMSETNINGSLEIE_LEIETAKERE` 2026-09-24
  med tydelig "IKKE individuelt verifisert mot NXT-bokføring"-merking.
  [KODET (forklaring), men IKKE bekreftet mot faktisk NXT-tall — ikke
  undersøkt om flere CC Vest-leietakere har samme mønster]
- **Erco Lighting Ab Norsk Filial NUF** — signert fornyelse fra
  2026-10-01, uendret kjerneleie. [KODET i `MANUELT_BEKREFTET_REFORHANDLET`]
- **First Rent A Car Norway AS (Hertz)** — reell, ny leietaker (4,5 mill
  kr/år, Lilleakerveien 2C, fra 2026-08-01) som i 2026-budsjettarket sto
  under placeholder-navnene "Quantafuel AS" og "GSG Handyman AS".
  **VIKTIG: dette er IKKE samme "Quantafuel AS" som den ekte, avsluttede
  leietakeren under, kun en tilfeldig navnekollisjon i to ulike kilder** —
  se felle #10 i seksjon 4. [KODET, men verifiser navnekollisjonen
  eksplisitt på nytt for 2027-arket]
- **Fåbro Gård AS** (kunde 31342) — NXT-byggkode-feil: 138 966 kr bokføres
  feilaktig på "Mustads vei 10" i stedet for riktig "Mustads vei 12" →
  vises som gjenstår selv om fakturert. [ÅPENT, vedvarende — rettes i NXT
  ved kilden, eller legg inn kunde+bygg-omkoding i
  `build-remaining-summary.js` hvis det drøyer]
- **Follestad Trend AS** (CC Vest) — Q3-2026 "dobbel" minimumsleie er
  RIKTIG (justert opp pga. stor 2025-omsetningsavregning; høyere
  minimumsleie ⇒ tilsvarende lavere omsetningsavregning, speilbilder).
  Én reell dobbelttelling (trinnleie fra 2026-11-23) er lagt i
  `MANUELT_BEKREFTET_REFORHANDLET`. [KODET/AVKLART]
- **Grændsens Skotøimagazin + Kidz** — deler ett NXT-kundenummer, to
  separate Fazile-kontrakter, fordeles proporsjonalt etter
  minimumsleie-andel. [KODET, metodikkregel]
- **Head Norway AS** — "Wifi first"-linje (konto 3100, CUSTOM-type)
  kreditert manuelt. Arealdeling i Vollsveien 13D (285 kvm) gjelder Head
  Norway AS, ikke Head Sport Gmbh, men er løst med radkommentar siden det
  ikke er egen kontraktslinje i Fazile ennå. [KODET/delvis ÅPENT]
- **Human Care AS = AssisterMeg AS** — bekreftet samme selskap; Human Care
  AS (Mustadsvei 1) er det reelle, aktive leieforholdet. [KODET]
- **Legevakt Vest AS / Clinic Vest AS** — terminert med sluttoppgjør
  2026-09-18, INGEN exit fee (frafalt av Mustad mot fullt oppgjør av
  utestående). [AVKLART, ingen ekstra 36xx-inntekt]
- **Lyreco Norge AS** — kontrakt (Lilleakerveien 14, minimumsleie 4,37
  mill/år) utløper 2026-09-30, ingen etterfølger registrert i Fazile/
  Salesforce per 2026-09-23. Morten har bekreftet at reforhandling VIL
  skje (100% sannsynlighet i risikoberegningen). [ÅPENT — tidskritisk,
  krever Mortens direkte handling]
- **Mustad Eiendom AS** (kunde 10401) — **kun dette selskapet er intern**
  (ikke Mustad Eiendomsdrift AS, som er en vanlig ekstern leietaker siden
  2026-09-18). Egenleie i egne bygg (~5,24 mill kr) kan aldri bokføres —
  status `intern-egenleie` nullstiller gjenstår. [KODET; beslutning om
  budsjettsiden er fortsatt Mortens valg]
- **Narvesen CC Vest = Reitan Convenience Norway AS** — alias korrigert
  2026-09-23 (commit b18762e) fra et Fazile-spesifikt suffiks til NXT sitt
  rene navn, etter at v48-mekanismen flyttet kilden. Har også et 600 000
  kr utkjøpsbeløp ved avslutning. [KODET]
- **Norcap AS / Norcap Service AS** — egne, separate leieforhold i
  Vollsveien 19. Bekreftet IKKE del av Norconsult-fusjonen over. [AVKLART]
- **Ohla Norge / Obrascón Huarte Lain** (kundenr. 10627) — avsluttet
  leietaker, exit fee/sluttoppgjør 919 312,11 kr (2026-04-29). Manglet fra
  REMAINING før v48-fiksen (2026-09-22/23). [KODET via v48]
- **Origon AS** — ny, ubudsjettert linje i Vollsveien 17 fordi
  leietakerens SAMLEDE rad ikke er budsjett=0 (dekket av andre bygg) —
  "budsjett=0 for hele raden"-filteret er blindt for multi-bygg-leietakere.
  Relokasjon (ikke fornyelse) lagt i `MANUELT_BEKREFTET_REFORHANDLET`.
  [ÅPENT-nyanse: nøyaktig hvilken kontorlinje som er riktig kobling er ikke
  100% avgjort]
- **PGS Geophysical AS** (kunde 10385) — leierabatt −800 000 kr/år
  2025-2029, periodisert i NXT (konto 3652) uten egen DISCOUNT-linje i
  Fazile, korrigert. [KODET; den samme 800 000 kr-linjen er kommentert men
  ikke trukket direkte inn i selve gjenstår-tallet ennå — vurder ved neste
  runde]
- **Quantafuel AS** (ekte, avsluttet leietaker — IKKE forveksle med
  placeholder-navnet over) — avsluttet, exit fee 2 261 627 kr
  (2026-02-11). [KODET via v48]
- **Rema 1000 Norge AS** (Vollsveien 13D) — ny leietaker, 3,63 mill kr/år
  fra 2026-10-01, signert men ikke aktivert i Fazile per 2026-09. Gitt
  100% risiko midlertidig. [ÅPENT — fjern override når overtakelsen er
  bekreftet]
- **Sats Norway AS** — ny kontrakt (Lilleakerveien 14, 454 582/år fra
  2026-07-01) uten genererte fakturaer. [ÅPENT: er kontrakten aktivert?]
- **Sport Holding Retail AS (Anton Sport, inkl. "Sportsnett")** — omsetning
  fra Omsetningsleie-fanen (rullerende 12mnd) og fra Amesto (helår 2025)
  avviker sterkt (+110%). [ÅPENT]
- **Statkraft AS** — budsjettkilde bekreftet ("Budsjett 2026 (redig)"-
  arket). [AVKLART, ingen alias-endring]
- **Stig A. Dalen AS (Sunkost)** — MERK: Fazile/NXT-navnet har PUNKTUM
  etter "A" — søk uten punktum gir 0 treff. Ikke forveksle med en annen,
  urelatert boligleietaker med lignende etternavn i et annet bygg. [KODET/
  AVKLART, permanent alias-fakta]
- **Telenor Norge AS = Telenorbutikken CC Vest** — bekreftet samme
  selskap. Slått sammen med øvrige Telenor/Telia-enheter som konsern.
  [KODET]
- **Telenor Infra AS** — bygg-alias-feil ("CC Vest senter" vs.
  "Lilleakerveien 16") løst ved å bruke `kanoniskByggNavn()` konsekvent på
  begge sider. [KODET]
- **Telia Rooftops Norway AS** (kunde 11119) — samme NXT-byggkode-mønster
  som Fåbro Gård over: 103 949 kr bokføres på "Vollsveien 17", skal være
  "Vollsveien 13B". [ÅPENT, vedvarende]
- **Metesa AS = Medu AS** (rebrand midt i kontraktsperioden, to
  Fazile-kunderecords over tid for samme leietaker). [KODET]
- **Vitusapotek (Norsk Medisinaldepot AS)** — tilleggsleie (konto 3620)
  holdes utenfor kjerneleien/avregningsgrunnlaget siden Amesto kun avregnet
  mot à konto. [ÅPENT: bekreft at dette er riktig praksis]
- **Ureist AS** (Mustads vei 10, 2. etasje) — en annen leietaker (privatperson/
  enkeltpersonforetak, se gitignored `_private-flyttet-inn-overrides.json`)
  leier 1. etasje i samme bygg, omsetningsbasert. Én av tre "Ledig MV10"-
  kontorlinjer er trolig identisk med Ureist AS sin egen rad. [ÅPENT —
  mulig dobbelttelling, ikke avgjort]

## 6. Kjente åpne/uløste punkter (kritisk — ikke glem til 2027)

- **«Gjør alt»-hardingsplanen (2026-09-06, 12 tiltak, eksplisitt godkjent
  av Morten) — ALLE 12 punkter fortsatt ikke startet.** Viktigst av disse:
  (1) `scripts/verify-income-forecast.js` med invarianter i stedet for
  statisk RECONCILIATION, (6) flytt overrides ut av koden til én samlet,
  gitignored `income-forecast-overrides.json` (direkte relevant for denne
  filens formål — vurder om dette bør gjøres FØR 2027-oppsettet, det ville
  gjort mye av seksjon 3 overflødig som manuell prosess). Sjekk denne
  planens status før videre arbeid — ikke spør Morten om omfang på nytt.
- **60 leieforhold / ~6,4 mill kr gjenstår uten Fazile-plan**
  (`fazile-plan-mangler`) — må avgjøres leieforhold for leieforhold
  (kontrakt ikke aktivert / fakturering stoppet / reelt ferdig).
- **NXT-byggkode-feil**: Fåbro Gård AS og Telia Rooftops Norway AS, se
  seksjon 5.
- **Utleiemegleren Frogner AS** — regnskap har korrigert manuelt flere
  ganger med en rate som ikke stemmer med Fazile-kontraktens 35 000
  kr/mnd. Spør Morten/regnskap om riktig månedsleie og om reklassifisering
  til et annet selskap (kundenr 10404) er ferdig, før noe rettes i koden.
- **Tilbakebetalingskandidater omsetningsavregning (~689 000 kr)**:
  Follestad Trend, samt tre andre CC Vest-leietakere med fakturert over
  både minimum og forventet omsetningsleie.
- **"Ledig V21"**: pipelinen varsler at en tekstreferanse i
  `MANUAL_UNTRACKED_OVERTAKELSER` ikke lenger matcher — Excel-teksten er
  endret siden sist, oppdater `linjeMatch`.
- **"Ledige lokaler"-budsjettet (13,4 mill kr)**: kun 3 av flere nye
  kontrakter bekreftet — resten ikke gjennomgått systematisk. Flere
  konkrete leietakere/linjer flagget til Mortens gjennomgang
  2026-09-11 — ukjent om denne fant sted.
- **Mistenkte regnskapsfeil ved KILDEN** (krever Regnskap/Finance, ikke
  fiksbare i rapporten): en parkeringsfeilkoding, ett stort uforklart
  negativt avvik, og et mulig systematisk "budsjett ≈ 2× kontraktsleie"-
  mønster observert tre ganger uavhengig hos ulike leietakere.
  - **SFTY AS** kan ha byttet navn i NXT sitt associate-register (mulig
    firmanavnebytte) — ikke sjekket, kan forklare en "uten
    budsjett-treff"-leietaker under gammelt navn.
- **Vollsveien 13G** (284 494 kr NXT-budsjett) har ingen bekreftet
  Fazile-motpart — flagget i `lib/data/building-registry.json` sin
  `uavklart[]`-liste.
- **Onepark-estimatet** (parkeringsinntekt utenfor Fazile rent_roll, +4,83
  mill kr) er fortsatt et manuelt anslag, ikke en beregnet verdi fra reell
  datakilde.
- **Match-kvalitet** (`via: kundenr/alias/bygg+beskrivelse/fuzzy`) er ikke
  synlig i UI ennå (hardingsplan-tiltak 5).
- Fjern ubrukt `RECONCILIATION`-konstant fra `incomeForecast.local/anon.ts`
  (erstattes uansett av hardingsplan-tiltak 1).
- Genuin 2026-omsetningsavregning som forfaller ~2027 — se seksjon 2/3,
  må bygges før 2027-prognosen.
- **Fakturaplan-fornyelse mislyktes 2026-09-24**: et forsøk på å fornye
  `scripts/refresh-data/fazile-fakturaplan/` (primærkilden) via en
  bakgrunnsagent kjørte seg fast (123 verktøykall, ingen filer skrevet) og
  ga opp uten resultat. Data står fortsatt på 21.09-uttrekket (kun
  rent_roll-siden, fallback-kilden, ble fornyet 24.09 via 55 parallelle
  Fazile-kall). Metoden er dokumentert i filens egen `meta.json`
  ("metode"-feltet) - krever 5 sveip + paginering + 26 batchede
  kontokoblinger, se der for eksakt fremgangsmåte hvis noen prøver igjen.
- **Alias-dødsjekk og konsern-verifisering ikke fullført** (pipeline-
  revisjon 2026-09-25): ble ikke rukket innenfor tiden å systematisk
  kryssjekke ALLE `@override`-alias-lister mot faktisk Redis-innhold for
  døde/utdaterte oppføringer, eller å bekrefte at konsern-sammenslåingen
  fortsatt matcher per juridisk enhet slik seksjon 2 beskriver. Verdt en
  egen, kort runde senere.
- **Ekte privatpersonnavn i git-historikken (commit b18762e), IKKE
  ryddet** — se seksjon 0, krever Mortens eksplisitte beslutning før noe
  rørt (historikk-omskriving er en risikabel operasjon underlagt
  CLAUDE.md sin sikkerhetsregel).
- **Fritekst-kommentarfelt anonymiseres ikke** (ReviewMark.notat,
  TenantForecastComment.kommentar, ManualIncomeLine.beskrivelse,
  OmsetningsavregningButikk.kommentar) — se seksjon 0.2, dokumentert
  restrisiko, ikke strukturelt løsbart uten å risikere å ødelegge
  meningsfulle kommentarer.
- **Arkitektonisk `/dele`-spørsmål uavklart**: anonymisering styres av
  `NODE_ENV`, ikke av hvilken cookie som faktisk autentiserte — se
  seksjon 0.2 for full forklaring. Avklar med Morten om dette er tiltenkt
  atferd.
- **`docs/inntektsprognose-endringslogg.md` er foreldet siden v27
  (2026-09-07)**, ikke bevisst frosset — se filhodet over. Avklar om den
  skal gjenopplives eller legges ned.

Ikke-navngitte, lavere-prioritet åpne punkter (private boligleietakere,
enkeltbudsjettlinjer) står i minnefilen `project_pending-small-fixes.md` —
sjekk den ved øktstart, den skal IKKE dupliseres her siden noen av
punktene kan gjelde privatpersoner.

## 7. Redis-nøkler produsert av pipelinen

- `jobb:inntektsprognose-gjenstar-leietakere` (REMAINING, fra
  build-remaining-summary.js)
- `jobb:inntektsprognose-leietaker-budsjett` (fra build-tenant-budget.js)
- `jobb:inntektsprognose-leietaker-tabell` (endelig tabell, fra
  build-tenant-forecast-table.js)
- `jobb:inntektsprognose-omsetningsavregning` (fra
  build-omsetningsavregning.js) — kun ferskhet sjekket av
  verify-income-forecast.js (lagt til 2026-09-25), ingen finansiell
  kryssjekk ennå.
- `jobb:inntektsprognose-kontraktsutlop-2026` (+ tilsvarende
  parkering-variant, fra build-contract-expiry-2026.js) — samme,
  kun ferskhet sjekket.
- `jobb:inntektsprognose-bokfort-leietakere` (fra
  refresh-nxt-booked-tenants.js, kjøres separat, se seksjon 1)
- Redis-only støttedata (ALDRI overskrevet av en pipeline-kjøring, egne
  hasher): `jobb:inntektsprognose-vurderinger` (vurderinger/review marks),
  `jobb:inntektsprognose-leietaker-kommentarer` (kommentarer),
  `jobb:inntektsprognose-linjer` (manuelle inntektslinjer),
  `jobb:inntektsprognose-signaler` (reforhandlings-/utleiesignaler,
  seedet av build-tenant-signals.js).

## 8. Gitignorede støttefiler (`scripts/refresh-data/_private-*.json`)

Disse finnes kun lokalt, aldri i git. Kopier ALDRI innholdet deres inn i
denne filen eller andre committede filer.

- `_private-tenant-aliases.json` — privatperson Excel-navn → REMAINING-navn
- `_private-fazile-to-nxt-aliases.json` — privatperson Fazile→NXT-navnealias
- `_private-konsern-grupper.json` — konsern-medlemslister (selskapsnavn,
  men holdt utenfor committet kode av historiske grunner — se filen selv)
- `_private-flyttet-inn-overrides.json` — privatperson-del av
  `MANUAL_FLYTTET_INN_OVERRIDES`
- `_private-untracked-overtakelser.json` — leietaker-spesifikke
  "dobbeltbudsjettert"-linjer
- `_private-usikre-kontrakter.json` — kontrakter med midlertidig
  risikojustert sannsynlighet
- `_private-manuelle-kontrakter.json` — signerte, ikke-Fazile-registrerte
  kontrakter
- `_private-omsetningsavregning-heltfakturert.json` — display-dempende
  liste for CC Vest-avregning
- `_private-ledig-navnestripp.json` — navnestripping for offentlig
  synlig Vercel-kommentartekst på "Ledig"-rader
- `_private-ukodet-kundekoding.json` — manuelle konto-omkodinger
- `_private-ovrig-risiko.json` — (for tiden tom)

Alle disse lastes ved fil-load-tid ETTER de committede alias-objektene i
`build-tenant-budget.js`/`build-remaining-summary.js` og kan derfor
overskrive en committet oppføring med samme nøkkel stille — husk dette
hvis en alias-endring i den committede filen "ikke ser ut til å virke".
