// Engangs-analyse: for de "ikke matchet i NXT"-leieforholdene, sjekk om leietakernavnet
// FINNES i NXT sin fulle kundeliste (bare ikke for akkurat det bygget), eller om navnet
// ikke finnes i det hele tatt (ekte kandidat for "ny kontrakt").
const fs = require("fs");
const path = require("path");

const FAZILE_DIR = path.join(__dirname, "fazile-remaining-tenants");
const STRANDVEIEN_4_8_MANUAL_HALVING = "Strandveien 4-8_E";
const CC_VEST_NXT_BYGG = "CC Vest Senter";
const BUILDING_ALIASES = {
  "arnstein arnebergsvei 4": "Arnstein Arnebergs vei 4",
  "mustadsvei 1": "Mustads vei 1",
  "lilleakerveien 16": CC_VEST_NXT_BYGG,
  "lilleakerveien 16 skoda": "Lilleakerveien 16 Bilforretning",
  "lilleakerveien 20 audi": "Lilleakerveien 20",
  "lilleakerveien 22 vw": "Lilleakerveien 22",
};

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
function isDelB(seksjon) {
  const s = seksjon.toLowerCase();
  return s.includes("garasje") || s.includes("parkering") || s.includes("p-hus") || s.includes("p-bro");
}
function resolveNxtBuilding(fazileSeksjon, nxtBuildingSet) {
  const norm = normalizeName(fazileSeksjon);
  if (BUILDING_ALIASES[norm]) return BUILDING_ALIASES[norm];
  for (const b of nxtBuildingSet) if (normalizeName(b) === norm) return b;
  const withoutSuffix = norm.replace(/\s*(uteparkering|garasje|p-hus)$/i, "").trim();
  if (withoutSuffix !== norm) {
    for (const b of nxtBuildingSet) {
      const bn = normalizeName(b);
      if (bn === withoutSuffix + " uteparkering" || bn === withoutSuffix) return b;
    }
  }
  return null;
}
function daysBetweenInclusive(start, end) {
  return Math.round((end - start) / 86400000) + 1;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

// Fjern selskapsform-suffiks og vanlige varianter for et løsere navnematch.
function coreName(name) {
  return normalizeName(name)
    .replace(/\bavd\.?.*/i, "")
    .replace(/[.,]/g, "")
    .replace(/\b(as|asa|da|ans|ba|nuf|enk|sa|ks|a\/s)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const m = a.length,
    n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[m][n];
}

function main() {
  const yearStart = new Date("2026-01-01");
  const yearEnd = new Date("2026-12-31");
  const daysInYear = daysBetweenInclusive(yearStart, yearEnd);

  const nxtData = JSON.parse(fs.readFileSync(path.join(__dirname, "booked-tenants-snapshot.json"), "utf8"));
  const nxtBuildingSet = new Set();
  for (const t of nxtData.tenants) for (const l of t.lines) nxtBuildingSet.add(l.bygg);
  const nxtGroups = new Map();
  const nxtTenantNames = []; // { navn, norm, core }
  for (const t of nxtData.tenants) {
    nxtTenantNames.push({ navn: t.navn, norm: normalizeName(t.navn), core: coreName(t.navn) });
    for (const l of t.lines) {
      const key = normalizeName(t.navn) + "||" + normalizeName(l.bygg);
      if (!nxtGroups.has(key)) nxtGroups.set(key, { alleredeA: 0, alleredeB: 0 });
      const g = nxtGroups.get(key);
      if ([3640, 3641, 3642].includes(l.accountNo)) g.alleredeB += l.belop;
      else g.alleredeA += l.belop;
    }
  }
  const nxtTenantsByBygg = new Map(); // normalizedBygg -> Set(normalizedTenantName)
  for (const t of nxtData.tenants) {
    for (const l of t.lines) {
      const bk = normalizeName(l.bygg);
      if (!nxtTenantsByBygg.has(bk)) nxtTenantsByBygg.set(bk, new Set());
      nxtTenantsByBygg.get(bk).add(normalizeName(t.navn));
    }
  }

  const files = fs
    .readdirSync(FAZILE_DIR)
    .filter((f) => f.endsWith(".json") && f !== "meta.json" && f !== "properties.json");
  const leieforhold = new Map();

  for (const file of files) {
    const rows = JSON.parse(fs.readFileSync(path.join(FAZILE_DIR, file), "utf8"));
    for (const row of rows) {
      const lineStart = row.start_dato ? new Date(row.start_dato) : yearStart;
      const lineEnd = row.slutt_dato ? new Date(row.slutt_dato) : yearEnd;
      const effectiveStart = lineStart > yearStart ? lineStart : yearStart;
      const effectiveEnd = lineEnd < yearEnd ? lineEnd : yearEnd;
      const days = daysBetweenInclusive(effectiveStart, effectiveEnd);
      if (days <= 0) continue;
      let belop = (row.arsleie_nok * days) / daysInYear;
      if (row.eiendom === STRANDVEIEN_4_8_MANUAL_HALVING) belop *= 0.5;
      belop = round2(belop);
      const del = isDelB(row.seksjon) ? "B" : "A";
      const resolvedBygg = resolveNxtBuilding(row.seksjon, nxtBuildingSet);
      const buildingForMatch = resolvedBygg || row.seksjon;
      const key = normalizeName(row.leietaker) + "||" + normalizeName(buildingForMatch);
      if (!leieforhold.has(key)) {
        leieforhold.set(key, { leietaker: row.leietaker.trim(), bygg: row.seksjon, resolvedBygg, fullA: 0, fullB: 0 });
      }
      const g = leieforhold.get(key);
      if (del === "A") g.fullA += belop;
      else g.fullB += belop;
    }
  }

  let noNameAnywhere = 0;
  let nameExistsDifferentBygg = 0;
  let closeNameCandidate = 0;
  const noNameList = [];
  const differentByggList = [];
  const closeNameList = [];

  for (const [, g] of leieforhold) {
    const matchKey = normalizeName(g.leietaker) + "||" + normalizeName(g.resolvedBygg || g.bygg);
    const nxt = nxtGroups.get(matchKey);
    const full = round2(g.fullA + g.fullB);
    if (nxt || full <= 0) continue; // already matched or zero-value, not part of the 110

    const normLeietaker = normalizeName(g.leietaker);
    const coreLeietaker = coreName(g.leietaker);
    const existsExactNameAnyBygg = nxtTenantNames.some((t) => t.norm === normLeietaker);
    if (existsExactNameAnyBygg) {
      nameExistsDifferentBygg++;
      differentByggList.push({ leietaker: g.leietaker, bygg: g.bygg, resolvedBygg: g.resolvedBygg, full });
      continue;
    }
    // fuzzy: samme "kjerne-navn" (uten selskapsform) eller liten Levenshtein-avstand
    let bestMatch = null;
    let bestDist = Infinity;
    for (const t of nxtTenantNames) {
      if (t.core === coreLeietaker && coreLeietaker.length > 2) {
        bestMatch = t.navn;
        bestDist = 0;
        break;
      }
      const d = levenshtein(normLeietaker, t.norm);
      if (d < bestDist) {
        bestDist = d;
        bestMatch = t.navn;
      }
    }
    if (bestMatch && (bestDist <= 2 || (bestDist / Math.max(normLeietaker.length, 1)) < 0.15)) {
      closeNameCandidate++;
      closeNameList.push({ leietaker: g.leietaker, bygg: g.bygg, full, bestMatch, bestDist });
    } else {
      noNameAnywhere++;
      noNameList.push({ leietaker: g.leietaker, bygg: g.bygg, full });
    }
  }

  console.log(`Totalt "ikke funnet i NXT" med full>0: ${noNameAnywhere + nameExistsDifferentBygg + closeNameCandidate}`);
  console.log(`  1) Navnet finnes EKSAKT i NXT, men ikke for dette bygget (bygg-mismatch-kandidat): ${nameExistsDifferentBygg}`);
  console.log(`  2) Navnet finnes IKKE eksakt, men en nær match funnet (stavevariant-kandidat): ${closeNameCandidate}`);
  console.log(`  3) Navnet finnes ikke i det hele tatt i NXT sin kundeliste i år (ekte "ny kontrakt"-kandidat): ${noNameAnywhere}`);

  fs.writeFileSync(
    path.join(__dirname, "unmatched-investigation.json"),
    JSON.stringify({ differentByggList, closeNameList, noNameList }, null, 2),
  );
}

main();
