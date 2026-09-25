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
// Endringshistorikk (2 daterte oppdateringer): docs/inntektsprognose-endringslogg.md
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
// Endringshistorikk (11 daterte oppdateringer): docs/inntektsprognose-endringslogg.md
export const REMAINING: RemainingSnapshot = {
  sistOppdatert: "2026-09-21",
  ar: 2026,
  // v74 (2026-09-24, full fornyelse av Fazile rent_roll for alle 55 bygg): totalDelA falt
  // 88 860,63 kr. Kun rent_roll-siden (fallback) fornyet, ikke fakturaplanen (primaerkilden) -
  // se lib/incomeForecast.local.ts for full forklaring.
  totalDelA: 8321432.09,
  totalDelB: 5576512.88,
  // v28 (2026-09-08): 724 -> 715. Var Fazile-sidens leietaker||bygg-nøkler FØR sammenslåing;
  // teller nå byggGrupper i snapshotet, samme definisjon som "N av 715 leieforhold" i Leieforhold
  // til gjennomgang. De to tallene sto tidligere på samme side med samme ord og 9 i forskjell.
  antallLeieforhold: 676,
  antallIkkeMatchetFlagget: 11,
  antallForklartOmsetningsleie: 19,
  antallForklartKontraktsendring: 86,
  antallAvsluttetNullstilt: 8,
  antallInternMustad: 2,
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

// Endringshistorikk (1 datert oppdatering): docs/inntektsprognose-endringslogg.md
export const MANUAL_NXT: ManualNxtSnapshot = {
  sistOppdatert: "2026-09-07",
  ar: 2026,
  vouchers: [
    {
      bilagsnr: "28779-4",
      dato: "2025-12-31",
      periode: "2026-01",
      konto: "3632",
      bygg: "CC Vest Senter",
      del: "A",
      belop: -12141099,
      kategori: "Omsetningsleie-avsetning (justering/reversering)",
      tekst: "Avsetning omsetningsleie 2025 iht vedlegg",
    },
    {
      bilagsnr: "28799-4+8",
      dato: "2025-12-31",
      periode: "2026-01",
      konto: "3632",
      bygg: "CC Vest Senter",
      del: "A",
      belop: 1028541,
      kategori:
        "Omsetningsleie-avsetning for 2025 korrigert (reversering av 28779-4 over pluss ny, endelig avsetning) - nettoeffekt av alle tre linjene til sammen er -11 112 558 kr, i tråd med tidligere dokumentert nettobeløp i REMAINING/RECONCILIATION",
      tekst: "Tbf avsetning omsetningsleie 2025 iht vedlegg (reversering) + Avsetning omsetningsleie 2025 iht vedlegg (ny sats)",
    },
    {
      bilagsnr: "28516-29",
      dato: "2026-01-09",
      periode: "2026-01",
      konto: "3650",
      bygg: "Vollsveien 17",
      del: "A",
      belop: -103949,
      kategori: "Basestasjon (leieinntekt fra teleoperatør)",
      tekst: "Vollsveien 17 - Basestasjon avg.pl.",
    },
    {
      bilagsnr: "28611-11",
      dato: "2026-01-16",
      periode: "2026-01",
      konto: "3630",
      bygg: "Lilleakerveien 14",
      del: "A",
      belop: -1058813,
      kategori: "Minimumsleie-avregning",
      tekst: "Lilleakerveien 14 - Minimumsleie avg.pl.",
    },
    {
      bilagsnr: "28612-13",
      dato: "2026-01-16",
      periode: "2026-01",
      konto: "3630",
      bygg: "CC Vest Senter",
      del: "A",
      belop: -4545059,
      kategori: "Minimumsleie-avregning (omsetningsleie-leietaker)",
      tekst: "CC Vest senter - Minimumsleie avg.pl.",
    },
    {
      bilagsnr: "28615-3",
      dato: "2026-01-21",
      periode: "2026-01",
      konto: "3641",
      bygg: "Lilleakerveien 14",
      del: "B",
      belop: -52577,
      kategori: "Parkering",
      tekst: "Lilleakerveien 14 - Parkering avg.fritt 20 pl",
    },
    {
      bilagsnr: "28681-40",
      dato: "2026-01-27",
      periode: "2026-01",
      konto: "3630",
      bygg: "Lilleakerveien 2E",
      del: "A",
      belop: -119636,
      kategori: "Minimumsleie-avregning",
      tekst: "Lilleakerveien 2E - Minimumsleie avg.pl.",
    },
    {
      bilagsnr: "28684-3",
      dato: "2026-01-27",
      periode: "2026-01",
      konto: "3690",
      bygg: "Lilleakerveien 2 - Felles",
      del: "A",
      belop: -50000,
      kategori:
        "Parkering (motpart er Lilleaker Parkering AS, et konsernselskap - fremstår som en internpostering, ikke undersøkt videre)",
      tekst: "Lilleakerveien 2 - Parkering avg.pl.",
    },
    {
      bilagsnr: "28683-4",
      dato: "2026-02-01",
      periode: "2026-02",
      konto: "3630",
      bygg: "Lilleakerveien 2E",
      del: "A",
      belop: -119636,
      kategori:
        "Minimumsleie-avregning (identisk beløp og leietaker som linjen 5 dager før - trolig to separate periodeoppgjør, ikke bekreftet)",
      tekst: "Lilleakerveien 2E - Minimumsleie avg.pl.",
    },
    {
      bilagsnr: "28978-51+53+55",
      dato: "2026-02-09",
      periode: "2026-02",
      konto: "3600",
      bygg: "Lilleakerveien 2C",
      del: "A",
      belop: -800532,
      kategori: "Husleie, etterfakturert/korrigert - fordelt på tre plan (5/6/7) i samme bygg, tre posteringer samme dag",
      tekst: "Lilleakerveien 2C - Husleie avg.pl. Plan 5/6/7",
    },
    {
      bilagsnr: "28898-1",
      dato: "2026-02-11",
      periode: "2026-02",
      konto: "3615",
      bygg: "Lilleakerveien 2C",
      del: "A",
      belop: 2261627,
      kategori: "Exit fee / oppsigelsesgebyr ved flytting før kontraktsslutt",
      tekst: "Exit fee ved flytting før utløp kontrakt - Quantafuel AS",
    },
    {
      bilagsnr: "29354-3",
      dato: "2026-03-26",
      periode: "2026-03",
      konto: "3650",
      bygg: "Vollsveien 13D",
      del: "A",
      belop: -68107,
      kategori: "Kreditnota-reversering, lagerleie",
      tekst: "Utgående kreditnota",
    },
    {
      bilagsnr: "29355-3",
      dato: "2026-03-26",
      periode: "2026-03",
      konto: "3630",
      bygg: "Lilleakerveien 18",
      del: "A",
      belop: -93282,
      kategori: "Kreditnota-reversering, husleie (uklar bilagstekst utover 'Utgående kreditnota')",
      tekst: "Utgående kreditnota",
    },
    {
      bilagsnr: "29356-3+29357-3",
      dato: "2026-03-26",
      periode: "2026-03",
      konto: "3630",
      bygg: "CC Vest Senter",
      del: "A",
      belop: -186564,
      kategori: "Kreditnota-reversering, husleie (to identiske posteringer samme dag, samme leietaker/bygg)",
      tekst: "Utgående kreditnota",
    },
    {
      bilagsnr: "29358-3+29359-4+29360-3",
      dato: "2026-03-26",
      periode: "2026-03",
      konto: "3630",
      bygg: "CC Vest Senter",
      del: "A",
      belop: -747453,
      kategori:
        "Kreditnota-reversering, husleie - største av flere posteringer samme dag til samme leietaker (se 29354-3/29355-3/29356-3+29357-3 for resten av oppgjøret, samlet -1 095 406 kr til denne leietakeren på tvers av tre bygg)",
      tekst: "Utgående kreditnota",
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
      bilagsnr: "29451-3",
      dato: "2026-04-08",
      periode: "2026-04",
      konto: "3621",
      bygg: "CC Vest Senter",
      del: "A",
      belop: -53805,
      kategori: "Utgående kreditnota (uklar bilagstekst, ingen ytterligere forklaring tilgjengelig)",
      tekst: "Utgående kreditnota",
    },
    {
      bilagsnr: "29485-7",
      dato: "2026-04-13",
      periode: "2026-04",
      konto: "3600",
      bygg: "Lilleakerveien 6D",
      del: "A",
      belop: -185986,
      kategori:
        "Utgående kreditnota (ser ut til å bli reversert/korrigert av bilag 29548-7 én uke senere - se den linjen, netter til 0 samlet)",
      tekst: "Utgående kreditnota",
    },
    {
      bilagsnr: "29548-7",
      dato: "2026-04-20",
      periode: "2026-04",
      konto: "3600",
      bygg: "Lilleakerveien 6D",
      del: "A",
      belop: 185986,
      kategori: "Reversering/korrigering av kreditnota i bilag 29485-7 over (samme kunde/bygg)",
      tekst: "Utgående kreditnota",
    },
    {
      bilagsnr: "29549-3",
      dato: "2026-04-20",
      periode: "2026-04",
      konto: "3600",
      bygg: "Lilleakerveien 4A",
      del: "A",
      belop: -126000,
      kategori: "Utgående kreditnota (uklar bilagstekst, ingen ytterligere forklaring tilgjengelig)",
      tekst: "Utgående kreditnota",
    },
    {
      bilagsnr: "29609-1",
      dato: "2026-04-29",
      periode: "2026-04",
      konto: "3615",
      bygg: "Lilleakerveien 8",
      del: "A",
      belop: 919312.11,
      kategori: "Sluttoppgjør/termination agreement ved kontraktsslutt",
      tekst: "Termination agreement Obrascón Huarte Lain (OHLA)",
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
      bilagsnr: "15594-5",
      dato: "2023-06-30",
      periode: "2026-12",
      konto: "3652",
      bygg: "Lilleakerveien 4C",
      del: "A",
      belop: -800000,
      kategori:
        "Periodisert leierabatt (avtale fra 2023, gjelder 2026) - bokført med historisk bilagsdato 2023-06-30 men landet i regnskapsperiode 2026-12",
      tekst: "Periodisering leierabatter PGS ny avtale 2026",
    },
    {
      bilagsnr: "30531-3",
      dato: "2026-08-31",
      periode: "2026-08",
      konto: "3601",
      bygg: "Arnstein Arnebergs vei 4",
      del: "A",
      belop: -63851,
      kategori:
        "Utgående kreditnota - megleroppgjør for Arnstein Arnebergs vei 4 (eid av Mustadboliger AS), bokført med Mustadboliger AS som kunde - fremstår som en konsernintern postering, se tilsvarende linjer i Mustadboliger AS' egne bøker under",
      tekst: "Utgående kreditnota - Utleiemegleren AA 2-4 aug-sept",
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
    {
      bilagsnr: "1227-3",
      dato: "2026-05-05",
      periode: "2026-05",
      konto: "3640",
      bygg: "Lilleakerveien 31 (Lilleaker Sentrum AS)",
      del: "B",
      belop: -50765,
      kategori: "Parkering-kreditnota (dobbeltfakturerte parkeringsplasser)",
      tekst: "Utgående kreditnota - kredit doble parkeringsplasser",
    },
    {
      bilagsnr: "1097-4",
      dato: "2026-01-01",
      periode: "2026-01",
      konto: "3600",
      bygg: "Lilleakerveien 31 (Lilleaker Sentrum AS)",
      del: "A",
      belop: -69576,
      kategori:
        "Kontorleie (nytt leieforhold - bilagsdato 1.1. er trolig systemets standarddato ved kontraktsoppstart, ikke nødvendigvis reell faktureringsdato)",
      tekst: "Lilleakerveien 31 - Kontorleie avg.pl.",
    },
    {
      bilagsnr: "59-20",
      dato: "2026-02-16",
      periode: "2026-02",
      konto: "3620",
      bygg: "Lilleakerveien 14 (Lilleakerveien 14 AS)",
      del: "A",
      belop: -157457,
      kategori: "Leie handel (avgiftsfritt)",
      tekst: "Lilleakerveien 14 - Leie handel avg.fritt",
    },
    {
      bilagsnr: "25-22",
      dato: "2026-01-27",
      periode: "2026-01",
      konto: "3621",
      bygg: "Lilleakerveien 14 (Lilleakerveien 14 AS)",
      del: "A",
      belop: -366693,
      kategori: "Leie handel (avgiftspliktig)",
      tekst: "Lilleakerveien 14 - Leie handel avg.pl.",
    },
    {
      bilagsnr: "4682-6",
      dato: "2026-06-30",
      periode: "2026-06",
      konto: "3651",
      bygg: "Arnstein Arnebergs vei 4 (Mustadboliger AS)",
      del: "A",
      belop: 157500,
      kategori:
        "Megleroppgjør 'Utleiemegleren AA 2-4' (uklart hvorfor bokført på inntektskonto 3651 - se tilsvarende posteringer i Mustad Eiendom AS' bøker for samme bygg over, bilag 30531-3)",
      tekst: "Utleiemegleren AA 2-4",
    },
    {
      bilagsnr: "4731-1",
      dato: "2026-06-30",
      periode: "2026-07",
      konto: "3651",
      bygg: "Arnstein Arnebergs vei 4 (Mustadboliger AS)",
      del: "A",
      belop: -70000,
      kategori: "Megleroppgjør 'Utleiemegleren AA 2-4' (samme uklarhet som linjen over)",
      tekst: "Utleiemegleren AA 2-4",
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
// Endringshistorikk (1 datert oppdatering): docs/inntektsprognose-endringslogg.md
export const BOOKED_3600_3699: BookedAccountRangeSnapshot = {
  sistOppdatert: "2026-09-21",
  ar: 2026,
  kontoFra: 3600,
  kontoTil: 3699,
  totalBelop: 708978924.08,
  totalDelA: 654962623.86,
  totalDelB: 54016300.22,
  perSelskap: [
    {
      selskap: "Mustad Eiendom AS",
      belop: 607029032.93,
      bygg: [
        { bygg: "CC Vest Senter", belop: 157202239.64 },
        { bygg: "Lilleakerveien 6", belop: 77062903.45 },
        { bygg: "Lilleakerveien 4E", belop: 49182142.02 },
        { bygg: "Lilleakerveien 8", belop: 45343037.17 },
        { bygg: "Lilleakerveien 2A", belop: 38560361.86 },
        { bygg: "Lilleakerveien 2B", belop: 31890455.98 },
        { bygg: "Vollsveien 13H", belop: 27981834.63 },
        { bygg: "Lilleakerveien 4C", belop: 23167425.08 },
        { bygg: "Mustads vei 1", belop: 17067298.13 },
        { bygg: "Lilleakerveien 4A", belop: 16944413.34 },
        { bygg: "Lilleakerveien 10", belop: 14405826.35 },
        { bygg: "Lilleakerveien 6D", belop: 13754103.85 },
        { bygg: "Vollsveien 19", belop: 11565870.87 },
        { bygg: "Vollsveien 17", belop: 11246559.98 },
        { bygg: "Lilleakerveien 2C", belop: 8880440.71 },
        { bygg: "Vollsveien 13C", belop: 6417450.86 },
        { bygg: "Lilleakerveien 2 - Garasje", belop: 6385468.8 },
        { bygg: "Lilleakerveien 2D", belop: 6293081.83 },
        { bygg: "Lilleakerveien 2E", belop: 6213942.12 },
        { bygg: "Lilleakerveien 6 P-hus", belop: 4671528.67 },
        { bygg: "Lilleakerveien 4CDEF Uteparkering", belop: 3038177.56 },
        { bygg: "Vollsveien 13D", belop: 2670193.77 },
        { bygg: "Vollsveien 13B", belop: 2543725.2 },
        { bygg: "Lilleakerveien 24C", belop: 2250416.61 },
        { bygg: "Lilleakerveien 2 - Felles", belop: 2237545 },
        { bygg: "Vollsveien 21", belop: 2019016.33 },
        { bygg: "Vollsveien 13E", belop: 1928523.97 },
        { bygg: "Vollsveien 17-19-21 Uteparkering", belop: 1838879.83 },
        { bygg: "Lilleakerveien 30", belop: 1713683.24 },
        { bygg: "Sponhoggveien 2", belop: 1534648.76 },
        { bygg: "Vollsveien 13-17-19  Uteparkering", belop: 1434393.58 },
        { bygg: "P-Bro mellom LV8 og LV4", belop: 1250068.82 },
        { bygg: "Lilleakerveien 4A Modus", belop: 1159782 },
        { bygg: "Lilleakerveien 16 Bilforretning", belop: 1003333.33 },
        { bygg: "Lilleakerveien 18", belop: 956837.81 },
        { bygg: "Vollsveien 13F", belop: 929598.74 },
        { bygg: "Vollsveien 17 Sør Uteparkering", belop: 577006.8 },
        { bygg: "Mustads vei 10", belop: 536082.21 },
        { bygg: "Mustads vei 12", belop: 416897.4 },
        { bygg: "Lilleakerveien 14 Uteparkering", belop: 405941.26 },
        { bygg: "(Ikke bruk) Uteområde Sør", belop: 371968 },
        { bygg: "Lilleakerveien 2G", belop: 328543 },
        { bygg: "Vollsveien 13G", belop: 285443.67 },
        { bygg: "Lilleakerveien 4D", belop: 270724.26 },
        { bygg: "Vollsveien 13D Uteparkering", belop: 268311.8 },
        { bygg: "Parkering ute Lilleakerveien", belop: 167122 },
        { bygg: "Lilleakerveien 2C, Plan 3 Co-work", belop: 159339 },
        { bygg: "Lilleakerveien 4A Uteparkering", belop: 120662.3 },
        { bygg: "Områdekostnader - Felles", belop: 110651 },
        { bygg: "Lilleakerveien 20", belop: 78232 },
        { bygg: "Lilleakerveien 10 Uteparkering", belop: 61358 },
        { bygg: "Fåbro Gårdeierforening", belop: 49216 },
        { bygg: "Carl Lundgrensvei Uteparkering", belop: 43250 },
        { bygg: "Lilleakerveien 16 Uteparkering", belop: 33074.34 },
        { bygg: "Arnstein Arnebergs vei 4", belop: 0 },
        { bygg: "Lilleakerveien 14", belop: 0 },
      ],
    },
    {
      selskap: "Strandveien 4-8 AS",
      belop: 31171832.55,
      bygg: [
        { bygg: "Strandveien 4-8", belop: 31171832.55 },
        { bygg: "Fellesanlegg", belop: 0 },
      ],
    },
    {
      selskap: "Lilleakerveien 14 AS",
      belop: 26245928.94,
      bygg: [
        { bygg: "Lilleakerveien 14", belop: 25551757.78 },
        { bygg: "Lilleakerveien 14 Uteparkering", belop: 694171.16 },
      ],
    },
    {
      selskap: "Fåbro Eiendom AS",
      belop: 23847144.72,
      bygg: [
        { bygg: "Lilleakerveien 22", belop: 13713525.19 },
        { bygg: "Lilleakerveien 20", belop: 9894822.43 },
        { bygg: "Lilleakerveien 20-22 Uteparkering", belop: 238797.1 },
      ],
    },
    {
      selskap: "Lilleaker Sentrum AS",
      belop: 13430438.07,
      bygg: [
        { bygg: "Lilleakerveien 31", belop: 12946087.81 },
        { bygg: "Lilleakerveien 29", belop: 484350.26 },
      ],
    },
    {
      selskap: "Mustadboliger AS",
      belop: 4421926.73,
      bygg: [
        { bygg: "Lilleakerveien 26", belop: 2458074.6 },
        { bygg: "Gamle Drammensvei 10", belop: 774149.95 },
        { bygg: "Lilleakerveien 19", belop: 487743.33 },
        { bygg: "Arnstein Arnebergs vei 4", belop: 487358.85 },
        { bygg: "Holmenveien 16", belop: 189600 },
        { bygg: "Mustadkroken", belop: 25000 },
      ],
    },
    {
      selskap: "Lilleaker Næring AS",
      belop: 1296412.15,
      bygg: [
        { bygg: "Lilleakerveien 2F", belop: 1296412.15 },
      ],
    },
    {
      selskap: "Strandveien 10 AS",
      belop: 778146.99,
      bygg: [
        { bygg: "Strandveien 10", belop: 778146.99 },
      ],
    },
    {
      selskap: "Lilleakerveien 32B AS",
      belop: 758061,
      bygg: [
        { bygg: "Lilleakerveien 32B", belop: 758061 },
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

// OPPDATERT 2026-09-08 (v32): hentet på nytt fra Fazile (leietakerliste, group_by=leietype,
// aktiv_dato=2026-09-08, hele porteføljen) - samme metode som 2026-08-24-uttrekket. Denne var den
// SISTE kilden som lå igjen på august mens alt annet var på 2026-09-07, og var derfor alene om å
// gjøre "Eldste datakilde"-flisen gul. Tallene er verifisert mot verktøyets eget aggregat-felt
// (identiske til øret) og uttrekket ga null warnings. Endringer verdt å merke seg: totalen NED
// 957 123,59 til 958 114 049,58 kr og 9 færre kontraktslinjer (3301 -> 3292), Husleie OPP 2,56 mill,
// Annet NED 3,59 mill (mest sannsynlig omklassifisering mellom de to - "Annet" er utledet fritekst
// og den minst presise kategorien, se kommentaren over), og Rabatt fra −789 700 til −1 269 700.
// MERK (v31, 2026-09-08): etter at Tillegg-fanen ble fjernet vises IKKE disse tallene lenger noe
// sted i UI-en - konstanten brukes nå kun av datakilde-ferskhetslisten. Den er oppdatert og klar
// hvis leietype-nedbrytingen skal tilbake i visningen.
export const LEIETYPE_BREAKDOWN: LeietypeBreakdown = {
  sistOppdatert: "2026-09-08",
  totalArsleie: 958114049.58,
  antallLinjer: 3292,
  perLeietype: {
    Husleie: 541173781.82,
    Annet: 198437529.33,
    Felleskostnader: 68567659.55,
    Garasjeleie: 41987721.98,
    Energi: 38712086.01,
    Lagerleie: 22594071.29,
    Kantinebidrag: 17068200.3,
    Markedsføringsbidrag: 13885500.44,
    Parkering: 11453338.13,
    Administrasjonsbidrag: 4113848.75,
    Enøk: 849910.4,
    Basestasjon: 336550.27,
    Datarom: 114487.38,
    Gjesteparkering: 89063.84,
    Rabatt: -1269699.91,
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
  sistOppdatert: "2026-09-07",
  checks: [
    {
      id: "totalsum-plausibel",
      label: "Total prognose 2026 er i rimelig størrelsesorden",
      status: "ok",
      notat:
        "Del A ~645,7 mill kr + Del B ~55,8 mill kr = ~701,5 mill kr totalt for 2026 (fakturert hittil + gjenstående + manuelle bilag). Del A gikk opp fra ~634,1 mill kr til ~645,7 mill kr 2026-08-25 da konto 3632 (avregning av 2025-omsetningsleien, IKKE en 2026-inntekt - se REMAINING sin kommentar) ble ekskludert fra leietakernes 'allerede fakturert' - løftet gjenstår-siden med 11 596 749,38 kr og forklarer samtidig hvorfor mange CC Vest-leietakere tidligere viste negativ gjenstår. Før det gikk Del B opp fra ~51,0 mill kr til ~55,8 mill kr 2026-08-25 da Onepark-parkeringsestimatet (4 834 585,44 kr, årsestimat fra Inntektsprognose-arket minus allerede fakturert) ble lagt til. Før det igjen gikk totalen ned fra ~686,6 mill kr etter en videre gjennomgang av de 120 flaggede leieforholdene 2026-08-24 (kjerne-navn-fallback utvidet til å bytte bindestrek/punktum med mellomrom i stedet for å fjerne dem - løste 3 til), fra ~713,7 mill kr etter en dypere gjennomgang av leieforhold-matchingen (bygg-navn-alias, kjerne-navn-fallback, Del A/B-nettingsfiks - se 'leieforhold-avvik-forklart'-sjekken), fra ~813,7 mill kr da metodikken ble lagt om til leieforhold-nivå, og fra ~844,4 mill kr før eierandel-korreksjonen. OPPDATERT 2026-09-07 etter dagens NXT-kobling-fiks (v21-v25, se REMAINING sin metodikk-kommentar) og Fazile-flerpunkts-refresh (v23-v24): Del A (bokført BOOKED_3600_3699 + gjenstår REMAINING) ~660,9 mill kr + Del B ~57,4 mill kr = ~718,3 mill kr totalt for 2026, opp fra ~701,5 mill kr sist dokumentert 2026-08-25. Økningen skyldes flere uavhengige, allerede dokumenterte oppdateringer siden da - ikke én enkelt endring - blant annet at BOOKED_3600_3699/INVOICED ble hentet på nytt med eksplisitt periode<=9-filter, at REMAINING sitt Fazile-uttrekk ble gjort flerpunkts/mer komplett (v23-v24), og at NXT-koblingsmetoden for leietakeres 'allerede fakturert' ble rettet fra en feilaktig voucherNo-join til en direkte accountingTransaction-kobling (v25) - se REMAINING sin egen kommentar for detaljene. Beløpet over er bokført+gjenstår alene (samme metodikk som tidligere for kontinuitet), IKKE inkludert de separate 'mine manuelle linjer' fra Tillegg-fanen (exit fee/konkursrisiko, se 'avvik-juli-2026-kryssjekk'-sjekken) eller MANUAL_NXT-lista (som per lib/incomeForecastCompute.ts sin computeForecastRollup IKKE lenger summeres inn i totalen - kun bokført+gjenstår teller, se manueltNxtHittil-kommentaren der).",
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
      label: "82 av 724 leieforhold er flagget til gjennomgang - 0 uforklarte",
      status: "ok",
      notat:
        "Etter Morten sin oppfølging 2026-08-24 ('finn hva de heter i NXT, snevre ned antallet') ble 297 opprinnelig flaggede leieforhold undersøkt på nytt: 5 nye bygg-navn-aliaser (bl.a. 'Lilleakerveien 2 Garasje'→'Lilleakerveien 2 - Garasje', fant 44 skjulte treff) og en kjerne-navn-fallback (stavevarianter, 15 treff totalt inkl. bindestrek-/punktumvarianter) løste 85 av 110 'ikke matchet'-tilfeller. En Del A/B-nettingsfiks fjernet 101 falske 'kontraktsendring'/'omsetningsleie'-flagg forårsaket av at Fazile og NXT klassifiserer leie vs. parkering ulikt for samme leieforhold. Resultat: 25 fortsatt uten NXT-treff (ny kontrakt eller gjenstående navn-/bygg-mismatch - se REMAINING sin kommentar for videre inndeling: privatpersoner, kjente firma på ekstra underseksjoner, ett leieforhold med et Mustad-slektsnavn som mulig familietilknytning, reelt nye leietakere, og 2 med 0 kr), 12 CC Vest-leieforhold med trolig omsetningsleie-avregning i NXT (bekreftet for én leietaker; NED TIL 3 stk 2026-08-25 etter at konto 3632/2025-avsetningen ble identifisert og ekskludert separat - se 'stort-enkeltbilag'-sjekken - de resterende 9 var altså denne samme mekanismen, ikke et eget fenomen), 49 med trolig kontraktsendring/indeksregulering i året (bekreftet for én leietaker, IKKE individuelt verifisert for alle 49), 10 allerede avsluttet i Fazile og nullstilt til 0 (hvorav én enkelt leietaker alene utgjør 6 stk og 4,6 mill kr - stort nok til at Morten bør sjekke det spesielt). I tillegg er 21 leieforhold der 'leietaker' er Mustad selv (egne lokaler) flagget separat som 'intern-mustad' - ikke reelle eksterne leieforhold. 0 uforklarte avvik gjenstår. OPPDATERT 2026-09-07 (kun opptelling, ingen ny individuell gjennomgang av sakene under - kategoriene/metodikken over står som historisk dokumentasjon av undersøkelsene fra 2026-08-24): REMAINING sitt nyeste uttrekk (v21-v25 NXT-kobling-fiks + v23-v24 Fazile-flerpunkts-refresh) teller nå 724 leieforhold totalt, hvorav 82 flagget - antallIkkeMatchetFlagget=14, antallForklartOmsetningsleie=5, antallForklartKontraktsendring=43, antallAvsluttetNullstilt=8, antallInternMustad=12. uforklarteAvvik er fortsatt tom (0 uforklarte). Tallene har endret seg vesentlig siden 2026-08-24 (særlig antallForklartOmsetningsleie og antallForklartKontraktsendring, se REMAINING sin v25-kommentar) som følge av at NXT-koblingsmetoden for 'allerede fakturert' ble rettet - IKKE fordi de underliggende sakene er undersøkt på nytt.",
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
// VERIFISERT 2026-09-08 (v32) mot ferskt Fazile-uttrekk (leietakerliste, aktiv_dato 2026-09-08,
// hele porteføljen - `eierandel`-feltet pr. kontraktslinje). Reglene under er UENDRET. Konkret
// funn, som er verdt å sjekke ved hver refresh: Fazile halverer selv Lilleakerveien 20/22 (inkl.
// uteparkering), Strandveien 10 og Strandveien Uteparkering - alle rapporterer eierandel 0,5 -
// mens STRANDVEIEN 4-8 FORTSATT rapporterer eierandel 1. Den kjente verktøy-bugen er altså ennå
// ikke fikset, og den manuelle halveringen i scripts/build-remaining-summary.js
// (STRANDVEIEN_4_8_MANUAL_HALVING) må bli stående. Fjernes den før Fazile er rettet, blir
// Strandveien 4-8 talt med 100 % mot Mustads 50 %-andel.
// Datoen er flyttet fram fordi reglene nå ER kontrollert mot kilden i dag - ikke fordi de er
// endret. Uten det ville denne konstanten alene holdt "Eldste datakilde"-flisen gul for alltid,
// siden en forretningsregel ikke får ny dato av seg selv slik et datauttrekk gjør.
export const OWNERSHIP_SHARE_RULES: OwnershipShareSnapshot = {
  sistOppdatert: "2026-09-08",
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
