import "server-only";
import { del } from "./kv";

// Egen fil (i stedet for å ligge i lib/sports.ts) for å unngå en sirkulær
// import: lib/customSports.ts trenger å ugyldiggjøre cachen etter endringer,
// men lib/sports.ts trenger å importere lib/customSports.ts for å slå
// egendefinerte kamper sammen med de eksterne kildene.
export const SPORTS_CACHE_KEY = "cache:sports";

export async function invalidateSportsCache(): Promise<void> {
  await del(SPORTS_CACHE_KEY);
}
