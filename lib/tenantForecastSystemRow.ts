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
]);
// "Ledig (vakante lokaler)" er siden v6 (2026-08-28) splittet i én rad pr. bygg, og siden v8
// (2026-08-29) med korte radnavn ("Ledig V13D" osv., se BYGG_KORTKODE i build-tenant-budget.js) -
// derfor en prefix-sjekk her i stedet for eksakt Set-medlemskap som de to andre systemradene.
export const LEDIG_ROW_PREFIX = "Ledig";

export function isSystemRow(navn: string): boolean {
  return SYSTEM_ROW_LABELS.has(navn) || navn.startsWith(LEDIG_ROW_PREFIX);
}
