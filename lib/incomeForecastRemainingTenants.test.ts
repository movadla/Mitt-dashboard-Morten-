import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type { RemainingByggStatus } from "./incomeForecastRemainingTenants";

// EKSAUSTIVITETSVAKT for RemainingByggStatus.
//
// MÅ HOLDES I SYNC MED UNIONEN i lib/incomeForecastRemainingTenants.ts. Det er hele poenget med
// testen: en TS-union har ingen runtime-representasjon, så listen under er den eneste kjørbare
// fasiten over gyldige statuser. Legger noen til et medlem i unionen uten å oppdatere
// status-kartene, skal dette feile høyt — enten i tsc (typesjekken nederst i blokken) eller i
// selve testen (kartene under).
const ALLE_STATUSER = [
  "ok",
  "avsluttet",
  "ikke-matchet-i-nxt",
  "forklart-omsetningsleie",
  "forklart-kontraktsendring",
  "forklart-engangsgebyr",
  "forklart-nxt-feilkoding",
  "forklart-historisk-kundenummer",
  "forklart-manglende-linje",
  "intern-mustad",
  "intern-egenleie",
  "forklart-parkering-onepark",
  "forklart-parkering-uten-fazile-linje",
  "fazile-plan-mangler",
  "usikker-oppstart",
] as const satisfies readonly RemainingByggStatus[];

// `satisfies` over fanger retningen "listen inneholder bare gyldige statuser".
// Denne fanger den andre retningen: "listen dekker HELE unionen" — blir en kompileringsfeil
// (npx tsc --noEmit) hvis unionen får et nytt medlem som ikke er lagt inn i listen.
type Assert<T extends true> = T;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- selve typeevalueringen ER testen
type _ListenDekkerHeleUnionen = Assert<
  [RemainingByggStatus] extends [(typeof ALLE_STATUSER)[number]] ? true : false
>;

// STATUS_LABEL/STATUS_FILL er modul-lokale const-er i route-handleren (ikke eksportert, og
// route-filen kan ikke importeres i node uten å dra inn hele Next-request-konteksten), så
// nøklene leses ut av kildekoden. Bevisst valg: alternativet var å endre en fil denne
// testrunden ikke eier.
const ROUTE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "app",
  "api",
  "income-forecast",
  "remaining-tenants",
  "export",
  "route.ts",
);

function lesKartNokler(kartNavn: string): string[] {
  const kilde = readFileSync(ROUTE_PATH, "utf8");
  const start = kilde.indexOf(`const ${kartNavn}`);
  if (start === -1) throw new Error(`Fant ikke "const ${kartNavn}" i ${ROUTE_PATH}`);
  const apen = kilde.indexOf("{", start);
  const slutt = kilde.indexOf("\n};", apen);
  if (apen === -1 || slutt === -1) throw new Error(`Klarte ikke å avgrense objektliteralen til ${kartNavn}`);
  const body = kilde.slice(apen + 1, slutt);
  return [...body.matchAll(/^\s*(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/gm)].map((m) => m[1] ?? m[2]);
}

describe("STATUS_LABEL i remaining-tenants/export-ruten", () => {
  const nokler = lesKartNokler("STATUS_LABEL");

  it("har en oppføring for hver RemainingByggStatus", () => {
    const manglende = ALLE_STATUSER.filter((s) => !nokler.includes(s));
    expect(manglende, `mangler i STATUS_LABEL: ${manglende.join(", ")}`).toEqual([]);
  });

  it("har ingen oppføringer som ikke finnes i unionen", () => {
    const ukjente = nokler.filter((k) => !(ALLE_STATUSER as readonly string[]).includes(k));
    expect(ukjente, `ukjente nøkler i STATUS_LABEL: ${ukjente.join(", ")}`).toEqual([]);
  });

  it("har nøyaktig like mange oppføringer som unionen har medlemmer", () => {
    expect(nokler).toHaveLength(ALLE_STATUSER.length);
    expect(new Set(nokler).size).toBe(nokler.length);
  });
});

describe("STATUS_FILL i remaining-tenants/export-ruten", () => {
  const nokler = lesKartNokler("STATUS_FILL");
  // Record<Exclude<RemainingByggStatus, "ok">, string> — "ok"-rader får ingen bakgrunnsfarge.
  const forventet = ALLE_STATUSER.filter((s) => s !== "ok");

  it("har en fargeoppføring for hver status unntatt 'ok'", () => {
    const manglende = forventet.filter((s) => !nokler.includes(s));
    expect(manglende, `mangler i STATUS_FILL: ${manglende.join(", ")}`).toEqual([]);
  });

  it("har ikke en oppføring for 'ok'", () => {
    expect(nokler).not.toContain("ok");
  });

  it("har ingen oppføringer som ikke finnes i unionen", () => {
    const ukjente = nokler.filter((k) => !(ALLE_STATUSER as readonly string[]).includes(k));
    expect(ukjente, `ukjente nøkler i STATUS_FILL: ${ukjente.join(", ")}`).toEqual([]);
  });

  it("har nøyaktig like mange oppføringer som unionen minus 'ok'", () => {
    expect(nokler).toHaveLength(forventet.length);
    expect(new Set(nokler).size).toBe(nokler.length);
  });

  it("bruker gyldige ARGB-farger (8 hex-siffer) i alle oppføringer", () => {
    const kilde = readFileSync(ROUTE_PATH, "utf8");
    const start = kilde.indexOf("const STATUS_FILL");
    const body = kilde.slice(kilde.indexOf("{", start), kilde.indexOf("\n};", start));
    const verdier = [...body.matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(verdier).toHaveLength(forventet.length);
    for (const v of verdier) expect(v, v).toMatch(/^[0-9A-F]{8}$/);
  });
});
