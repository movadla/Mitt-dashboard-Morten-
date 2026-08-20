// Kjøres som "prebuild" — tvinger lib/tasks.ts og lib/widgets.ts til alltid å bruke
// de anonymiserte versjonene før en faktisk produksjonsbygg, uansett hva de peker på
// på disk fra tidligere "npm run dev" lokalt. Sikkerhetsnett: selv om lib/tasks.ts
// eller lib/widgets.ts ved et uhell committes mens de peker på ".local" (ekte data),
// vil Vercel sin build likevel alltid ende opp anonymisert — de ekte *.local.ts-filene
// finnes uansett aldri der (gitignored, aldri pushet).
const fs = require("fs");

function forceAnon(baseName) {
  fs.writeFileSync(`lib/${baseName}.ts`, `export * from "./${baseName}.anon";\n`);
}

forceAnon("tasks");
forceAnon("widgets");
forceAnon("incomeForecast");
forceAnon("tenants");
forceAnon("companyInfo");
