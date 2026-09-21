@AGENTS.md
@ANONYMISERING.md
@DESIGN.md

# Prosjektoversikt

## Teknologistack
- Next.js 16 (App Router), React 19, TypeScript 5
- Redis (ioredis) som eneste datalager — ingen SQL-database
- Tailwind CSS v4 (`@theme inline`-tokens, se DESIGN.md) + shadcn/ui (stil `base-nova`, Base UI — ikke Radix)
- Anthropic SDK direkte (Claude Sonnet/Haiku) for AI-drevne funksjoner — ikke et agent-rammeverk
- Vitest for tester (`lib/*.test.ts`)
- Cloudflare Tunnel for mobiltilgang i dev — ikke en permanent driftsløsning
- Enkel cookie+secret-autorisering i `middleware.ts` (`AUTH_SECRET`), ikke et fullt auth-system

## Mappestruktur
- `app/` — sider og seksjonskomponenter. To hovedfaner: Jobb (`app/Jobb*.tsx`, `IncomeForecastSection.tsx`, `FazilesjekkSection.tsx`) og Privat (`app/privat/*Section.tsx`)
- `app/api/` — én mappe pr. ressurs med egen `route.ts` (GET/POST/PATCH), ikke ett samle-API
- `lib/` — all forretningslogikk og Redis-tilgang (100+ filer). Komponenter i `app/` skal ikke snakke med Redis direkte
- `scripts/` — frittstående Node-scripts som bygger Redis-snapshot fra eksterne kilder (Fazile/NXT/Salesforce), kjøres manuelt, ikke en del av selve appen
- `components/` — shadcn/ui-genererte komponenter (`npx shadcn add <navn>`)
- `docs/` — endringslogger for enkeltmoduler (f.eks. Inntektsprognose)
- De 6 pekerfilene (`lib/tasks.ts` m.fl.) — se AGENTS.md, aldri rediger direkte

## Kodekonvensjoner
- Navngiving: norske variabel-/funksjonsnavn og kommentarer gjennomgående; engelsk kun for rammeverk-konvensjoner (`route.ts`, `page.tsx`) og eksterne API-felt
- Kommentarer forklarer HVORFOR (dato + hvem sin beslutning, når relevant), aldri HVA — koden skal lese seg selv
- Filnavn: PascalCase for React-komponenter, camelCase for `lib/`-moduler
- Redis-tilgang alltid via `lib/kv.ts` sine hjelpefunksjoner (`hgetJSON`/`hsetJSON`/`hgetallJSON` osv.), aldri rå ioredis-kall i feature-kode
- Feilhåndtering: API-ruter svarer med `{ error }` + riktig statuskode i `catch`; UI-mutasjoner svelger ofte feil stille med en kort kommentar om hvorfor (typisk «prøver igjen ved neste kall») i stedet for å kaste videre
- `"use client"` kun på komponenter som faktisk trenger interaktivitet; datahenting skjer klientsidig (SWR/`useEffect`), ikke i server-komponenter, siden hele appen ligger bak cookie-auth uten SSR-cache
- Nytt UI/tekst: norsk språk, ISO-datoformat i lagrede data, norsk tall-/valutaformat i visning (se DESIGN.md for øvrige skriveregler)

## Hovedmoduler (Privat)
- **Kalender** (`app/privat/CalendarSection.tsx`, `lib/privatCalendar.ts`) — egne hendelser med dato/klokkeslett, uavhengig av jobbkalenderen
- **Dagbok** (`app/privat/DiarySection.tsx`, `lib/diary.ts`) — kveldslogg med søkbare presets for personer/steder (`lib/diaryPresets.ts`)
- **Trening/ryggrehab** (`app/privat/trening/`, `app/privat/rygg/`, `lib/rygg*.ts`) — generell treningslogg pluss et eget 12-ukers ryggrehab-program med ukentlig deload/progresjon-algoritme (`lib/ryggAlgorithm.ts`)
- **Økonomi** (`app/privat/FinanceSection.tsx`, `lib/accounting.ts`, `lib/loans.ts`, `lib/savings.ts`, `lib/salary.ts`) — inntekt/utgift-føring, lån og sparing; kontonumre lagres bevisst ikke
- **Nyheter** (`app/privat/NewsSection.tsx`, `lib/news.ts`) — flere kilder, AI-berikelse kun on-demand (aldri automatisk) for å holde kostnaden nede

## Vedlikehold av denne filen
Oppdater denne filen sammen med Morten hver gang dere legger til en ny modul eller endrer en konvensjon, slik at neste økt starter med riktig kontekst med én gang.
