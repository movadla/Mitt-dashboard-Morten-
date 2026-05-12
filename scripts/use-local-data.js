const fs = require("fs");
const hasLocal = fs.existsSync("lib/tasks.local.ts");
const line = hasLocal
  ? 'export * from "./tasks.local";\n'
  : 'export * from "./tasks.anon";\n';
fs.writeFileSync("lib/tasks.ts", line);
