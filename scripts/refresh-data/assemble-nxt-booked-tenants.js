const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const OUT_DIR = path.join(DIR, "nxt-booked-tenants");
const HALVE = new Set([4489957, 4489969, 4489967]);

const COMPANIES = [
  { no: 2397991, selskap: "Mustad Eiendom AS" },
  { no: 4489957, selskap: "Fåbro Eiendom AS" },
  { no: 4507424, selskap: "Lilleaker Næring AS" },
  { no: 4495995, selskap: "Lilleaker Sentrum AS" },
  { no: 5732083, selskap: "Lilleakerveien 14 AS" },
  { no: 4898918, selskap: "Lilleakerveien 32B AS" },
  { no: 4489956, selskap: "Mustadboliger AS" },
  { no: 4489969, selskap: "Strandveien 10 AS" },
  { no: 4489967, selskap: "Strandveien 4-8 AS" },
];

for (const { no, selskap } of COMPANIES) {
  const lines = JSON.parse(fs.readFileSync(path.join(DIR, "nxt-booked-tenants-raw", `${no}-lines.json`), "utf8"));
  const tenantNames = JSON.parse(fs.readFileSync(path.join(DIR, "nxt-tenant-names-raw", `${no}.json`), "utf8"));
  const existing = JSON.parse(fs.readFileSync(path.join(OUT_DIR, `${no}.json`), "utf8"));
  const buildings = existing.buildings;

  let outLines = lines.map((l) => ({ customerNo: l.customerNo, accountNo: l.accountNo, orgUnit3: l.orgUnit3, belop: l.belop }));
  if (HALVE.has(no)) {
    outLines = outLines.map((l) => ({ ...l, belop: Math.round(l.belop * 0.5 * 100) / 100 }));
  }

  const out = { selskap, buildings, tenantNames, lines: outLines };
  fs.writeFileSync(path.join(OUT_DIR, `${no}.json`), JSON.stringify(out, null, 2));
  const sum = outLines.reduce((s, l) => s + l.belop, 0);
  console.log(`${no} ${selskap}: ${outLines.length} linjer, sum=${sum.toFixed(2)}${HALVE.has(no) ? " (halvert)" : ""}`);
}
