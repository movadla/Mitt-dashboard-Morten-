# Kundefordringer – oppdatering fra Business NXT

`RECEIVABLES` i `lib/widgets.local.ts` er et statisk uttrekk av åpne kundeposter fra alle
22 Mustad-selskaper. Slik oppdateres det (gjort 2026-08-14 og 2026-09-18):

1. Kall `businessnxt-init`, deretter `businessnxt-init_company` (tenant 510903, ett hvilket som
   helst selskap) og `get_table_definitions` for `openCustomerEntry`, `associate`,
   `companyInformation` og `generalLedgerAccount`.
2. Kjør spørringen under **ett selskap pr. tur** (`response_format: json`). Svaret spilles til fil
   under `.claude/projects/<prosjekt>/<sesjon>/tool-results/` fordi `ballast`-søstrene gjør det
   stort nok – det er bevisst, så ingen rader må transkriberes for hånd. Hvis `hasNextPage` er
   `true`, kjør samme spørring igjen med `after: "<endCursor>"` (maks 500 rader pr. side).
3. `node scripts/refresh-receivables/stage.js "<selskapsnavn>" <companyNo> <fil1> [fil2 ...]`
   Scriptet avviser ufullstendige svar (antall, kontrollsum, duplikater, manglende side).
4. Når alle 22 er staget: `node scripts/refresh-receivables/build.js --dry-run`, kontroller
   summene, kjør så uten `--dry-run`. `RECEIVABLES_HENTET_DATO` oppdateres automatisk.
5. `npx tsc --noEmit`, sjekk Kundefordringer-seksjonen i dev-serveren.

Spørringen (bytt `company_no` pr. selskap, listen kommer fra `businessnxt-init`):

```graphql
query Poster($cid: Int!) { useCompany(no: $cid) {
  firma: companyInformation { items { companyNo } }
  poster: openCustomerEntry(filter: {outstandingAmountDomestic: {_not_eq: 0}}, first: 500,
    orderBy: [{voucherJournalNo: ASC}, {auditNo: ASC}]) {
    totalCount pageInfo { hasNextPage endCursor }
    items { voucherJournalNo auditNo customerNo invoiceNo outstandingAmountDomestic dueDate
      debtCollectionCaseNo kunde: joinup_Associate_via_Customer { name companyNo } } }
  kontroll: openCustomerEntry(filter: {outstandingAmountDomestic: {_not_eq: 0}},
    groupBy: [{currencyNo: DEFAULT}]) { items { currencyNo aggregates { sum { outstandingAmountDomestic } count { auditNo } } } }
  ballast: associate(filter: {customerNo: {_gt: 0}}, first: 500) { items { associateNo customerNo name addressLine1 addressLine2 postCode postalArea emailAddress phone companyNo shortName } }
  ballast2: generalLedgerAccount(first: 500) { items { accountNo name accountGroup profitAndLossAccount taxCode currencyNo } }
} }
```

Merk: `customerNo` er selskaps-internt – matching på tvers av selskaper skjer på
`associate.companyNo` (leietakers org.nr). Stagede filer inneholder ekte navn og ligger
gitignored i `scripts/refresh-data/_staging-receivables/`.
