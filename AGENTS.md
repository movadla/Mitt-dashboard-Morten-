<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Datafilene som byttes ut: skriv aldri kode i pekerfilene

Disse seks filene er maskingenererte pekere, én linje hver:

`lib/tasks.ts` · `lib/widgets.ts` · `lib/incomeForecast.ts` · `lib/tenants.ts` · `lib/companyInfo.ts` · `lib/fazilesjekk.ts`

`scripts/use-local-data.js` (predev) og `scripts/use-anon-data.js` (prebuild)
**overskriver hver av dem i sin helhet** med `export * from "./<navn>.<anon|local>";`.
Alt annet innhold forsvinner ved neste `npm run dev` eller produksjonsbygg — og
feilen viser seg ikke lokalt før noen kjører dev på nytt.

Trenger du en type eller hjelpefunksjon som hører til et av datasettene, legg den
i en søsterfil: `lib/fazilesjekkTypes.ts` og `lib/taskTypes.ts` er mønsteret.

Pekerfilene skal heller aldri committes mens de peker på `.local` — de ekte
`*.local.ts`-filene er gitignored og finnes ikke på Vercel.
