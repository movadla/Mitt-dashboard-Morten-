const fs = require("fs");

function swap(baseName) {
  const hasLocal = fs.existsSync(`lib/${baseName}.local.ts`);
  const line = hasLocal
    ? `export * from "./${baseName}.local";\n`
    : `export * from "./${baseName}.anon";\n`;
  fs.writeFileSync(`lib/${baseName}.ts`, line);
}

swap("tasks");
swap("widgets");
swap("incomeForecast");
swap("tenants");
swap("companyInfo");
swap("fazilesjekk");
