# Designsystem — sjekkliste/referanse

Etablerte konvensjoner for dette prosjektet, samlet ett sted slik at nye
seksjoner starter fra samme grunnlag i stedet for at stilen forhandles
frem på nytt hver gang.

## To temaer: kveldsmodus og dagmodus

Appen har **to** temaer, byttet med sol/måne-knappen øverst til venstre
(`app/ThemeToggle.tsx`). Valget lagres i localStorage og settes på `<html>`
som `data-theme` av et **synkront** script i `app/layout.tsx` — det MÅ kjøre
før første maling, ellers blinker feil tema ved hver oppstart.

- **kveld** (standard): appens opprinnelige mørke glassdesign. Uendret.
- **dag**: lys "skifer" — tonet bakgrunn med dybde, hvite kort UTEN ramme
  der skyggen alene gjør separasjonen.

### Hvordan tema-bytting faktisk virker (viktig felle)

`@theme inline` i Tailwind v4 legger **literalverdien** rett inn i hver
utility-klasse: `--color-surface-1: #202838` gjorde at `bg-surface-1`
kompilerte til `background-color:#202838`, og da hjelper det ikke å endre
variabelen senere. Derfor peker hvert farge-token på en `--t-*`-variabel:

```css
@theme inline { --color-surface-1: var(--t-surface-1); }
:root            { --t-surface-1: #202838; }   /* kveld */
html[data-theme="dag"] { --t-surface-1: #ffffff; }
```

Selektoren er `html[data-theme="dag"]` (0,1,1) og ikke `[data-theme="dag"]`
(0,1,0) — sistnevnte har nøyaktig samme spesifisitet som `:root`, og da
hadde kildeordenen avgjort tilfeldig.

**Nye farger må legges inn begge steder.** Det gjelder også rå
Tailwind-skalaer (`text-emerald-400` o.l.): de brukes over 200 steder i
appen og er derfor omdirigert til `--t-*` samlet i `@theme inline`, i
stedet for å bli døpt om enkeltvis. Bruker du et trinn som ikke står i
lista, blir det lyst på hvitt i dagmodus.

Aldri `text-white` på en kortflate — kortene er hvite i dagmodus. Bruk
`text-ink-1`.

## Design-tokens (`app/globals.css`)

- **Overflater**: `surface-0` (bakgrunn) → `surface-1` → `surface-2` →
  `surface-3` (lysere for hvert nivå/lag oppå hverandre).
- **Dybde**: `--elev-1` (navigasjonsfliser) → `--elev-2` (kort) →
  `--elev-3` (hero). Tre nivåer, ikke ett — det er høydeforskjellen som
  gjør at rommet føles ekte. På mørk bunn leser skygge dårlig, så der gjør
  `--elev-edge` (hårtynn lyskant) jobben i stedet.
- **Tekst**: `ink-1` (mest kontrast) → `ink-2` → `ink-3` → `ink-4` (svakest,
  f.eks. tidsstempler/metadata).
- **Linjer**: `line`, `line-strong` (border/divider).
- **Semantisk palett** (aldri gjenbrukt til noe annet enn sin egen
  betydning — validert med dataviz-skillens `validate_palette.js`):
  `accent` (Jobb, blå), `accent-privat` (Privat, varm gul/oransje — egen
  fargekode-ledetråd for hvilken fane man er i), `status-danger`,
  `status-warning`, `status-positive`, `status-action`, og
  `source-asana`/`source-outlook`/`source-teams` (kilde-identitet, aldri
  brukt som statusfarge eller omvendt).
- **Ingen emoji noe sted** — ikoner (lucide-react) eller tekst i stedet.
  Profesjonelt, "futuristisk" mørkt design er et bevisst valg.

## Komponentmønstre

- **`CardHeader`** (`app/CardShell.tsx`) — fast mønster for alle
  kort/seksjoner: `icon` (lucide-ikon) + `iconColorClass` (`text-X`), som
  automatisk avledes til en rund fargechip-bakgrunn (`bg-X/10`) bak
  ikonet. Bruk dette for ALLE nye seksjoner i stedet for å style et
  ikon fritt — det er slik navigasjonen (`SidebarNav`) og kortene får
  samme visuelle identitet.
- **`CARD_SHELL`** — delt klassestreng for kortrammen
  (`rounded-2xl border border-line bg-surface-1 ...` + `.card-shell`
  box-shadow-teknikk i globals.css for det lagvise "glass"-dybdepreget).
  Ligger på **panelet** i `PrivatPanel.tsx`/`JobbView.tsx`, ikke inni hver
  seksjon: seksjonene returnerer bare kortINNHOLD (en
  `border-t-2 border-t-X/60 p-4`-rot, altså en aksentfarget topplinje ment
  for en kortkant). `overflow-hidden` på panelet kreves for at topplinjen
  skal følge de avrundede hjørnene.
- **Datastriper** (`app/privat/DataStrips.tsx`) — `RatioBar`, `DayAxis`,
  `WeekStrip`, `GroupLabel`. Hvert kort skal kode noe visuelt i tillegg til
  lista; det er dette som skiller et dashboard fra en liste. Felles mønster:
  wrapperen får seksjonens `iconColorClass`, og alt inni tegnes med
  `currentColor` — da kan de ikke gli ut av sync med kortets identitet.
- **`StaleSourceBanner`** (`app/StaleSourceBanner.tsx`) — varsel OVER kortet
  når dataene er eldre enn kilden pleier å være. Styres av ett kart
  (`SECTION_DATA_SOURCE` i `JobbView.tsx`) fra seksjon til kilde-id i
  `/api/data-sources`. Viser ingenting når `lastModified` er null, som den
  alltid er i produksjonsbygg (`.local.ts` følger ikke med dit) — et falskt
  friskmeldings- eller varselsignal er verre enn ingen.
- **`CommandPalette`** (`app/CommandPalette.tsx`, Ctrl/Cmd+K) — søk på tvers
  av BEGGE faner. Lazy-lastet, fordi den importerer hele widget- og
  leietakerdatasettet og ikke skal ligge i oppstartsbunten. Navigasjon
  mellom fanene går via `lib/appNavigation.ts`: fanen byttes av
  `dashboard.tsx`, mens seksjonen plukkes opp av panelet selv — panelet man
  hopper TIL kan være avmontert i det øyeblikket eventet sendes.
- **`CardHeader` sin `stat`-prop** — kortets nøkkeltall, stort og tynt
  (vekt 300, stram sperring) mot en bitteliten sperret etikett. Hierarkiet
  ligger i den kontrasten. Erstatter `subtitle`-plassen når begge er satt.
- **`SidebarNav`** (`app/SidebarNav.tsx`) — delt fane-/sidebar-navigasjon
  (desktop-rail + mobil-grid), gjenbrukt av både Privat og Jobb.
- **`SwipeableRow`, `ConfirmDialog`, `SkeletonRows`** — egne, håndbygde
  komponenter i `app/CardShell.tsx` for sveip-handlinger, bekreftelse
  og lastetilstand. Fortsett å bruke disse for eksisterende mønstre —
  ikke bygg om til shadcn/ui-ekvivalenter uten grunn, de virker og er
  allerede konsistente.

## shadcn/ui — for NYE komponenter, ikke omskriving av eksisterende

Satt opp 2026-08-21. Brukes for nye interaksjonsmønstre appen ikke har
fra før (kommando-paletter, avanserte dropdown-menyer, osv.) — erstatter
IKKE `ConfirmDialog`/`CardShell`/`SwipeableRow`, som fortsatt er riktig
valg for sine mønstre.

- **Legg til en ny komponent**: `npx shadcn add <navn>` (f.eks.
  `npx shadcn add popover`) — filen legges i `components/ui/`.
- **Stil**: `base-nova`, bygget på **Base UI** (ikke Radix, ikke den
  klassiske shadcn-varianten de fleste tutorials/AI-treningsdata viser).
  Viktig konsekvens: komposisjon skjer med **`render={<Button/>}`**, ikke
  Radix sitt `asChild` — `asChild` gjør ingenting her og gir en
  hydration-feil (nested `<button>`). Sjekk alltid den genererte
  komponentfilen for riktig mønster før bruk.
- **Farger**: shadcn sine tokens (`--background`, `--primary`, `--card`,
  `--destructive`, `--border`, `--ring`, osv.) er mappet i `globals.css`
  til de eksisterende `--color-*`-tokenene over — IKKE shadcn sin egen
  standardpalett. Nye shadcn-komponenter matcher derfor appens stil
  automatisk, uten egen omskriving.
- **`TooltipProvider`** ligger allerede i `app/layout.tsx` (rundt hele
  appen) — bruk `Tooltip`/`TooltipTrigger`/`TooltipContent` direkte uten
  ekstra oppsett. Faktisk brukt i produksjon på hopp-til-seksjon-knappene
  i `TodaySummary.tsx` sin `CategoryRow` — se den for eksempel på
  `render`-mønsteret i praksis.
- **Ikonbibliotek**: `lucide-react`, samme som resten av appen allerede
  bruker — ingen duplikat.

## Skriveregler (gjelder tekst i UI, ikke bare kode)

- Norsk som default, ISO-datoformat i lagrede data (visning kan formateres
  om, f.eks. `formatDMY`), norsk tall-/valutaformat i UI.
- Ingen emoji.
