# refresh-data/

Rå, ekte data brukt til å bygge Redis-baserte snapshots for dashbordet.
**Denne mappen er i .gitignore — aldri commit noe herfra.** Den finnes kun
lokalt (og kan variere fra maskin til maskin/økt til økt).

## nxt-booked-tenants/

Input til `scripts/refresh-nxt-booked-tenants.js`. Én fil per NXT-selskap
(`<companyNo>.json`) pluss `meta.json`. Se toppen av selve scriptet for
nøyaktig GraphQL-spørring og filformat — det er den autoritative
kilden til fremgangsmåten, ikke denne filen.

Når Morten ber om et nytt øyeblikksbilde av "Bokført per leietaker":
1. Kjør spørringene i `scripts/refresh-nxt-booked-tenants.js` sin
   header-kommentar på nytt for hvert av de 9 aktive selskapene.
2. Skriv resultatene til denne mappen i samme format.
3. Kjør `node scripts/refresh-nxt-booked-tenants.js`.
