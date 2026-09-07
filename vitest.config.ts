import path from "node:path";
import { defineConfig } from "vitest/config";

// Rene enhetstester (ingen React/DOM) — node-miljø er nok.
//
// To alias-er er nødvendige for at lib/-modulene i det hele tatt kan importeres i node:
//  - "@" speiler tsconfig.json sin `paths: { "@/*": ["./*"] }`, slik at tester kan bruke samme
//    import-form som appen.
//  - "server-only" er en ren markørpakke som KASTER når den importeres utenfor en React Server
//    Component (node_modules/server-only/index.js). lib/kv.ts importerer den, og alt som rører
//    Redis arver den — pek den til pakkens egen tomme react-server-variant i test, ellers
//    kan f.eks. lib/tenantForecastTable.ts ikke lastes i det hele tatt.
const rootDir = path.resolve(__dirname);

export default defineConfig({
  resolve: {
    alias: {
      // Absolutt filsti (ikke "server-only/empty.js") — pakkens `exports`-kart eksponerer ikke
      // empty.js som subpath, så en spesifier-basert alias avvises av Vite.
      "server-only": path.join(__dirname, "node_modules", "server-only", "empty.js"),
      "@": rootDir,
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "components/**/*.test.ts"],
  },
});
