import { describe, it, expect } from "vitest";
import { isSystemRow } from "./tenantForecastTable";

// isSystemRow() avgjør hvilke rader som er SYNTETISKE (bygget av
// scripts/build-tenant-budget.js) og derfor aldri skal anonymiseres eller telles som ekte
// leietakere i avviksanalysen. Feiler den, vises systemrader som "Demokunde N" i prod, eller en
// ekte leietaker faller ut av "Størst avvik"-listen — begge er stille feil ingen oppdager.
//
// Kriteriene i lib/tenantForecastTable.ts:
//  - eksakt medlemskap i SYSTEM_ROW_LABELS (to strenger), ELLER
//  - navnet starter med "Ledig" (Ledig-radene har korte bygg-koder etter v8).

const MUSTAD_INTERN_LABEL = "Mustad Eiendom (intern bruk, ikke leieforhold)";
const AVSTEMMING_LABEL =
  "Avstemmingsdifferanse (Excel redigert etter at 'harde tall' ble limt inn i Oppsummering-arket)";

describe("isSystemRow — eksakte systemradnavn", () => {
  it("kjenner igjen intern-raden på eksakt label", () => {
    expect(isSystemRow(MUSTAD_INTERN_LABEL)).toBe(true);
  });

  it("kjenner igjen avstemmingsdifferanse-raden på eksakt label", () => {
    expect(isSystemRow(AVSTEMMING_LABEL)).toBe(true);
  });

  it("krever eksakt treff — 'Mustad Eiendom' alene er ikke en systemrad", () => {
    // Mustad Eiendom AS kan opptre som ekte leietaker i egne bygg (egenleie), så en
    // delstreng-sjekk her ville feilklassifisert et reelt leieforhold.
    expect(isSystemRow("Mustad Eiendom")).toBe(false);
    expect(isSystemRow("Mustad Eiendom AS")).toBe(false);
  });

  it("godtar ikke systemlabel med avvikende mellomrom eller store/små bokstaver", () => {
    expect(isSystemRow(` ${MUSTAD_INTERN_LABEL}`)).toBe(false);
    expect(isSystemRow(MUSTAD_INTERN_LABEL.toUpperCase())).toBe(false);
  });
});

describe("isSystemRow — Ledig-prefikset", () => {
  it("kjenner igjen den opprinnelige samleraden 'Ledig (vakante lokaler)'", () => {
    expect(isSystemRow("Ledig (vakante lokaler)")).toBe(true);
  });

  it("kjenner igjen kortkode-radene fra v8, f.eks. 'Ledig V13D'", () => {
    for (const navn of ["Ledig V13D", "Ledig Lv6", "Ledig CC Vest Senter", "Ledig"]) {
      expect(isSystemRow(navn), navn).toBe(true);
    }
  });

  it("er kun et prefiks-krav — 'Ledig' midt i navnet teller ikke", () => {
    expect(isSystemRow("Vakant/Ledig V13D")).toBe(false);
  });

  it("er case-sensitivt på prefikset", () => {
    expect(isSystemRow("ledig V13D")).toBe(false);
  });

  it("DOKUMENTERER latent felle: prefikset krever ikke ordgrense", () => {
    // startsWith("Ledig") uten ordgrense betyr at en ekte leietaker som tilfeldigvis heter noe
    // som starter på "Ledig" ville blitt klassifisert som syntetisk systemrad — og dermed både
    // sluppet unna anonymisering i prod OG falt ut av "Størst avvik"-listen. Ingen slik
    // leietaker finnes i dag, så dette er gjeldende oppførsel, ikke et bekreftet avvik; testen
    // står her slik at en fremtidig innskjerping (f.eks. /^Ledig(\s|$)/) er et bevisst valg.
    expect(isSystemRow("Lediggang Kaffebar AS")).toBe(true);
  });
});

describe("isSystemRow — ekte leietakernavn", () => {
  it("klassifiserer et vanlig leietakernavn som IKKE systemrad", () => {
    for (const navn of [
      "Demokunde 30",
      "Rema 1000 Lilleaker AS",
      "Vinmonopolet AS",
      "Fåbro Hage AS",
      "Lilleaker Service AS",
    ]) {
      expect(isSystemRow(navn), navn).toBe(false);
    }
  });

  it("klassifiserer tom streng som IKKE systemrad", () => {
    expect(isSystemRow("")).toBe(false);
  });
});
