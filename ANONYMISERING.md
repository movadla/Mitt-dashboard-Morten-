# Anonymisering — sjekkliste før commit

Les denne FØR du committer noe som rører filer med ekte data, eller kode
som viser/logger persondata. Oppstått fordi et ekte navn en gang lekket
inn i en kode-kommentar under en full ombygging av Kundefordringer.

## Hva skal ALDRI inn i committet kode
- Ekte leietaker-/kundenavn (fra Salesforce/NXT/Fazile) — heller ikke i
  kommentarer, eksempel-data eller feilmeldinger. Sjekk kommentarer
  spesielt, ikke bare strenger og variabelnavn.
- Kontonumre.
- Kollega-navn i interne møter/kalender er UNNTATT — det er en bevisst
  forskjell, ikke en glipp. Kun leietaker/kunde-data anonymiseres, ikke
  interne Mustad-ansatte.

## De 5 pointer-filene — aldri `git add` når de peker på `.local`
- lib/tasks.ts
- lib/tenants.ts
- lib/widgets.ts
- lib/incomeForecast.ts
- lib/companyInfo.ts

Hver av disse er en re-export-shim (`export * from "./X.local"` eller
`"./X.anon"`) som `scripts/use-local-data.js` (predev) og
`scripts/use-anon-data.js` (prebuild) bytter automatisk. Sjekk
`git status` på disse 5 spesifikt før hver commit — `git add -A`/`.`
er spesielt risikabelt her.

## Lekkasjesjekk — riktig omfang (unngå falske positiver)
- Søk etter EKTE leietaker-/kundenavn — ikke Mustads egne 22
  datterselskap-navn (de er ikke sensitive og gir bare støy).
- Søk i `.next/server` og `.next/static` (faktisk bygget output), ikke
  `.next/dev` (lokal cache, alltid full av ekte data uansett — ikke
  relevant for hva som faktisk blir committet/deployet).

## Etter en full rebuild av en datamodul (Kundefordringer, Kontrakter, ...)
Grep gjennom de nye/endrede filene mot en liste over ekte navn du har
sett i rådata denne økten — ikke bare de par mest "typiske"
placeholder-navnene fra tidligere anonymiseringer.
