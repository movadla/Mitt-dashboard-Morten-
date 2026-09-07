import type { Source } from "./tasks";

// Filtertypene Oppgaver-visningen bruker. De beskriver oppgavedata (kilde,
// Salesforce-kategori) og hører derfor hjemme i lib og ikke i en komponent —
// før 2026-09-07 lå SfBucket i app/JobbView.tsx, som importerte den tilbake
// fra app/JobbOppgaverSection.tsx: en sirkel der det lavere laget var
// avhengig av orkestratoren over seg.
//
// Egen fil, ikke lib/tasks.ts: den er en ren peker som scripts/use-anon-data.js
// og use-local-data.js SKRIVER OVER i sin helhet (én linje) ved hver npm run dev
// og hver produksjonsbygg — alt annet innhold der forsvinner. Samme mønster som
// lib/fazilesjekkTypes.ts.
export type TaskFilter = Source | "all";
export type SfBucket = "alle" | "faktura" | "kreditnota" | "garanti" | "annet";
