import type { IncomeForecastPart } from "./incomeForecastManual";

// Egen formatKr her (ikke import fra ./widgets) for å unngå sirkulær import:
// widgets.local.ts kaller buildIncomeForecastContext() herfra via lib/incomeForecast.ts.
function formatKr(n: number): string {
  return `${n.toLocaleString("nb-NO")} kr`;
}

export interface InvoicedPeriodTotal {
  periode: string; // "YYYY-MM"
  delA: number; // netto fakturert leie (3600-3699 ekskl. 3640/41/42)
  delB: number; // netto fakturert parkering (3640/41/42)
}

export interface InvoicedSnapshot {
  sistOppdatert: string; // "YYYY-MM-DD"
  ar: number;
  periods: InvoicedPeriodTotal[];
}

// Kilde: Visma Business NXT, generalLedgerPeriodBalance (accountNo 3600-3699 ekskl.
// 3640/41/42 = Del A leie, 3640-3642 = Del B parkering), aggregert per periode 1-8
// (jan-aug, periode 8 delvis siden dagens dato er 2026-08-14), summert over alle
// 22 Mustad-selskaper. Selskapsnivå-totaler, ingen leietaker-identifiserende data
// her — samme reelle tall som i .local.ts, se der for full metodikk-kommentar.
// EIERANDEL-KORRIGERT 2026-08-24 - se lib/incomeForecast.local.ts for full kommentar
// (samme reelle tall her, ingen leietaker-identifiserende data i denne konstanten).
// OPPDATERT 2026-08-30: se lib/incomeForecast.local.ts sin tilsvarende kommentar - periode 8
// dekker nå hele august (økte kun ~680 000 kr, IKKE hovedforklaringen på gapet mot budsjett).
// OPPDATERT 2026-09-07 (v22, fersk uttrekk periode 1-9): se lib/incomeForecast.local.ts sin
// tilsvarende kommentar for full metode/forklaring - kort oppsummert: hentet helt på nytt fra NXT,
// nå periode 1-9 (periode 9 delvis siden dagens dato er 2026-09-07). INVOICED og
// BOOKED_3600_3699 er denne runden hentet fra SAMME NXT-spørring/tidspunkt og stemmer derfor
// eksakt overens (totalDelA/totalDelB her = BOOKED_3600_3699 sine totalDelA/totalDelB), i
// motsetning til tidligere runder der de kom fra ulik metode/tidspunkt med et lite kjent avvik.
// Periode 1-8 er SVÆRT nær forrige uttrekk (delA opp ~32 350 kr av ~493 mill, delB praktisk talt
// uendret) - bekrefter konsistent metodikk, kun periode 9 er reelt nytt.
export const INVOICED: InvoicedSnapshot = {
  sistOppdatert: "2026-09-07",
  ar: 2026,
  periods: [
    { periode: "2026-01", delA: 141302960.75, delB: 12209572.7 },
    { periode: "2026-02", delA: 9026384.36, delB: 286410.92 },
    { periode: "2026-03", delA: 2914221.77, delB: 107459.94 },
    { periode: "2026-04", delA: 169500120.24, delB: 13329754.75 },
    { periode: "2026-05", delA: -5225742.48, delB: 866270.42 },
    { periode: "2026-06", delA: 13048334.02, delB: 1110845.81 },
    { periode: "2026-07", delA: 156629941.78, delB: 11678878.48 },
    { periode: "2026-08", delA: 5801749.73, delB: 324460.8 },
    { periode: "2026-09", delA: 4193282.75, delB: 367122.27 },
  ],
};

export interface RemainingAvvik {
  leietaker: string;
  bygg: string;
  belop: number;
  forklaring: string;
}

export interface RemainingSnapshot {
  sistOppdatert: string;
  ar: number;
  // Netto "gjenstår å fakturere" for resten av 2026, summert over alle leieforhold
  // (leietaker+bygg-par) - se metodikk-kommentar over REMAINING. IKKE lenger en
  // sikker/usikker-splitt (fornyelsesantagelse-konseptet er fjernet, se under).
  totalDelA: number;
  totalDelB: number;
  antallLeieforhold: number;
  antallIkkeMatchetFlagget: number;
  antallForklartOmsetningsleie: number;
  antallForklartKontraktsendring: number;
  antallAvsluttetNullstilt: number;
  antallInternMustad: number;
  // Leieforhold med et uforklart, ubekreftet avvik (allerede fakturert i NXT
  // avviker fra Fazile sin årsverdi uten kjent årsak) - tom i dag, men strukturen
  // finnes for å unngå at fremtidige avvik gjemmes i totalen uten varsel.
  uforklarteAvvik: RemainingAvvik[];
}

// Full re-fetch av alle 55 eiendommer med reell utleie (Fazile rent_roll) + "Bokført
// per leietaker" (NXT, eierandel-korrigert) - se scripts/build-remaining-summary.js
// for nøyaktig fremgangsmåte ved neste oppdatering. Full leietaker/bygg-detalj ligger
// i Redis-snapshotet bak "Gjenstår per leietaker (Fazile)"-fanen under (ETT
// datagrunnlag for begge, ikke to divergerende kilder) - denne konstanten er kun
// aggregatet som faktisk teller i prognosetotalen.
//
// METODIKK (endret 2026-08-24 etter tilbakemelding fra Morten, deretter forbedret
// samme dag etter en dypere gjennomgang av "leieforhold til gjennomgang"-listen -
// se memory/project_income-forecast-fazile-remaining-tenants-2026-08-24.md for full
// bakgrunn på alle rundene):
// - Leieforhold = (leietaker, bygg)-par - den fineste granulariteten NXT sin
//   bokføring faktisk tillater (generalLedgerTransaction grupperes på
//   customerNo+accountNo+orgUnit3, IKKE per Fazile kontrakt_id/linje_id).
// - Gjenstår = FULL 2026-verdi (årsbeløp justert for kontraktens faktiske start-/
//   sluttdato INNENFOR 2026, IKKE gjenværende dager i året) MINUS allerede fakturert
//   i NXT for samme leietaker+bygg i år. IKKE lenger en fremover-rettet
//   run-rate-pro-rata (forrige versjon, feil metodikk per Morten).
// - 50 %-eierandel: Fazile-siden halveres som før (Strandveien 10/Lilleakerveien
//   20-22 automatisk av rent_roll-verktøyet, Strandveien 4-8 manuelt pga. kjent
//   verktøy-bug). NXT-siden ("allerede fakturert") er OGSÅ eierandel-korrigert nå -
//   se INVOICED/BOOKED_3600_3699 sin kommentar: Fåbro Eiendom AS/Strandveien 10 AS/
//   Strandveien 4-8 AS bokfører 100 % i eget regnskap, halvert manuelt her.
// - Bygg-navn-alias: Fazile-seksjonsnavn og NXT-bygg-navn stemmer ikke alltid
//   eksakt (mellomromsvarianter, og CC Vest-senteret heter "Lilleakerveien 16" i
//   Fazile mot "CC Vest Senter" i NXT) - en kuratert alias-tabell i
//   scripts/build-remaining-summary.js løser de bekreftede tilfellene (10 aliaser,
//   inkl. "Lilleakerveien 2 Garasje"→"Lilleakerveien 2 - Garasje" som alene løste
//   44 leieforhold - funnet 2026-08-24 ved å sjekke om leietakernavnet fantes
//   EKSAKT i NXT under et annet bygg-navn for samme leietaker).
// - Leietakernavn-fallback: når eksakt normalisert navn ikke matcher, prøves et
//   "kjerne-navn" uten selskapsform/tegnsetting/bindestrek (f.eks. et leietakernavn
//   skrevet med "A/S" i Fazile mot "AS" i NXT, eller med bindestrek i Fazile mot
//   mellomrom i NXT, eller periode-uten-mellomrom i Fazile mot periode-med-mellomrom
//   i NXT), men KUN når kjerne-navnet peker til nøyaktig én reell NXT-leietaker
//   (unngår feilkobling ved tvetydighet). Løste 15 leieforhold 2026-08-24 (12 første runde, +3 etter at
//   bindestrek/punktum ble byttet til mellomrom i stedet for fjernet).
// - Interne Mustad-oppføringer ("Mustad Eiendom AS"/"Mustad Eiendomsdrift AS" som
//   "leietaker" i Fazile, egne lokaler/administrative posteringer): flagget separat
//   som "intern-mustad", ikke et reelt eksternt leieforhold - 21 leieforhold.
// - Del A (leie) / Del B (parkering)-METODIKKFEIL funnet og rettet 2026-08-24:
//   Fazile-siden bestemmer Del A/B via seksjonsnavn, NXT-siden via accountNo - for
//   SAMME leieforhold kan disse to metodene plassere beløpet i ULIKE deler (f.eks.
//   en kontorleiekontrakt der NXT har bokført noe under en parkeringskonto). Dette
//   ga meningsløse, store negative Del B-tall i sum selv om SUMMEN (Del A+B) var
//   riktig. Fikset: når et leieforhold entydig er ren Del A ELLER ren Del B på
//   Fazile-siden, nettes HELE "allerede fakturert" (begge NXT-kontoer) mot akkurat
//   det Del-et - løste hele 101 falske "kontraktsendring"/"omsetningsleie"-flagg
//   (150→49 og 31→12) uten å endre totalsummen (kun A/B-fordelingen).
// - Leieforhold uten treff i NXT: allerede fakturert=0, hele beløpet telles som
//   gjenstår (kan bety ny kontrakt, eller en gjenstående bygg-navn-mismatch) - 25
//   leieforhold, ned fra 110 før 2026-08-24-gjennomgangen. Klassifisert videre
//   (ikke individuelt matchet, kun gruppert etter mest sannsynlig årsak):
//   - Privatpersoner/små beløp på Sponhoggveien 2 og Lilleakerveien 2E (5 stk,
//     samlet under 150 000 kr) - trolig reelle, nye, små leieforhold.
//   - Kjente firmanavn med FLERE bygg der noen bygg mangler i NXT-datasettet for
//     akkurat den (leietaker,bygg)-kombinasjonen (f.eks. en leietaker med en egen
//     uteparkering-underseksjon) - ikke en navnefeil, bare ingen bokført historikk
//     ennå for den spesifikke underseksjonen.
//   - Ett leieforhold med et personnavn som inneholder "Mustad" (P-Bro mellom LV8
//     og LV4, 293 607 kr) - sannsynlig familietilknytning til Mustad-navnet, IKKE
//     reklassifisert som intern-mustad uten bekreftelse - flagget spesielt for
//     Mortens vurdering.
//   - Reelt nye/ukjente leietakere uten noen treff i NXT i det hele tatt.
//   - To leieforhold med full=0 - ikke reelt et avvik, ingen handling nødvendig.
//   Full liste: scripts/refresh-data/flagged-117.json (gitignored, ekte navn).
// - Leieforhold der Fazile viser 0 kr (kontrakten er avsluttet i dag) men NXT har
//   historisk fakturering i år: nullstilt til 0 (et avsluttet leieforhold genererer
//   ikke mer inntekt - historisk fakturering er ferdig, ikke "gjenstående").
//   10 leieforhold. MERK: én enkelt leietaker (Onepark AS, parkeringsoperatør)
//   alene står for 6 av disse 10, med samlet 4 622 785 kr "allerede fakturert" i
//   NXT i år fordelt på 6 bygg/uteparkeringer. Bekreftet 2026-08-25: parkeringen
//   faktureres etter tilsendt omsetningsrapport, utenfor vanlig Fazile-kontrakt -
//   derfor riktig at disse 6 nulles. MEN Onepark er fortsatt en løpende
//   driftsinntekt resten av året, så en manuell korreksjon er lagt til i Del B:
//   årsestimat fra Inntektsprognose-arkets "Onepark"-fane (9 457 370,44 kr) minus
//   allerede fakturert (4 622 785 kr) = 4 834 585,44 kr, lagt til som ETT samlet
//   portefølje-tillegg (ikke bygg-fordelt - Excel-arkets bygg-liste for Onepark
//   stemmer ikke 1:1 med Fazile sine 6 byggGrupper). Se
//   scripts/build-remaining-summary.js sin ONEPARK_ESTIMAT_2026-konstant og
//   "Gjenstår per leietaker (Fazile)"-fanen (status "forklart-parkering-onepark")
//   for full detalj.
// - Konto 3632 = avregning av 2025-OMSETNINGSLEIEN, ikke en 2026-inntekt (funnet
//   2026-08-25 etter et spørsmål fra Morten om en CC Vest-leietaker som viste mer
//   fakturert enn Fazile sin kontraktslinje). Bevis: en 2025-12-31-avsetning/
//   reversering bokført på "Andre (bokført uten leietakerreferanse)" (customerNo=0),
//   netto -11 112 558 kr, fordelt ut på ~38 enkeltposteringer pr. leietaker gjennom
//   jan-aug 2026 (11 652 752,78 kr) - nettoeffekt på 2026-bokføringen kun
//   540 194,78 kr. Disse postene er en ETTERSKUDDSVIS avregning av 2025 sin faktiske
//   omsetning, IKKE en 2026-leieinntekt, og er derfor ekskludert fra
//   alleredeFakturertDelA/DelB (og dermed fra totalDelA under) - se
//   OMSETNINGSAVREGNING_2025_KONTI-kommentaren i scripts/build-remaining-summary.js
//   for full sporing (avsetning/fordelt/nettoeffekt). Løftet totalDelA fra
//   154 264 137,48 til 165 860 886,86 kr (+11 596 749,38 kr - forskjellen mellom
//   "fordelt til leietakere" og litt avrunding/andre mindre 3632-poster).
// - Negative leieforhold (allerede fakturert > Fazile sin årsverdi) ETTER Del A/B-
//   fiksen OG 3632-fiksen over er undersøkt med faktiske NXT-transaksjoner (ikke
//   bare antatt) og faller i to bekreftede klasser, begge telt MED i totalen som de
//   er (ikke gulvet, ikke skjult):
//   1) CC Vest-leietakere (3 stk igjen etter 3632-fiksen, ned fra 12): resterende
//      omsetningsleie-/minimumsleie-avvik som IKKE forklares av konto 3632 alene -
//      egne, ekte avvik pr. leieforhold, ikke undersøkt case-for-case.
//   2) Andre leietakere (39 stk, ned fra 49 - se 2026-08-26-avsnitt under): Fazile
//      sitt rent_roll-uttrekk henter KUN kontraktslinjer som er aktive PÅ
//      uttrekksdatoen (aktiv_dato default = i dag) - når en kontrakt fornyes midt i
//      2026 (ny kontrakt-ID, ofte samme/lignende sats), forsvinner den utløpte
//      linjens del av året helt fra datagrunnlaget, selv om NXT korrekt har
//      fakturert for hele perioden. IKKE individuelt verifisert for alle
//      gjenværende 39 - dette er den bekreftede MEKANISMEN (9 leieforhold allerede
//      individuelt rettet, se under), ikke en fullstendig case-for-case-gjennomgang.
// - 2026-08-26 (Morten ba om en grundigere gjennomgang av negativ gjenstår): fant
//   og bekreftet rotårsaken over ved å sjekke faktiske Fazile-kontraktshistorikker
//   (ikke bare NXT-transaksjoner) for 9 leieforhold (8 bedrifter + 1 privat
//   leietaker - navn kun i gitignored scripts/refresh-data/, se ANONYMISERING.md) -
//   alle viste en kontrakt som fornyet seg midt i 2026 til samme/lignende sats, der
//   KUN den nye, kortere
//   kontraktens linje var med i datagrunnlaget. La til de manglende, utløpte
//   linjene manuelt (se scripts/refresh-data/fazile-remaining-tenants/
//   _additions-negativ-gjenstar-2026-08-26.json) - løftet totalDelA med
//   5 951 394,58 kr og totalDelB med 239 879,60 kr. De resterende ~39
//   "forklart-kontraktsendring"-leieforholdene er IKKE individuelt gått gjennom på
//   samme måte ennå (tidsbruk) - se memory/project_income-forecast-negative-
//   gjenstar-root-cause-2026-08-26.md for full status. En fullstendig fiks krever
//   et bredere Fazile-uttrekk (kun_aktive_linjer:false for alle ~55 eiendommer),
//   ikke gjort her.
// - Omsetningsleie-avregning FOR 2026 (dvs. den ekte, fremtidige varianten av
//   3632-mekanismen over, gjelder 2026 sin faktiske omsetning og betales trolig ut
//   i 2027) er fortsatt IKKE bygget som egen komponent - et eget tema Morten vil
//   se nærmere på senere, spesielt siden mange leietakere faktureres OVER
//   minimumsleien og dermed kan ha noe å hente tilbake ved lav omsetning.
// v2 (2026-08-26): parkerings-/garasje- og markedsbidragslinjer fjernet fra Del A. v3 (samme
// dag): fullstendig Fazile-uttrekk av alle EXPIRED-kontrakter (311 manglende 2026-relevante
// linjer lagt til), ny FAZILE_TO_NXT_ALIASES-mekanisme (8 tidligere uattribuerte leieforhold),
// og engangsgebyr/exit fee-forklaring for 3 store negative gjenstår-tilfeller. v4 (samme dag):
// erstattet navnematching mot NXT med en pålitelig kundenummer-ID-kobling (Fazile
// `customer.erp_code` === NXT `customerNo`) som primær metode - 670/685 matcher nå via ID. Se
// v3/v4-avsnittene i lib/incomeForecast.local.ts sin metodikk-kommentar for full forklaring.
// v5 (2026-08-27, samme dag): fant og fikset en NXT-bygg-matchefeil (co-working-underkoder
// "Modus"/"Co-work" manglet sammenslåing til hovedbygget, 12 leietakere), se v4-avsnittet i
// lib/incomeForecast.local.ts for full forklaring. totalDelA NED til 167 683 859,88 kr.
// OPPDATERT 2026-08-30 (v2, samme dag): se lib/incomeForecast.local.ts sin tilsvarende kommentar
// for full metode - "enda sikrere tall"-gjennomgang av alle 43 "forklart-kontraktsendring"-
// leieforhold (5 parallelle agenter + direkte fazile_graphql_query-verifisering). 34/43 er en
// ikke-fikserbar prorateringsforskjell (månedlig/360-dagers NXT-fakturering vs. dager/365-modell),
// 3 er kjente spesialtilfeller uten fiks, 5 agent-funn om "manglende linjer" viste seg ved
// kryssjekk å allerede være talt med andre steder (ville dobbelttalt). Kun 3 bekreftede tillegg
// (verifisert direkte mot Fazile sin contract_line-tabell): Kletor AS/Lilleakerveien 10 (CUSTOM
// Ladestasjon-linje, +10 350,62 kr DelA), Moss Maritime AS/Vollsveien 17 (CUSTOM Garasje-linje,
// +497 371,00 kr DelB), Scandinavian Cosmetics AS/Lilleakerveien 10 (ny kontrakt fra 2026-09-01,
// +663 933,15 kr DelA).
// OPPDATERT 2026-08-30 (v3, samme dag): se lib/incomeForecast.local.ts sin tilsvarende kommentar
// - gjennomgikk alle 18 "ikke-matchet-i-nxt"-leieforhold enkeltvis. 364 411 kr (Sporveien Trikken/
// Lysakerelva) hadde first_invoice_date=2027 i Fazile - genuint aldri fakturert, ikke "allerede
// forhåndsfakturert". 26 000 kr (Food Folk) var DRAFT-status, ikke signert. ~75 150 kr (Veidekke/
// Vedeld) var ALDRI et hull - allerede fakturert under hovedbyggets kode, ikke en egen
// parkerings-bygg-kode (bekreftet ved nesten eksakt kronebeløp-match, ny bygg-alias lagt til).
// OPPDATERT 2026-09-03 (v12, "konto-først"-parkering): Q4-revisjon av Del B (gjenstår parkering lå
// 6,3 mill kr over et normalkvartal) fant tre pipeline-svakheter: parkeringskvartal bokført på
// HOVEDBYGG-koden til blandede leieforhold ble nettet mot husleien (Del B viste 2 kvartaler
// gjenstår, Del A 1 for lite), Del B-bokføring i "feil" selskap/på generelle bygg-koder ble ikke
// funnet, og små Del A-posteringer på rene parkeringsgrupper ble dobbelttalt. Fikset ved at Del B
// nå beregnes kundenummer-bredt pr. leietaker: alt på parkeringskonto 3640-3642 (og
// parkeringsbygg-koder) på tvers av bygg og selskap samles i én pool og fordeles proporsjonalt på
// leietakerens Fazile-parkeringslinjer. Feilførte beløp vises korrekt med kommentar, ikke som
// avvik. Rettet samtidig en latent feil der REMAINING-totalene ikke fanget opp v11 sin
// kundebrede justering (konstanten under viste 23,9 mill Del B mens radene summerte til 19,7).
// totalDelB NED til 18 636 635,08 kr, totalDelA OPP til 168 402 669,06 kr.
// OPPDATERT 2026-09-04 (v13, Fazile-fakturaplan som primærkilde): Gjenstår hentes nå fra Fazile
// sine faktisk genererte/planlagte fakturalinjer (invoice_lines, konto 3600-3699) i stedet for
// "årsverdi minus bokført"; modellen er fallback der Fazile mangler planlagt faktura (ny status
// "fazile-plan-mangler"). Månedsfakturerte ekstrapoleres siste måned til årsslutt. Kreditnotaer
// på 3630 som speiler en 3632-avregning nøytraliseres parvis. Se lib/incomeForecast.local.ts
// for full forklaring. totalDelA NED til 164 395 403,18 kr, totalDelB NED til 18 088 295,58 kr.
// OPPDATERT 2026-09-05 (v14, egenleie): Mustad Eiendom AS sin egenleie i eget selskap (p-plasser til
// ansatte/lager) kan aldri bokføres - 6 leieforhold nullstilt (status "intern-egenleie"). Se
// lib/incomeForecast.local.ts. totalDelA NED til 163 829 418,33 kr, totalDelB NED til 17 270 022,27 kr.
// OPPDATERT 2026-09-06 (v15, kontraktslinje-sluttdato som ekstrapoleringshorisont): Månedsekstra-
// poleringen forlenget tidligere en leiefritakslinje (rabatt) til 31.12 selv om selve kontrakts-
// linjen slutter 30.11 - rent_roll kjenner ikke rabatt-/fritakslinjer, så horisonten falt tilbake
// til årsslutt. Nå slås contract_line.end_date opp (scripts/refresh-data/fazile-fakturaplan/
// contract-lines.json) og brukes som horisont. Ett leieforhold berørt. totalDelA OPP til
// 164 104 418,33 kr (+275 000), totalDelB uendret.
// OPPDATERT 2026-09-07 (v21, fersk NXT-uttrekk): "alleredeFakturert"-siden hentet på nytt fra NXT
// (9 selskaper, generalLedgerTransaction joinet mot customerTransaction for kundenummer - se
// scripts/refresh-data/nxt-booked-tenants/, verifyTotal-kontrollsum bestått mot uttrekksfilas eget
// totalBelop). Fazile-siden (fakturaplan) IKKE oppdatert i denne runden - sistOppdatert forblir
// fakturaplanens egen uttrekksdato. totalDelA NED til 164 065 688,99 kr, totalDelB NED til
// 17 128 652,57 kr. antallForklartOmsetningsleie/antallForklartKontraktsendring endret vesentlig
// (3→32, 45→52) som følge av bedre NXT-matching mot fersk data.
// OPPDATERT 2026-09-07 (v23, fersk Fazile rent_roll for alle 55 eiendommer): rådataen i
// scripts/refresh-data/fazile-remaining-tenants/ hentet på nytt for samtlige 55 eiendommer (samme
// NXT-uttrekk og fakturaplan som v21/v22, uendret). Leieforhold-antallet falt fra 726 til 674
// (−52) fordi et fersk rent_roll-uttrekk kun fanger kontraktslinjer aktive PÅ UTTREKKSDATOEN
// (i dag), mens forrige uttrekk (2026-08-29) var et fullstendig historisk 2026-sweep (12
// månedlige øyeblikksbilder pr. eiendom) som også fanget kontrakter som er utløpt tidligere i
// år uten fornyelse - et kjent, dokumentert gap (se punkt 3 i
// scripts/refresh-fazile-remaining-tenants.js sin header). totalDelA NED 1 716 701,34 til
// 162 348 987,65 kr, totalDelB NED 96 416,23 til 17 032 236,34 kr. antallIkkeMatchetFlagget NED
// til 9 (fra 14), antallForklartOmsetningsleie NED til 31 (fra 32) - færre rader å matche mot
// NXT når færre historiske leieforhold er med. Strandveien 4-8 sin eierandel-bug (Fazile viser 1
// i stedet for 0,5) er FORTSATT TIL STEDE - STRANDVEIEN_4_8_MANUAL_HALVING i
// build-remaining-summary.js beholdt uendret. Ingen eiendommer traff 2000-raders-grensen
// (største var Lilleakerveien 16 mm/CC Vest med 221 rader).
// OPPDATERT 2026-09-07 (v24, fersk Fazile rent_roll MED flerpunkts-dekning): v23 sitt
// enkelt-tidspunkts rent_roll-uttrekk (aktiv_dato = i dag, 2026-09-07) viste seg å systematisk
// MISTE tre typer kontraktslinjer, verifisert med tre konkrete eksempler: (1) Rema 1000 Norge AS
// (Vollsveien 13D) - signert kontrakt med start_dato 2026-10-01, altså IKKE aktiv ennå på
// uttreksdatoen, manglet derfor helt selv om den skal telle for okt-des 2026; (2) K&C Factory AS
// (Lilleakerveien 4CDEF) - kontrakten løp ut 2026-02-28 (med en oppfølgende linje ut 2026-06-30),
// altså ALLEREDE utløpt på uttrekksdatoen, manglet derfor selv om den skal telle for deler av
// året; (3) Reitan Convenience Norway AS/Kiosk 814 (Lilleakerveien 16 mm/CC Vest) - kontrakten
// løp ut 2026-08-31, kun 7 dager før uttrekksdatoen, samme mønster. Løsningen: rent_roll ble kjørt
// på nytt for alle 55 eiendommer ved 5 sjekkpunkter spredt over hele 2026 (2026-01-15, 04-01,
// 07-01, 09-07, 10-01), og resultatene ble slått sammen (union) og deduplisert på linje_id (verdier
// er identiske uansett hvilket tidspunkt en linje ble hentet på). Fant samtidig en beslektet,
// tidligere ukjent bug: flere eiendommer har DOBBELT mellomrom i sitt interne Fazile-navn
// (Lilleakerveien  2 Garasje/2AB/2CD/2E/2F/2G/4A/4CDEF/6/8_E) - rent_roll sitt eiendom-filter
// krever eksakt mellomrom-match, ikke bare substring, så et enkelt-mellomroms-søk på disse gir
// stille 0 treff. Rådataen for disse 10 eiendommene ble derfor hentet på nytt med korrekt
// dobbelt-mellomrom for å unngå at HELE eiendommen falt ut (ikke bare et fåtall linjer). Totalt
// 192 nye kontraktslinjer lagt til på tvers av alle 55 filer (1 208 -> 1 400 rader). Leieforhold-
// antallet OPP fra 674 til 724 - nærmere (2 under) det opprinnelig committede 726-tallet fra
// 2026-09-04-uttrekket, og godt over det forkastede 674-tallet, som forventet nå som hullene i
// stor grad er tettet. totalDelA OPP 1 320 347,69 fra 674-uttrekket til 163 669 335,34 kr (fortsatt
// 396 353,65 UNDER 726-uttrekkets 164 065 688,99 kr - andre, uavhengige NXT-/fakturaplan-endringer
// siden 2026-09-04 forklarer resten av avviket, ikke denne fiksen). totalDelB UENDRET på
// 17 128 652,57 kr - identisk med 726-uttrekket, altså var Del B allerede upåvirket av
// enkelt-snapshot-bugen (parkeringslinjene som manglet var stort sett Del A-linjer).
// antallIkkeMatchetFlagget OPP til 14 (fra 9) - tilbake på samme nivå som 726-uttrekket, som
// forventet med flere leieforhold å matche. antallForklartOmsetningsleie OPP til 34 (fra 31),
// antallForklartKontraktsendring NED til 48 (fra 52) - begge nærmere 726-uttrekkets 32/52 enn
// 674-uttrekkets tall. Strandveien 4-8 sin eierandel-bug (Fazile viser 1 i stedet for 0,5) er
// FORTSATT TIL STEDE - STRANDVEIEN_4_8_MANUAL_HALVING i build-remaining-summary.js beholdt
// uendret. Ingen eiendommer traff 2000-raders-grensen (største var fortsatt Lilleakerveien 16
// mm/CC Vest, nå med 240 rader mot 221 før).
// OPPDATERT 2026-09-07 (v25, korrigert NXT-koblingsmetode): v21 sitt NXT-uttrekk ("allerede
// fakturert"-siden) koblet generalLedgerTransaction mot customerTransaction via voucherNo - BEVIST
// FEIL i dag: voucherNo er kun unikt INNENFOR sin egen bilagsserie, ikke på tvers av hele
// regnskapet, så koblingen fanget opp urelaterte transaksjoner (konkret bevis: en enkelt, stor
// leietaker - se lib/incomeForecast.local.ts for navn, ekte leietakernavn hører ikke hjemme i
// denne committede fila - fikk tidligere feilaktig tilordnet beløp fra 16 forskjellige bygg den
// ikke leier i, når den i virkeligheten kun leier ett bygg + ett kjent, legitimt beløp på et
// annet bygg). Korrigert metode: `accountingTransaction` har `customerNo`, `accountNo` OG
// `orgUnit3` DIREKTE på samme rad (filtrert `accountType=3` for GL-siden) - ingen join nødvendig.
// Sanity-sjekket FØR full kjøring mot de to kjente byggene for denne leietakeren: -57 603 552,50 kr
// (innenfor forventet 55-60 mill) og -36 886 606,68 kr (bekrefter kjent, legitimt beløp) - begge
// bestått. Alle 9 aktive selskaper hentet på nytt (samme eierandel-halvering som før for Fåbro
// Eiendom AS/Strandveien 10 AS/Strandveien 4-8 AS). Ny råtotalsum 537 204 083,24 kr, svært nær
// v21-24 sin gamle (feilkoblede) 537 472 029,01 kr (BOOKED_3600_3699, urørt denne runden) - altså
// var den AGGREGERTE selskaps-/kontonivå-summen tilfeldigvis nesten riktig selv med feil metode
// (feilen omfordelte beløp MELLOM leietakere/bygg innenfor samme selskap, ikke på tvers av
// selskaper), men PR.-LEIETAKER/BYGG-fordelingen var upålitelig - det er nettopp den fordelingen
// REMAINING bruker for å beregne "allerede fakturert pr. leieforhold". Avstemming i
// refresh-nxt-booked-tenants.js: differanse 0,00 kr. Effekt på REMAINING: totalDelA OPP 38 729,34
// til 163 708 064,68 kr, totalDelB NED 16 065,30 til 17 112 587,27 kr - begge små endringer i sum
// (metoden omfordelte mellom leieforhold, den samlede porteføljetotalen var lite påvirket).
// antallForklartOmsetningsleie NED til 5 (fra 34) og antallForklartKontraktsendring NED til 43
// (fra 48) - en god del leieforhold som tidligere ble klassifisert i disse to catch-all-
// kategoriene (basert på feilkoblet "allerede fakturert") havner nå i andre/ingen kategori med
// korrekt NXT-data. Fazile-siden (fakturaplan) IKKE oppdatert i denne runden - kun NXT-siden.
export const REMAINING: RemainingSnapshot = {
  sistOppdatert: "2026-09-07",
  ar: 2026,
  totalDelA: 163708064.68,
  totalDelB: 17112587.27,
  antallLeieforhold: 724,
  antallIkkeMatchetFlagget: 14,
  antallForklartOmsetningsleie: 5,
  antallForklartKontraktsendring: 43,
  antallAvsluttetNullstilt: 8,
  antallInternMustad: 12,
  uforklarteAvvik: [],
};

export interface ManualNxtVoucher {
  bilagsnr: string;
  dato: string;
  periode: string; // "YYYY-MM"
  konto: string;
  bygg: string;
  del: IncomeForecastPart;
  belop: number;
  kategori: string;
  tekst: string;
}

export interface ManualNxtSnapshot {
  sistOppdatert: string;
  ar: number;
  vouchers: ManualNxtVoucher[];
}

// Se lib/incomeForecast.local.ts for full metodikk-kommentar. Leietakernavn i bilagstekst
// er anonymisert til "Demokunde N" (samme krysskobling som ellers) siden dette er en
// leietaker-identifiserende tekststreng.
// RE-VERIFISERT 2026-08-30 - se lib/incomeForecast.local.ts, identisk resultat, ingen endring.
export const MANUAL_NXT: ManualNxtSnapshot = {
  sistOppdatert: "2026-08-30",
  ar: 2026,
  vouchers: [
    {
      bilagsnr: "28779-4",
      dato: "2025-12-31",
      periode: "2026-01",
      konto: "3632",
      bygg: "Ukjent (ikke spesifisert i bilagstekst)",
      del: "A",
      belop: -12141099,
      kategori: "Omsetningsleie-avsetning (justering/reversering)",
      tekst: "Avsetning omsetningsleie 2025 iht vedlegg",
    },
    {
      bilagsnr: "29478-6",
      dato: "2026-02-19",
      periode: "2026-03",
      konto: "3640",
      bygg: "CC Vest senter",
      del: "B",
      belop: 15863.2,
      kategori: "Parkering",
      tekst: "CC Vest senter - Parkering avg.pl. 3 pl",
    },
    {
      bilagsnr: "29478-10",
      dato: "2026-02-19",
      periode: "2026-03",
      konto: "3640",
      bygg: "Granfoss Parkering ute",
      del: "B",
      belop: 1538.4,
      kategori: "Parkering",
      tekst: "Granfoss Parkering ute - Parkering avg.pl fri-flyt",
    },
    {
      bilagsnr: "29478-14",
      dato: "2026-02-19",
      periode: "2026-03",
      konto: "3640",
      bygg: "Granfoss Parkering ute",
      del: "B",
      belop: 2167.2,
      kategori: "Parkering",
      tekst: "Granfoss Parkering ute - Parkering avg.pl fri-flyt",
    },
    {
      bilagsnr: "29478-3",
      dato: "2026-02-20",
      periode: "2026-03",
      konto: "3601",
      bygg: "P-Bro",
      del: "A",
      belop: 4140,
      kategori: "Garasje",
      tekst: "P-Bro - Garasje avg.pl. 2 pl",
    },
    {
      bilagsnr: "29478-18",
      dato: "2026-03-01",
      periode: "2026-03",
      konto: "3640",
      bygg: "Granfoss Parkering ute",
      del: "B",
      belop: 2167.2,
      kategori: "Parkering",
      tekst: "Granfoss Parkering ute - Parkering avg.pl fri-flyt",
    },
    {
      bilagsnr: "19644-15",
      dato: "2026-03-31",
      periode: "2026-03",
      konto: "3637",
      bygg: "CC Vest senter",
      del: "A",
      belop: -107142.86,
      kategori: "Tilskudd til leietaker (LTP)",
      tekst: "Tilskudd LTP CC Vest - Demokunde 40",
    },
    {
      bilagsnr: "19644-17",
      dato: "2026-06-30",
      periode: "2026-06",
      konto: "3637",
      bygg: "CC Vest senter",
      del: "A",
      belop: -107142.86,
      kategori: "Tilskudd til leietaker (LTP)",
      tekst: "Tilskudd LTP CC Vest - Demokunde 40",
    },
    {
      bilagsnr: "19644-19",
      dato: "2026-09-30",
      periode: "2026-09",
      konto: "3637",
      bygg: "CC Vest senter",
      del: "A",
      belop: -107142.86,
      kategori: "Tilskudd til leietaker (LTP) - forhåndsbokført",
      tekst: "Tilskudd LTP CC Vest - Demokunde 40",
    },
    {
      bilagsnr: "19644-21",
      dato: "2026-12-31",
      periode: "2026-12",
      konto: "3637",
      bygg: "CC Vest senter",
      del: "A",
      belop: -107142.86,
      kategori: "Tilskudd til leietaker (LTP) - forhåndsbokført",
      tekst: "Tilskudd LTP CC Vest - Demokunde 40",
    },
  ],
};

export interface BookedAccountRangeBuildingTotal {
  bygg: string;
  belop: number;
}

export interface BookedAccountRangeCompanyTotal {
  selskap: string;
  belop: number;
  bygg: BookedAccountRangeBuildingTotal[];
}

export interface BookedAccountRangeSnapshot {
  sistOppdatert: string;
  ar: number;
  kontoFra: number;
  kontoTil: number;
  totalBelop: number;
  totalDelA: number;
  totalDelB: number;
  perSelskap: BookedAccountRangeCompanyTotal[];
}

// Bygg-/selskapsnavn, ikke leietaker-identifiserende - identisk med .local.ts, ingen
// anonymisering nødvendig. EIERANDEL-KORRIGERT 2026-08-24, se lib/incomeForecast.local.ts
// for full metodikk-kommentar.
// OPPDATERT 2026-09-07 (v22, samme kilde/tidspunkt som INVOICED): se lib/incomeForecast.local.ts
// sin tilsvarende kommentar for full forklaring - kort oppsummert: hentet på nytt med EKSPLISITT
// period<=9-filter (ikke lenger "hele 2026 uten periodebegrensning"), så totalDelA/totalDelB her
// er nå de HELT SAMME tallene som INVOICED sin periode-1-9-sum - de to stemmer eksakt overens for
// første gang. AVVIK FUNNET OG RAPPORTERT: Mustad Eiendom AS sin bygg[]-sum mangler 571 134 kr
// (~0,12 %) sammenlignet med selskapets belop - et lite antall posteringer i kontospennet mangler
// orgUnit3/bygg-kode i NXT (verifisert med ROLLUP-spørring), beløpet er IKKE fordelt til noe bygg
// under men ER med i selskapets totale belop. Lilleakerveien 32B AS sitt belop falt til 568 545,75
// kr (fra 758 061 kr) fordi en forhåndsbokført Q4-postering (periode 10, utenfor jan-sep) korrekt
// utelates nå som period<=9 filtreres eksplisitt - en rettelse, ikke et datatap.
export const BOOKED_3600_3699: BookedAccountRangeSnapshot = {
  sistOppdatert: "2026-09-07",
  ar: 2026,
  kontoFra: 3600,
  kontoTil: 3699,
  totalBelop: 537472029.01,
  totalDelA: 497191252.92,
  totalDelB: 40280776.09,
  perSelskap: [
    {
      selskap: "Mustad Eiendom AS",
      belop: 459305789.81,
      bygg: [
        { bygg: "CC Vest Senter", belop: 118848013.46 },
        { bygg: "Lilleakerveien 6", belop: 58138396.32 },
        { bygg: "Lilleakerveien 4E", belop: 36886606.68 },
        { bygg: "Lilleakerveien 8", belop: 34806848.87 },
        { bygg: "Lilleakerveien 2A", belop: 28949080.59 },
        { bygg: "Lilleakerveien 2B", belop: 23455365.88 },
        { bygg: "Vollsveien 13H", belop: 21096274.79 },
        { bygg: "Lilleakerveien 4C", belop: 18159264.18 },
        { bygg: "Mustads vei 1", belop: 12807323.07 },
        { bygg: "Lilleakerveien 4A", belop: 12304432.33 },
        { bygg: "Lilleakerveien 10", belop: 11512588.06 },
        { bygg: "Lilleakerveien 6D", belop: 10321655.74 },
        { bygg: "Vollsveien 19", belop: 8738235.03 },
        { bygg: "Vollsveien 17", belop: 8215342.61 },
        { bygg: "Lilleakerveien 2C", belop: 6704528.93 },
        { bygg: "Lilleakerveien 2D", belop: 5167521.8 },
        { bygg: "Vollsveien 13C", belop: 4864487.21 },
        { bygg: "Lilleakerveien 2E", belop: 4605279.59 },
        { bygg: "Lilleakerveien 2 - Garasje", belop: 4217011.22 },
        { bygg: "Lilleakerveien 6 P-hus", belop: 3120305.28 },
        { bygg: "Lilleakerveien 2 - Felles", belop: 2217767 },
        { bygg: "Vollsveien 13D", belop: 2192951.19 },
        { bygg: "Lilleakerveien 4CDEF Uteparkering", belop: 2115520.88 },
        { bygg: "Vollsveien 13B", belop: 2110067.48 },
        { bygg: "Lilleakerveien 24C", belop: 1687812.4 },
        { bygg: "Vollsveien 17-19-21 Uteparkering", belop: 1551270.17 },
        { bygg: "Vollsveien 21", belop: 1537214.14 },
        { bygg: "Sponhoggveien 2", belop: 1534648.76 },
        { bygg: "Vollsveien 13E", belop: 1446392.98 },
        { bygg: "Lilleakerveien 30", belop: 1277648.42 },
        { bygg: "Lilleakerveien 4A Modus", belop: 1159782 },
        { bygg: "Vollsveien 13-17-19 Uteparkering", belop: 971037.48 },
        { bygg: "P-Bro mellom LV8 og LV4", belop: 968059.11 },
        { bygg: "Lilleakerveien 16 Bilforretning", belop: 703333.33 },
        { bygg: "Vollsveien 13F", belop: 697199.16 },
        { bygg: "Lilleakerveien 18", belop: 696736.54 },
        { bygg: "Mustads vei 10", belop: 505886.27 },
        { bygg: "(Ikke bruk) Uteområde Sør", belop: 371968 },
        { bygg: "Lilleakerveien 2G", belop: 328543 },
        { bygg: "Mustads vei 12", belop: 277931.6 },
        { bygg: "Lilleakerveien 14 Uteparkering", belop: 273460.41 },
        { bygg: "Vollsveien 13D Uteparkering", belop: 181788.34 },
        { bygg: "Parkering ute Lilleakerveien", belop: 167122 },
        { bygg: "Lilleakerveien 4D", belop: 160244.64 },
        { bygg: "Lilleakerveien 2C, Plan 3 Co-work", belop: 159339 },
        { bygg: "Områdekostnader - Felles", belop: 110651 },
        { bygg: "Lilleakerveien 4A Uteparkering", belop: 80441.53 },
        { bygg: "Lilleakerveien 20", belop: 78232 },
        { bygg: "Vollsveien 13G", belop: 71361 },
        { bygg: "Lilleakerveien 10 Uteparkering", belop: 61358 },
        { bygg: "Fåbro Gårdeierforening", belop: 49216 },
        { bygg: "Carl Lundgrensvei Uteparkering", belop: 43250 },
        { bygg: "Lilleakerveien 16 Uteparkering", belop: 21987.54 },
        { bygg: "Vollsveien 17 Sør Uteparkering", belop: 5872.8 },
      ],
    },
    {
      selskap: "Strandveien 4-8 AS",
      belop: 23413606.29,
      bygg: [
        { bygg: "Strandveien 4-8", belop: 23413606.29 },
      ],
    },
    {
      selskap: "Lilleakerveien 14 AS",
      belop: 21052050.75,
      bygg: [
        { bygg: "Lilleakerveien 14", belop: 20622902.38 },
        { bygg: "Lilleakerveien 14 Uteparkering", belop: 429148.37 },
      ],
    },
    {
      selskap: "Fåbro Eiendom AS",
      belop: 17885358.65,
      bygg: [
        { bygg: "Lilleakerveien 22", belop: 10285143.96 },
        { bygg: "Lilleakerveien 20", belop: 7421116.79 },
        { bygg: "Lilleakerveien 20-22 Uteparkering", belop: 179097.9 },
      ],
    },
    {
      selskap: "Lilleaker Sentrum AS",
      belop: 10299476.25,
      bygg: [
        { bygg: "Lilleakerveien 31", belop: 9936213.41 },
        { bygg: "Lilleakerveien 29", belop: 363262.84 },
      ],
    },
    {
      selskap: "Mustadboliger AS",
      belop: 3392651.35,
      bygg: [
        { bygg: "Lilleakerveien 26", belop: 1804307.71 },
        { bygg: "Gamle Drammensvei 10", belop: 640186.6 },
        { bygg: "Arnstein Arnebergs vei 4", belop: 439338.85 },
        { bygg: "Lilleakerveien 19", belop: 341618.19 },
        { bygg: "Holmenveien 16", belop: 142200 },
        { bygg: "Mustadkroken", belop: 25000 },
      ],
    },
    {
      selskap: "Lilleaker Næring AS",
      belop: 972309.1,
      bygg: [
        { bygg: "Lilleakerveien 2F", belop: 972309.1 },
      ],
    },
    {
      selskap: "Strandveien 10 AS",
      belop: 582241.06,
      bygg: [
        { bygg: "Strandveien 10", belop: 582241.06 },
      ],
    },
    {
      selskap: "Lilleakerveien 32B AS",
      belop: 568545.75,
      bygg: [
        { bygg: "Lilleakerveien 32B", belop: 568545.75 },
      ],
    },
  ],
};

// Leietype-fordeling — egen Fazile-spørring 2026-08-24 (leietakerliste, group_by=leietype,
// hele porteføljen, aktive kontrakter i dag), til "Gjenstår å fakturere"-drilldown.
// MERK: dette er BREDERE enn "Gjenstår å fakturere" (REMAINING) - REMAINING teller kun rene
// husleie/parkeringslinjer (linjetype RENT i rent_roll, Del A/B), mens denne fordelingen
// inkluderer ALLE kostnadstyper (felleskostnader, energi, markedsføringsbidrag osv. - se
// "kostnadstyper-ikke-med"-sjekken). Til orientering/drilldown, ikke en nedbryting av selve
// gjenstår-tallet.
export interface LeietypeBreakdown {
  sistOppdatert: string;
  totalArsleie: number;
  antallLinjer: number;
  perLeietype: Record<string, number>;
}

export const LEIETYPE_BREAKDOWN: LeietypeBreakdown = {
  sistOppdatert: "2026-08-24",
  totalArsleie: 959071173.17,
  antallLinjer: 3301,
  perLeietype: {
    Husleie: 538615749.18,
    Annet: 202024447.87,
    Felleskostnader: 67891540.91,
    Garasjeleie: 42421643.93,
    Energi: 38574896.41,
    Lagerleie: 23338886.3,
    Kantinebidrag: 16806200.34,
    Markedsføringsbidrag: 13366078.51,
    Parkering: 11331181.06,
    Administrasjonsbidrag: 4100236.68,
    Basestasjon: 336550.27,
    Enøk: 849910.4,
    Datarom: 114487.38,
    Gjesteparkering: 89063.84,
    Rabatt: -789699.91,
  },
};

export type ReconciliationStatus = "ok" | "varsel" | "feil";

export interface ReconciliationCheck {
  id: string;
  label: string;
  status: ReconciliationStatus;
  notat: string;
}

export interface ReconciliationSnapshot {
  sistOppdatert: string;
  checks: ReconciliationCheck[];
}

export const RECONCILIATION: ReconciliationSnapshot = {
  sistOppdatert: "2026-08-24",
  checks: [
    {
      id: "totalsum-plausibel",
      label: "Total prognose 2026 er i rimelig størrelsesorden",
      status: "ok",
      notat:
        "Del A ~645,7 mill kr + Del B ~55,8 mill kr = ~701,5 mill kr totalt for 2026 (fakturert hittil + gjenstående + manuelle bilag). Del A gikk opp fra ~634,1 mill kr til ~645,7 mill kr 2026-08-25 da konto 3632 (avregning av 2025-omsetningsleien, IKKE en 2026-inntekt - se REMAINING sin kommentar) ble ekskludert fra leietakernes 'allerede fakturert' - løftet gjenstår-siden med 11 596 749,38 kr og forklarer samtidig hvorfor mange CC Vest-leietakere tidligere viste negativ gjenstår. Før det gikk Del B opp fra ~51,0 mill kr til ~55,8 mill kr 2026-08-25 da Onepark-parkeringsestimatet (4 834 585,44 kr, årsestimat fra Inntektsprognose-arket minus allerede fakturert) ble lagt til. Før det igjen gikk totalen ned fra ~686,6 mill kr etter en videre gjennomgang av de 120 flaggede leieforholdene 2026-08-24 (kjerne-navn-fallback utvidet til å bytte bindestrek/punktum med mellomrom i stedet for å fjerne dem - løste 3 til), fra ~713,7 mill kr etter en dypere gjennomgang av leieforhold-matchingen (bygg-navn-alias, kjerne-navn-fallback, Del A/B-nettingsfiks - se 'leieforhold-avvik-forklart'-sjekken), fra ~813,7 mill kr da metodikken ble lagt om til leieforhold-nivå, og fra ~844,4 mill kr før eierandel-korreksjonen.",
    },
    {
      id: "avvik-juli-2026-kryssjekk",
      label: "Kryssjekket prognosen mot Finance sin egen avviks-logg",
      status: "ok",
      notat:
        "Inntektsprognose-fila har et ark 'Avvik juli-2026' (120 rader) - Finance sin egen, manuelt førte kontraktslinje-nivå-logg over kjente endringer vs. opprinnelig budsjett, med fritekst-kommentar pr. linje. Kryssjekket 2026-08-26 mot 'Potensiell fremtidig inntekt': bekreftet alle fire kjente signerte-men-ikke-Fazile-registrerte kontrakter der, rettet en feil bygg-referanse (én av de fire lå på feil bygg), og la til presiseringer om tidsforskyvning/leiefritak/usikkerhet for tre av dem - se kategorien sitt eget notat. Avdekket to nye, konkrete funn IKKE tidligere fanget opp av NXT/Fazile-baserte tall: (1) en exit fee/mulig-tapt-leie-sak (netto +1 044 562 kr) og (2) en konkursrisiko hos en enkelt leietaker (−2 000 000 kr) - begge lagt inn som egne 'Mine manuelle linjer' (se Tillegg-fanen for detaljer og kilde - ekte leietakernavn/sensitiv informasjon holdes kun der, ikke i denne kommentaren). Arkets EGEN nettosum for kjente avvik (+6 171 306 kr) er vesentlig lavere enn vårt eget beregnede gap mot budsjett (−23,1 mill kr for bokført+gjenstår alene) - de to metodikkene måler ikke identiske ting (Finance sin logg er deltaer mot en allerede ikke-null budsjett-forutsetning pr. areal, vår beregning er fra null) og er IKKE videre avstemt i denne runden.",
    },
    {
      id: "stort-enkeltbilag",
      label: "Stort enkeltstående manuelt bilag",
      status: "ok",
      notat:
        "Bilag 28779-4 (Mustad Eiendom AS, 'Avsetning omsetningsleie 2025 iht vedlegg', -12,14 mill kr) er nå fullt forklart (2026-08-25): det er reverseringen av en 2025-årsavsetning for omsetningsleie, bokført på 'Andre (bokført uten leietakerreferanse)' (customerNo=0, konto 3632), netto -11 112 558 kr. Gjennom jan-aug 2026 er avsetningen fordelt ut på ~38 enkeltposteringer pr. leietaker (11 652 752,78 kr) - nettoeffekt på 2026-bokføringen kun 540 194,78 kr. Begge sider er nå ekskludert fra leietakernes 2026-gjenstår i REMAINING (se scripts/build-remaining-summary.js).",
    },
    {
      id: "nxt-eierandel-feil",
      label: "NXT bokfører 100 % for tre 50 %-eide bygg - korrigert",
      status: "ok",
      notat:
        "Fåbro Eiendom AS, Strandveien 10 AS og Strandveien 4-8 AS bokfører 100 % av leieinntekten i sitt eget NXT-regnskap, ikke Mustads 50 %-andel (verifisert kvantitativt: NXT sin annualiserte rate for én leietaker i hvert av Strandveien 4-8 og Strandveien 10 matchet Fazile sin UHALVERTE verdi, ikke den halverte). INVOICED og BOOKED_3600_3699 er korrigert 2026-08-24 (halvert for disse 3 selskapene, som har 100 % av sin omsetning knyttet til de eierandel-byggene).",
    },
    {
      id: "kostnadstyper-ikke-med",
      label: "Felleskostnader/energi/eiendomsskatt/kantinebidrag er ikke med i 'Gjenstår å fakturere'",
      status: "ok",
      notat:
        "Verifisert direkte mot Fazile sitt skjema 2026-08-24: dette er (heldigvis) tilfelle, men som en bivirkning av datamodellen - felleskostnader (contract_line.type='COMMON_COSTS') mangler leieobjekt-referanse og kan derfor ikke kobles til en seksjon av rent_roll, mens energi/eiendomsskatt/kantinebidrag ligger som en udokumentert 'CUSTOM'-type verktøyet ikke gjenkjenner. Markedsføringsbidrag (MARKETING_FEE) er ikke spesifikt verifisert. Siden dette er en bivirkning av verktøyet og ikke et bevisst, robust filter, bør det sjekkes på nytt hvis Fazile endrer rent_roll.",
    },
    {
      id: "leieforhold-avvik-forklart",
      label: "117 av 729 leieforhold er flagget til gjennomgang - 0 uforklarte",
      status: "ok",
      notat:
        "Etter Morten sin oppfølging 2026-08-24 ('finn hva de heter i NXT, snevre ned antallet') ble 297 opprinnelig flaggede leieforhold undersøkt på nytt: 5 nye bygg-navn-aliaser (bl.a. 'Lilleakerveien 2 Garasje'→'Lilleakerveien 2 - Garasje', fant 44 skjulte treff) og en kjerne-navn-fallback (stavevarianter, 15 treff totalt inkl. bindestrek-/punktumvarianter) løste 85 av 110 'ikke matchet'-tilfeller. En Del A/B-nettingsfiks fjernet 101 falske 'kontraktsendring'/'omsetningsleie'-flagg forårsaket av at Fazile og NXT klassifiserer leie vs. parkering ulikt for samme leieforhold. Resultat: 25 fortsatt uten NXT-treff (ny kontrakt eller gjenstående navn-/bygg-mismatch - se REMAINING sin kommentar for videre inndeling: privatpersoner, kjente firma på ekstra underseksjoner, ett leieforhold med et Mustad-slektsnavn som mulig familietilknytning, reelt nye leietakere, og 2 med 0 kr), 12 CC Vest-leieforhold med trolig omsetningsleie-avregning i NXT (bekreftet for én leietaker; NED TIL 3 stk 2026-08-25 etter at konto 3632/2025-avsetningen ble identifisert og ekskludert separat - se 'stort-enkeltbilag'-sjekken - de resterende 9 var altså denne samme mekanismen, ikke et eget fenomen), 49 med trolig kontraktsendring/indeksregulering i året (bekreftet for én leietaker, IKKE individuelt verifisert for alle 49), 10 allerede avsluttet i Fazile og nullstilt til 0 (hvorav én enkelt leietaker alene utgjør 6 stk og 4,6 mill kr - stort nok til at Morten bør sjekke det spesielt). I tillegg er 21 leieforhold der 'leietaker' er Mustad selv (egne lokaler) flagget separat som 'intern-mustad' - ikke reelle eksterne leieforhold. 0 uforklarte avvik gjenstår.",
    },
    {
      id: "del-ab-metodikk-ulik",
      label: "Del A/B-splitten er ikke identisk metodikk på tvers av kilder",
      status: "varsel",
      notat:
        "INVOICED bruker NXT-kontonummer (3640-3642=Del B). REMAINING (Fazile) bruker en seksjonsnavn-heuristikk ('garasje'/'parkering'/'p-hus'/'p-bro' i navnet). For REMAINING sin leieforhold-beregning er hovedeffekten av dette rettet 2026-08-24 (netter hele 'allerede fakturert' mot Fazile sitt Del for entydige leieforhold, se scripts/build-remaining-summary.js), men splitten er fortsatt IKKE identisk metodikk på tvers av INVOICED og REMAINING generelt - grov, men nå konsistent innad i hver kilde.",
    },
    {
      id: "invoiced-vs-booked-avvik",
      label: "INVOICED vs. Bokført (3600-3699): ~0,7 % avvik - forventet, ikke en feil",
      status: "ok",
      notat:
        "Kontrollert 2026-08-24: INVOICED (periodisert NXT-uttrekk, periode 1-8) summerer til 532,2 mill kr, BOOKED_3600_3699 (punkt-i-tid kontogruppe-uttrekk) til 535,9 mill kr - et avvik på ca. 3,7 mill kr (0,7 %). Forventet: de to hentes med ulik metode/tidspunkt (periodisert regnskap vs. rå kontosaldo), ikke bevis på en feil. Ingen handling nødvendig.",
    },
    {
      id: "kontraktsutlop-vs-remaining-ingen-dobbelttelling",
      label: "Kontraktsutløp-2026 vs. Gjenstår: ingen dobbelttelling - verifisert med 2 konkrete leieforhold",
      status: "ok",
      notat:
        "Verifisert 2026-08-24 med to konkrete eksempler (ikke bare antatt): (1) et leieforhold hvis kontrakt utløp tidlig i 2026 UTEN fornyelse mangler HELT fra REMAINING sitt leieforhold-datasett (Fazile sin aktive-kontrakt-pull viser bare det som er aktivt i dag) - den faktiske delårsinntekten er likevel korrekt fanget opp i INVOICED (NXT-fakturert hittil), og kun den hypotetiske fornyelsesverdien ligger i 'ekstra i 2026 hvis fornyet' (32,4 mill kr) - ingen overlapp. (2) et leieforhold som ER reforhandlet viser i REMAINING sin data den NYE kontraktens fulle årsverdi (etterfølgerkontrakten er allerede en egen, aktiv linje i Fazile) - og får riktig ekstraI2026=0 i kontraktsutløp-fanen (unngår dobbelttelling for allerede sikrede fornyelser).",
    },
    {
      id: "gnr-bnr-uverifisert",
      label: "8 mindre tomteeiendommer (Gnr./Bnr.) ga ingen treff i Fazile",
      status: "varsel",
      notat:
        "Rent roll-spørringen for disse 8 eiendommene ('Gnr. 10 Bnr. 704' m.fl.) returnerte 'ingen seksjoner matchet filtrene' for alle - ikke bekreftet om dette er reelt tomme tomter eller en navnestreng-mismatch. Lav sannsynlig påvirkning (små tomter), men ikke verifisert.",
    },
    {
      id: "kontraktsutlop-eierandel-feil-funnet-og-rettet",
      label: "Kontraktsutløp-2026 manglet eierandel-korrigering - funnet og rettet",
      status: "ok",
      notat:
        "Kontrollrunde 2026-08-24: kontraktsutlop-verktøyet auto-halverer IKKE for Strandveien 4-8/10/Lilleakerveien 20-22 (i motsetning til rent_roll/leietakerliste) - 4 linjer (2 leietakere på Strandveien 4-8) var ikke halvert. Rettet i scripts/build-contract-expiry-2026.js (bruker nå samme delte lib/data/ownership-shares.json som resten av prosjektet). Effekt: totalArsleie/reell eksponering ned ca. 242 219 kr, 'ekstra i 2026 hvis fornyet' ned ca. 42 988 kr - liten kroneverdi, men en reell feil som er rettet.",
    },
    {
      id: "vollsveien-13g-uavklart",
      label: "\"Vollsveien 13G\" i NXT-budsjettet har ingen bekreftet Fazile-motpart",
      status: "varsel",
      notat:
        "Kryssjekket alle 49 NXT-budsjett-bygg mot Fazile sin fulle 68-bygg-liste 2026-08-24: 11 av 12 avvik er kjente, dokumenterte alias (nå samlet i lib/data/building-registry.json). 'Vollsveien 13G' (284 494,20 kr i budsjett 2026) er IKKE gjenkjent under noe kjent navn på Fazile-siden - kan være en NXT-intern kostnadsplass uten fysisk motpart, eller en reell seksjon under et annet navn. IKKE gjettet - flagget i building-registry.json sin 'uavklart'-liste for Morten å avklare.",
    },
    {
      id: "sf-prosjekt-data-foreldet",
      label: "Salesforce Reforhandling/Ledig lokale-prosjekter er stort sett foreldet data",
      status: "varsel",
      notat:
        "Sjekket 2026-08-24 for leietaker-signal-arbeidet: 12 aktive Prosjekt__c-poster (7 Reforhandling, 5 Ledig lokale), men 11 av 12 har LastModifiedDate fra 2022-2023 og en estimert ferdigstillelsesdato som allerede har passert uten at status ble satt til Fullført/Kansellert - nesten sikkert forlatte poster, ikke aktivt arbeid. Kun én (en leietaker på Lilleakerveien 2E) er fra 2026. Salesforce kan derfor IKKE brukes som en automatisk, pålitelig sannsynlighets-kilde for reforhandling/utleie - kun som et startpunkt-hint, Mortens egen vurdering må være hovedkilden.",
    },
  ],
};

export interface OwnershipShareRule {
  bygg: string;
  andelProsent: number; // Mustads eierandel av inntekten fra dette bygget (resten tilhører medeier)
  notat?: string;
}

export interface OwnershipShareSnapshot {
  sistOppdatert: string;
  rules: OwnershipShareRule[];
}

// Bygg-navn, ikke leietaker-identifiserende - identisk med .local.ts, ingen anonymisering
// nødvendig. Se lib/incomeForecast.local.ts for full kommentar og status (2026-08-24: REMAINING
// har nå eierandelen korrekt bakt inn via Fazile, INVOICED/BOOKED_3600_3699 er uverifisert).
export const OWNERSHIP_SHARE_RULES: OwnershipShareSnapshot = {
  sistOppdatert: "2026-08-24",
  rules: [
    { bygg: "Strandveien 4-8", andelProsent: 50 },
    { bygg: "Strandveien 10", andelProsent: 50 },
    { bygg: "Lilleakerveien 20-22", andelProsent: 50 },
  ],
};

export function buildIncomeForecastContext(): string {
  const lines: string[] = [];

  const invoicedA = INVOICED.periods.reduce((s, p) => s + p.delA, 0);
  const invoicedB = INVOICED.periods.reduce((s, p) => s + p.delB, 0);
  lines.push(
    `INNTEKTSPROGNOSE ${INVOICED.ar} (snapshot, sist oppdatert ${INVOICED.sistOppdatert || "ukjent"} — ikke live, oppdateres manuelt ved forespørsel):`,
  );
  lines.push(`- Fakturert hittil (Visma NXT): Del A (leie) ${formatKr(invoicedA)}, Del B (parkering) ${formatKr(invoicedB)}`);

  const manualNxtA = MANUAL_NXT.vouchers.filter((v) => v.del === "A").reduce((s, v) => s + v.belop, 0);
  const manualNxtB = MANUAL_NXT.vouchers.filter((v) => v.del === "B").reduce((s, v) => s + v.belop, 0);
  lines.push(`- Manuelle bilag allerede i NXT: Del A ${formatKr(manualNxtA)}, Del B ${formatKr(manualNxtB)} (${MANUAL_NXT.vouchers.length} bilag)`);

  lines.push(
    `- Gjenstår å fakturere resten av 2026 (${REMAINING.antallLeieforhold} leieforhold): Del A ${formatKr(REMAINING.totalDelA)}, Del B ${formatKr(REMAINING.totalDelB)}`,
  );

  lines.push("\nAVSTEMMINGSKONTROLLER:");
  if (RECONCILIATION.checks.length === 0) {
    lines.push("- Ingen kontroller kjørt ennå.");
  } else {
    for (const c of RECONCILIATION.checks) {
      lines.push(`- [${c.status}] ${c.label}: ${c.notat}`);
    }
  }

  return lines.join("\n");
}
