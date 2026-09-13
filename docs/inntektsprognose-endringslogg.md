# Inntektsprognose - endringslogg (anonymisert grunnlag)

Flyttet ut av `lib/incomeForecast.anon.ts` 2026-09-08 (v29). Konstantfila inneholdt 15 kronologiske
OPPDATERT-blokker som til sammen gjorde en tallfil til 32 % kommentar. Metodikk-beskrivelsene
(hvordan modellen faktisk regner) ble VÆRENDE i konstantfila - det er kun den daterte
historikken som ligger her.

Rekkefølgen er bevart nøyaktig slik blokkene sto i fila (eldst først), slik at ingenting er
omtolket eller omskrevet i flyttingen.

## INVOICED

OPPDATERT 2026-08-30: se lib/incomeForecast.local.ts sin tilsvarende kommentar - periode 8
dekker nå hele august (økte kun ~680 000 kr, IKKE hovedforklaringen på gapet mot budsjett).

OPPDATERT 2026-09-07 (v22, fersk uttrekk periode 1-9): se lib/incomeForecast.local.ts sin
tilsvarende kommentar for full metode/forklaring - kort oppsummert: hentet helt på nytt fra NXT,
nå periode 1-9 (periode 9 delvis siden dagens dato er 2026-09-07). INVOICED og
BOOKED_3600_3699 er denne runden hentet fra SAMME NXT-spørring/tidspunkt og stemmer derfor
eksakt overens (totalDelA/totalDelB her = BOOKED_3600_3699 sine totalDelA/totalDelB), i
motsetning til tidligere runder der de kom fra ulik metode/tidspunkt med et lite kjent avvik.
Periode 1-8 er SVÆRT nær forrige uttrekk (delA opp ~32 350 kr av ~493 mill, delB praktisk talt
uendret) - bekrefter konsistent metodikk, kun periode 9 er reelt nytt.

## REMAINING

OPPDATERT 2026-08-30 (v2, samme dag): se lib/incomeForecast.local.ts sin tilsvarende kommentar
for full metode - "enda sikrere tall"-gjennomgang av alle 43 "forklart-kontraktsendring"-
leieforhold (5 parallelle agenter + direkte fazile_graphql_query-verifisering). 34/43 er en
ikke-fikserbar prorateringsforskjell (månedlig/360-dagers NXT-fakturering vs. dager/365-modell),
3 er kjente spesialtilfeller uten fiks, 5 agent-funn om "manglende linjer" viste seg ved
kryssjekk å allerede være talt med andre steder (ville dobbelttalt). Kun 3 bekreftede tillegg
(verifisert direkte mot Fazile sin contract_line-tabell): Kletor AS/Lilleakerveien 10 (CUSTOM
Ladestasjon-linje, +10 350,62 kr DelA), Moss Maritime AS/Vollsveien 17 (CUSTOM Garasje-linje,
+497 371,00 kr DelB), Scandinavian Cosmetics AS/Lilleakerveien 10 (ny kontrakt fra 2026-09-01,
+663 933,15 kr DelA).

OPPDATERT 2026-08-30 (v3, samme dag): se lib/incomeForecast.local.ts sin tilsvarende kommentar
- gjennomgikk alle 18 "ikke-matchet-i-nxt"-leieforhold enkeltvis. 364 411 kr (Sporveien Trikken/
Lysakerelva) hadde first_invoice_date=2027 i Fazile - genuint aldri fakturert, ikke "allerede
forhåndsfakturert". 26 000 kr (Food Folk) var DRAFT-status, ikke signert. ~75 150 kr (Veidekke/
Vedeld) var ALDRI et hull - allerede fakturert under hovedbyggets kode, ikke en egen
parkerings-bygg-kode (bekreftet ved nesten eksakt kronebeløp-match, ny bygg-alias lagt til).

OPPDATERT 2026-09-03 (v12, "konto-først"-parkering): Q4-revisjon av Del B (gjenstår parkering lå
6,3 mill kr over et normalkvartal) fant tre pipeline-svakheter: parkeringskvartal bokført på
HOVEDBYGG-koden til blandede leieforhold ble nettet mot husleien (Del B viste 2 kvartaler
gjenstår, Del A 1 for lite), Del B-bokføring i "feil" selskap/på generelle bygg-koder ble ikke
funnet, og små Del A-posteringer på rene parkeringsgrupper ble dobbelttalt. Fikset ved at Del B
nå beregnes kundenummer-bredt pr. leietaker: alt på parkeringskonto 3640-3642 (og
parkeringsbygg-koder) på tvers av bygg og selskap samles i én pool og fordeles proporsjonalt på
leietakerens Fazile-parkeringslinjer. Feilførte beløp vises korrekt med kommentar, ikke som
avvik. Rettet samtidig en latent feil der REMAINING-totalene ikke fanget opp v11 sin
kundebrede justering (konstanten under viste 23,9 mill Del B mens radene summerte til 19,7).
totalDelB NED til 18 636 635,08 kr, totalDelA OPP til 168 402 669,06 kr.

OPPDATERT 2026-09-04 (v13, Fazile-fakturaplan som primærkilde): Gjenstår hentes nå fra Fazile
sine faktisk genererte/planlagte fakturalinjer (invoice_lines, konto 3600-3699) i stedet for
"årsverdi minus bokført"; modellen er fallback der Fazile mangler planlagt faktura (ny status
"fazile-plan-mangler"). Månedsfakturerte ekstrapoleres siste måned til årsslutt. Kreditnotaer
på 3630 som speiler en 3632-avregning nøytraliseres parvis. Se lib/incomeForecast.local.ts
for full forklaring. totalDelA NED til 164 395 403,18 kr, totalDelB NED til 18 088 295,58 kr.

OPPDATERT 2026-09-05 (v14, egenleie): Mustad Eiendom AS sin egenleie i eget selskap (p-plasser til
ansatte/lager) kan aldri bokføres - 6 leieforhold nullstilt (status "intern-egenleie"). Se
lib/incomeForecast.local.ts. totalDelA NED til 163 829 418,33 kr, totalDelB NED til 17 270 022,27 kr.

OPPDATERT 2026-09-06 (v15, kontraktslinje-sluttdato som ekstrapoleringshorisont): Månedsekstra-
poleringen forlenget tidligere en leiefritakslinje (rabatt) til 31.12 selv om selve kontrakts-
linjen slutter 30.11 - rent_roll kjenner ikke rabatt-/fritakslinjer, så horisonten falt tilbake
til årsslutt. Nå slås contract_line.end_date opp (scripts/refresh-data/fazile-fakturaplan/
contract-lines.json) og brukes som horisont. Ett leieforhold berørt. totalDelA OPP til
164 104 418,33 kr (+275 000), totalDelB uendret.

OPPDATERT 2026-09-07 (v21, fersk NXT-uttrekk): "alleredeFakturert"-siden hentet på nytt fra NXT
(9 selskaper, generalLedgerTransaction joinet mot customerTransaction for kundenummer - se
scripts/refresh-data/nxt-booked-tenants/, verifyTotal-kontrollsum bestått mot uttrekksfilas eget
totalBelop). Fazile-siden (fakturaplan) IKKE oppdatert i denne runden - sistOppdatert forblir
fakturaplanens egen uttrekksdato. totalDelA NED til 164 065 688,99 kr, totalDelB NED til
17 128 652,57 kr. antallForklartOmsetningsleie/antallForklartKontraktsendring endret vesentlig
(3→32, 45→52) som følge av bedre NXT-matching mot fersk data.

OPPDATERT 2026-09-07 (v23, fersk Fazile rent_roll for alle 55 eiendommer): rådataen i
scripts/refresh-data/fazile-remaining-tenants/ hentet på nytt for samtlige 55 eiendommer (samme
NXT-uttrekk og fakturaplan som v21/v22, uendret). Leieforhold-antallet falt fra 726 til 674
(−52) fordi et fersk rent_roll-uttrekk kun fanger kontraktslinjer aktive PÅ UTTREKKSDATOEN
(i dag), mens forrige uttrekk (2026-08-29) var et fullstendig historisk 2026-sweep (12
månedlige øyeblikksbilder pr. eiendom) som også fanget kontrakter som er utløpt tidligere i
år uten fornyelse - et kjent, dokumentert gap (se punkt 3 i
scripts/refresh-fazile-remaining-tenants.js sin header). totalDelA NED 1 716 701,34 til
162 348 987,65 kr, totalDelB NED 96 416,23 til 17 032 236,34 kr. antallIkkeMatchetFlagget NED
til 9 (fra 14), antallForklartOmsetningsleie NED til 31 (fra 32) - færre rader å matche mot
NXT når færre historiske leieforhold er med. Strandveien 4-8 sin eierandel-bug (Fazile viser 1
i stedet for 0,5) er FORTSATT TIL STEDE - STRANDVEIEN_4_8_MANUAL_HALVING i
build-remaining-summary.js beholdt uendret. Ingen eiendommer traff 2000-raders-grensen
(største var Lilleakerveien 16 mm/CC Vest med 221 rader).

OPPDATERT 2026-09-07 (v24, fersk Fazile rent_roll MED flerpunkts-dekning): v23 sitt
enkelt-tidspunkts rent_roll-uttrekk (aktiv_dato = i dag, 2026-09-07) viste seg å systematisk
MISTE tre typer kontraktslinjer, verifisert med tre konkrete eksempler: (1) Rema 1000 Norge AS
(Vollsveien 13D) - signert kontrakt med start_dato 2026-10-01, altså IKKE aktiv ennå på
uttreksdatoen, manglet derfor helt selv om den skal telle for okt-des 2026; (2) K&C Factory AS
(Lilleakerveien 4CDEF) - kontrakten løp ut 2026-02-28 (med en oppfølgende linje ut 2026-06-30),
altså ALLEREDE utløpt på uttrekksdatoen, manglet derfor selv om den skal telle for deler av
året; (3) Reitan Convenience Norway AS/Kiosk 814 (Lilleakerveien 16 mm/CC Vest) - kontrakten
løp ut 2026-08-31, kun 7 dager før uttrekksdatoen, samme mønster. Løsningen: rent_roll ble kjørt
på nytt for alle 55 eiendommer ved 5 sjekkpunkter spredt over hele 2026 (2026-01-15, 04-01,
07-01, 09-07, 10-01), og resultatene ble slått sammen (union) og deduplisert på linje_id (verdier
er identiske uansett hvilket tidspunkt en linje ble hentet på). Fant samtidig en beslektet,
tidligere ukjent bug: flere eiendommer har DOBBELT mellomrom i sitt interne Fazile-navn
(Lilleakerveien  2 Garasje/2AB/2CD/2E/2F/2G/4A/4CDEF/6/8_E) - rent_roll sitt eiendom-filter
krever eksakt mellomrom-match, ikke bare substring, så et enkelt-mellomroms-søk på disse gir
stille 0 treff. Rådataen for disse 10 eiendommene ble derfor hentet på nytt med korrekt
dobbelt-mellomrom for å unngå at HELE eiendommen falt ut (ikke bare et fåtall linjer). Totalt
192 nye kontraktslinjer lagt til på tvers av alle 55 filer (1 208 -> 1 400 rader). Leieforhold-
antallet OPP fra 674 til 724 - nærmere (2 under) det opprinnelig committede 726-tallet fra
2026-09-04-uttrekket, og godt over det forkastede 674-tallet, som forventet nå som hullene i
stor grad er tettet. totalDelA OPP 1 320 347,69 fra 674-uttrekket til 163 669 335,34 kr (fortsatt
396 353,65 UNDER 726-uttrekkets 164 065 688,99 kr - andre, uavhengige NXT-/fakturaplan-endringer
siden 2026-09-04 forklarer resten av avviket, ikke denne fiksen). totalDelB UENDRET på
17 128 652,57 kr - identisk med 726-uttrekket, altså var Del B allerede upåvirket av
enkelt-snapshot-bugen (parkeringslinjene som manglet var stort sett Del A-linjer).
antallIkkeMatchetFlagget OPP til 14 (fra 9) - tilbake på samme nivå som 726-uttrekket, som
forventet med flere leieforhold å matche. antallForklartOmsetningsleie OPP til 34 (fra 31),
antallForklartKontraktsendring NED til 48 (fra 52) - begge nærmere 726-uttrekkets 32/52 enn
674-uttrekkets tall. Strandveien 4-8 sin eierandel-bug (Fazile viser 1 i stedet for 0,5) er
FORTSATT TIL STEDE - STRANDVEIEN_4_8_MANUAL_HALVING i build-remaining-summary.js beholdt
uendret. Ingen eiendommer traff 2000-raders-grensen (største var fortsatt Lilleakerveien 16
mm/CC Vest, nå med 240 rader mot 221 før).

OPPDATERT 2026-09-07 (v25, korrigert NXT-koblingsmetode): v21 sitt NXT-uttrekk ("allerede
fakturert"-siden) koblet generalLedgerTransaction mot customerTransaction via voucherNo - BEVIST
FEIL i dag: voucherNo er kun unikt INNENFOR sin egen bilagsserie, ikke på tvers av hele
regnskapet, så koblingen fanget opp urelaterte transaksjoner (konkret bevis: en enkelt, stor
leietaker - se lib/incomeForecast.local.ts for navn, ekte leietakernavn hører ikke hjemme i
denne committede fila - fikk tidligere feilaktig tilordnet beløp fra 16 forskjellige bygg den
ikke leier i, når den i virkeligheten kun leier ett bygg + ett kjent, legitimt beløp på et
annet bygg). Korrigert metode: `accountingTransaction` har `customerNo`, `accountNo` OG
`orgUnit3` DIREKTE på samme rad (filtrert `accountType=3` for GL-siden) - ingen join nødvendig.
Sanity-sjekket FØR full kjøring mot de to kjente byggene for denne leietakeren: -57 603 552,50 kr
(innenfor forventet 55-60 mill) og -36 886 606,68 kr (bekrefter kjent, legitimt beløp) - begge
bestått. Alle 9 aktive selskaper hentet på nytt (samme eierandel-halvering som før for Fåbro
Eiendom AS/Strandveien 10 AS/Strandveien 4-8 AS). Ny råtotalsum 537 204 083,24 kr, svært nær
v21-24 sin gamle (feilkoblede) 537 472 029,01 kr (BOOKED_3600_3699, urørt denne runden) - altså
var den AGGREGERTE selskaps-/kontonivå-summen tilfeldigvis nesten riktig selv med feil metode
(feilen omfordelte beløp MELLOM leietakere/bygg innenfor samme selskap, ikke på tvers av
selskaper), men PR.-LEIETAKER/BYGG-fordelingen var upålitelig - det er nettopp den fordelingen
REMAINING bruker for å beregne "allerede fakturert pr. leieforhold". Avstemming i
refresh-nxt-booked-tenants.js: differanse 0,00 kr. Effekt på REMAINING: totalDelA OPP 38 729,34
til 163 708 064,68 kr, totalDelB NED 16 065,30 til 17 112 587,27 kr - begge små endringer i sum
(metoden omfordelte mellom leieforhold, den samlede porteføljetotalen var lite påvirket).
antallForklartOmsetningsleie NED til 5 (fra 34) og antallForklartKontraktsendring NED til 43
(fra 48) - en god del leieforhold som tidligere ble klassifisert i disse to catch-all-
kategoriene (basert på feilkoblet "allerede fakturert") havner nå i andre/ingen kategori med
korrekt NXT-data. Fazile-siden (fakturaplan) IKKE oppdatert i denne runden - kun NXT-siden.


OPPDATERT 2026-09-07 (v27, fersk fakturaplan mot fersk NXT-cache): v25 lot Fazile-siden ligge, og
da hadde scripts/refresh-data/fazile-fakturaplan/ nxtCacheDato "2026-08-30" mens NXT-bokføringen
var oppdatert til 2026-09-07. Den datoen er grensen build-remaining-summary.js bruker for "hva er
allerede fakturert i NXT" (v13-metodikken): en faktura regnes som gjenstående med mindre den er
SENT med sent_at <= nxtCacheDato. Med grensen stående på 30. august ble fakturaer sendt i vinduet
30. aug - 7. sep talt BÅDE som bokført (de lå i den ferske NXT-cachen) og som gjenstående (de så
fortsatt usendte ut i den 4 dager gamle fakturaplanen) - altså en reell dobbelttelling. Appen
varslet om avviket. Hele fakturaplanen er nå hentet på nytt fra Fazile 2026-09-07 (invoices,
invoice_lines, invoice_line_accounts) og nxtCacheDato satt til 2026-09-07, slik at de to kildene
har samme skjæringsdato. Konkret fant refreshen 13 fakturaer som hadde flippet PENDING -> SENT
(sent_at 2026-09-04) siden forrige uttrekk - det er nettopp double-count-kandidatene. I tillegg
var 62 tidligere PENDING-utkast slettet/regenerert i Fazile (bekreftet borte ved direkte
i_id-oppslag, ikke et hull i pagineringen) og 53 fakturaer var nye. Effekt på REMAINING:
totalDelA NED 807 486,00 til 162 900 578,68 kr, totalDelB NED 31 498,73 til 17 081 088,54 kr -
til sammen 838 984,73 kr som tidligere ble telt to ganger. Alle ADVARSEL-linjer i pipelinen er
borte etter dette (både nxtCacheDato-avviket, contract-lines-oppslaget og planUtenLeieforhold).
Antallene (leieforhold/flagg-kategoriene) er uendret fra v25. contracts.json og
contract-lines.json er urørt - de trengte ingen nye oppslag. Se meta.json i fakturaplan-mappa for
nøyaktig uttrekksmetode (bl.a. at Fazile-operatoren heter `neq`, ikke `not_eq`, at IN-filter tar
maks 100 verdier, og at alle datofelt er String så all datofiltrering må gjøres klientside).

## MANUAL_NXT

OPPDATERT 2026-09-07 (helt ny metodikk - v22-runden fant at forrige metode, generalLedgerTransaction
joinet mot customerTransaction via voucherNo, var feil - se REMAINING sin v25-kommentar. Samme feil
gjaldt sannsynligvis IKKE denne lista direkte siden forrige runde brukte origin=ManuallyEntered, men
den metoden viste seg likevel util utilstrekkelig - se under). Ny, verifisert metode: `accountingTransaction`
filtrert på `accountType=3` (GL-siden), `accountNo` 3600-3699, `year=2026`, `voucherType _not_in [10,11]`
(10="Overført fra Fazile", 11="Utgående faktura" - Fazile sin normale automatiske fakturaflyt, IKKE
manuelle bilag, ekskludert per definisjon). Kjørt for alle 9 selskaper med reell 3600-3699-aktivitet
(se INVOICED sin kommentar for hvilke). Fant 110 linjer totalt (93 Mustad Eiendom AS, 9 Lilleaker
Sentrum AS, 3 Lilleakerveien 14 AS, 5 Mustadboliger AS, 0 i de øvrige 5), fordelt på voucherType
{1="Bank", 2="Sjekk", 12="Utgående kreditnota", 25="Innkjøps faktura", 39="Diverse"} - forekomsten
varierer per selskap. VESENTLIGHETSFILTER: kun linjer med |beløp| >= 50 000 kr er tatt med individuelt
under (mindre linjer - stort sett små parkeringsavregninger og kredittnotaer et par tusen kroner -
er utelatt; de netter til et lite, ikke vesentlig beløp per selskap og er ikke sporet videre). Linjer
som tydelig hører til samme bilag (samme voucherJournalNo OG samme bygg/orgUnit3) er slått sammen til
én oppføring (bilagsnr med "+" mellom auditNo). Bygg-navn slått opp via orgUnit3(...)-spørring per
selskap (orgUnit3-numre er selskaps-scoped, se REMAINING sin kommentar - IKKE antatt globale) og
kundenavn via associate(...) - alle nye linjer under er B2B-firmanavn, ingen privatpersoner funnet,
så INGEN anonymisering er nødvendig denne runden (i motsetning til de 4 eksisterende
"Tilskudd LTP"-linjene, som fortsatt er anonymisert til "Demokunde 40" her, se local.ts for ekte navn).
For linjer i et ANNET selskap enn Mustad Eiendom AS (som utgjør de aller fleste, som før) er
selskapsnavnet lagt til i parentes i `bygg`-feltet siden ManualNxtVoucher-interfacet ikke har et eget
selskapsfelt.

FUNN VED VERIFISERING (oppgave fra Morten - sjekk om 2025-avsetningen fortsatt stemmer): bilag 28779-4
(-12 141 099 kr, konto 3632) BLE bekreftet og stemmer eksakt (samme voucherJournalNo/auditNo/beløp/
dato/konto som før) - bygg er nå oppdatert fra "Ukjent" til "CC Vest Senter" siden ny data viser
orgUnit3=16 direkte på raden (ikke synlig i forrige uttrekksmetode). MEN: fant SAMTIDIG to nye,
beslektede linjer på samme voucherJournalNo-familie (28799, samme dato 2025-12-31, samme konto 3632,
samme bygg CC Vest Senter) som IKKE var med i forrige liste: en reversering av nøyaktig 28779-4 sitt
beløp (+12 141 099 kr) og en ny, korrigert avsetning (-11 112 558 kr) - netto for disse to +1 028 541 kr.
Summert med 28779-4 gir de tre linjene sammen -11 112 558 kr netto, som stemmer EKSAKT med tallet som
allerede er dokumentert i REMAINING og RECONCILIATION ("stort-enkeltbilag"-sjekken) som den reelle,
endelige avsetningsreverseringen. Forrige MANUAL_NXT-liste viste altså kun ÉN av de tre linjene i denne
korrigeringskjeden (fortsatt korrekt isolert sett, bare ufullstendig) - lagt til de to manglende under.

Fem linjer i forrige liste (bilagsnr 29478-6/10/14/3/18, "CC Vest senter/Granfoss Parkering ute/P-Bro
Parkering/Garasje") er FJERNET denne runden: verifisert direkte at disse faktisk er voucherType=11
("Utgående faktura" - normal Fazile-fakturaflyt), ikke reelt manuelle bilag. Forrige rundes
origin=ManuallyEntered-filter fanget dem trolig opp fordi en Fazile-generert faktura ble
manuelt re-trigget/korrigert i NXT uten at voucherType endret seg - men per dagens strengere,
verifiserte definisjon (voucherType, ikke origin) hører de ikke hjemme her. De var uansett alle
under vesentlighetsgrensen (1 538-15 863 kr) så fjerningen endrer ingen vesentlig konklusjon.

## BOOKED_3600_3699

OPPDATERT 2026-09-07 (v22, samme kilde/tidspunkt som INVOICED): se lib/incomeForecast.local.ts
sin tilsvarende kommentar for full forklaring - kort oppsummert: hentet på nytt med EKSPLISITT
period<=9-filter (ikke lenger "hele 2026 uten periodebegrensning"), så totalDelA/totalDelB her
er nå de HELT SAMME tallene som INVOICED sin periode-1-9-sum - de to stemmer eksakt overens for
første gang. AVVIK FUNNET OG RAPPORTERT: Mustad Eiendom AS sin bygg[]-sum mangler 571 134 kr
(~0,12 %) sammenlignet med selskapets belop - et lite antall posteringer i kontospennet mangler
orgUnit3/bygg-kode i NXT (verifisert med ROLLUP-spørring), beløpet er IKKE fordelt til noe bygg
under men ER med i selskapets totale belop. Lilleakerveien 32B AS sitt belop falt til 568 545,75
kr (fra 758 061 kr) fordi en forhåndsbokført Q4-postering (periode 10, utenfor jan-sep) korrekt
utelates nå som period<=9 filtreres eksplisitt - en rettelse, ikke et datatap.
