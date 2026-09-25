// v25 (2026-09-07): flyttet ut av tenantForecastTable.ts - den filen importerer hgetJSON fra
// ./kv (server-only, Redis) på toppnivå, så ETHVERT verdi-import derfra (f.eks. isSystemRow,
// brukt client-side i IncomeForecastSection.tsx sin StorstAvvikBlock) dro med seg hele
// ioredis-pakken inn i nettleser-bundlen og krasjet builden ("Module not found: Can't resolve
// 'net'/'tls'"). Denne filen har INGEN server-only-avhengigheter og er trygg å importere fra
// klientkode.

// Syntetiske rad-navn fra scripts/build-tenant-budget.js (MUSTAD_INTERN_LABEL/AVSTEMMING_LABEL
// der) - IKKE ekte leietakernavn, og skal derfor ALDRI anonymiseres (ellers vises de som
// misvisende "Demokunde N" i prod). Hold i sync hvis label-tekstene endres.
export const SYSTEM_ROW_LABELS = new Set([
  "Mustad Eiendom (intern bruk, ikke leieforhold)",
  "Avstemmingsdifferanse (Excel redigert etter at 'harde tall' ble limt inn i Oppsummering-arket)",
  // v28 (2026-09-08, USPORET_OVERTAKELSE_LABEL i build-tenant-forecast-table.js): budsjett trukket
  // ut av en Ledig-rad uten mottakerrad. Var tidligere ingen rad i det hele tatt - beløpet
  // forsvant ut av grupperingen og gjorde budsjett-summen 568 280 kr for lav.
  // v2 (2026-09-22, Morten): "mottaker ukjent" var misvisende - mottakerne er kjent (manuelt
  // verifisert 2026-09-22, se navn i den gitignorede _private-untracked-overtakelser.json), men
  // bevisst IKKE koblet via `overforTil` siden de allerede har egne budsjettrader og en kobling
  // ville dobbelttalt beløpet. Se USPORET_OVERTAKELSE_LABEL.
  "Dobbeltbudsjettert (trukket ut for å unngå dobbelttelling)",
  // v3 (2026-09-22): manglet her fra starten - "Ukodet bokføring" var derfor ALDRI behandlet som
  // systemrad av isSystemRow(), og fikk aldri vist sine forklarende linjer i UI-en (se v75 i
  // app/IncomeForecastSection.tsx, TenantDrilldownRows) siden den logikken forutsetter isSystemRow.
  "Ukodet bokføring (uten kundenummer i NXT)",
]);
// "Ledig (vakante lokaler)" er siden v6 (2026-08-28) splittet i én rad pr. bygg, og siden v8
// (2026-08-29) med korte radnavn ("Ledig V13D" osv., se BYGG_KORTKODE i build-tenant-budget.js) -
// derfor en prefix-sjekk her i stedet for eksakt Set-medlemskap som de to andre systemradene.
export const LEDIG_ROW_PREFIX = "Ledig";

export function isSystemRow(navn: string): boolean {
  return SYSTEM_ROW_LABELS.has(navn) || navn.startsWith(LEDIG_ROW_PREFIX);
}

// PIPELINE-REVISJON (2026-09-25): denne listen er HAaNDDUPLISERT to andre steder fordi denne
// fila er TypeScript/ESM (importeres av Next.js), mens byggescriptene er plain Node CommonJS:
//   - scripts/build-tenant-forecast-table.js (rundt "Ledig"-sjekken i auto-kommentar-logikken)
//   - scripts/verify-income-forecast.js (SYSTEM_ROW_LABELS-konstanten der)
// Endrer du en label-tekst eller legger til en ny systemrad-type HER, må begge de andre stedene
// oppdateres manuelt - det er nøyaktig denne typen glipp som gjorde at "Ukodet bokføring" aldri
// ble behandlet som systemrad i én av kopiene (v3, 2026-09-22). Vurder å konsolidere til én
// delt kilde (f.eks. en ren .json-fil begge sider kan lese) før 2027 i stedet for å fortsette
// å holde tre kopier manuelt i sync.
