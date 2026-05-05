// ═══════════════════════════════════════════════════════════════════════════
//   Datakilde for dashboardet
// ═══════════════════════════════════════════════════════════════════════════
//
// Som standard re-eksporteres anonymisert mock-data fra ./tasks.anon. Den
// fila er trygg å pushe til GitHub.
//
// For å bruke ekte Mustad-data lokalt:
//   1. Sørg for at lib/tasks.local.ts finnes på maskinen din (gitignored).
//   2. Endre linjen under fra "./tasks.anon" til "./tasks.local".
//   3. IKKE commit denne endringen. `git checkout lib/tasks.ts` reverter.
// ═══════════════════════════════════════════════════════════════════════════

export * from "./tasks.anon";
