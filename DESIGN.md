# Designsystem — sjekkliste/referanse

Etablerte konvensjoner for dette prosjektet, samlet ett sted slik at nye
seksjoner starter fra samme grunnlag i stedet for at stilen forhandles
frem på nytt hver gang.

## Design-tokens (`app/globals.css`)

Mørkt glassdesign, ingen lys/mørk-toggle — appen har bevisst bare én modus.

- **Overflater**: `surface-0` (bakgrunn) → `surface-1` → `surface-2` →
  `surface-3` (lysere for hvert nivå/lag oppå hverandre).
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
