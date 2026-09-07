import { describe, it, expect } from "vitest";
import type { BookedAccountRangeSnapshot, RemainingSnapshot } from "./incomeForecast";
import type { ManualIncomeLine } from "./incomeForecastManual";
import { computeForecastRollup } from "./incomeForecastCompute";

// ROLLUP-semantikken (se PartTotals i lib/incomeForecastCompute.ts):
//   fakturertHittil  = BOOKED_3600_3699 sin totalDelA/totalDelB (rå, helårs)
//   manueltNxtHittil = holdes på 0 (historisk felt — dobbelttalte manuelle NXT-bilag, fjernet 2026-08-30)
//   gjenstaende      = REMAINING sin totalDelA/totalDelB
//   manuelleLinjer   = sum av AKTIVE manuelle linjer på samme del
//   totalt           = fakturertHittil + manueltNxtHittil + gjenstaende + manuelleLinjer
//   rollup.totalt    = delA.totalt + delB.totalt
//
// Minimale fikstures — ingen import av reelle data, slik at testen ikke går i stykker neste gang
// snapshotene oppdateres.

function booked(totalDelA: number, totalDelB: number): BookedAccountRangeSnapshot {
  return {
    sistOppdatert: "2026-08-30",
    ar: 2026,
    kontoFra: 3600,
    kontoTil: 3699,
    totalBelop: totalDelA + totalDelB,
    totalDelA,
    totalDelB,
    perSelskap: [],
  };
}

function remaining(totalDelA: number, totalDelB: number): RemainingSnapshot {
  return {
    sistOppdatert: "2026-09-06",
    ar: 2026,
    totalDelA,
    totalDelB,
    antallLeieforhold: 0,
    antallIkkeMatchetFlagget: 0,
    antallForklartOmsetningsleie: 0,
    antallForklartKontraktsendring: 0,
    antallAvsluttetNullstilt: 0,
    antallInternMustad: 0,
    uforklarteAvvik: [],
  };
}

function manuellLinje(over: Partial<ManualIncomeLine> & Pick<ManualIncomeLine, "id" | "del" | "belop" | "aktiv">): ManualIncomeLine {
  return {
    beskrivelse: "Onepark-estimat resten av året",
    selskap: "Mustad Eiendom AS",
    bygg: "CC Vest Senter",
    konto: "3600",
    periodeFra: "2026-09-01",
    periodeTil: "2026-12-31",
    sikkerhet: "middels",
    ...over,
  };
}

describe("computeForecastRollup — delsummer", () => {
  const rollup = computeForecastRollup({
    booked: booked(494_414_072.1, 42_058_286.13),
    remaining: remaining(153_200_000, 12_450_000),
    manualLines: [
      manuellLinje({ id: "m1", del: "A", belop: 2_500_000, aktiv: true }),
      manuellLinje({ id: "m2", del: "B", belop: 1_100_000, aktiv: true }),
    ],
  });

  it("henter fakturertHittil rett fra BOOKED sine del-totaler", () => {
    expect(rollup.delA.fakturertHittil).toBe(494_414_072.1);
    expect(rollup.delB.fakturertHittil).toBe(42_058_286.13);
  });

  it("henter gjenstaende rett fra REMAINING sine del-totaler", () => {
    expect(rollup.delA.gjenstaende).toBe(153_200_000);
    expect(rollup.delB.gjenstaende).toBe(12_450_000);
  });

  it("holder manueltNxtHittil på 0 (historisk felt, ikke lenger summert inn)", () => {
    expect(rollup.delA.manueltNxtHittil).toBe(0);
    expect(rollup.delB.manueltNxtHittil).toBe(0);
  });

  it("summerer delA.totalt = fakturertHittil + gjenstaende + manuelleLinjer", () => {
    const d = rollup.delA;
    expect(d.totalt).toBeCloseTo(d.fakturertHittil + d.manueltNxtHittil + d.gjenstaende + d.manuelleLinjer, 6);
  });

  it("summerer delB.totalt = fakturertHittil + gjenstaende + manuelleLinjer", () => {
    const d = rollup.delB;
    expect(d.totalt).toBeCloseTo(d.fakturertHittil + d.manueltNxtHittil + d.gjenstaende + d.manuelleLinjer, 6);
  });

  it("setter rollup.totalt = delA.totalt + delB.totalt", () => {
    expect(rollup.totalt).toBeCloseTo(rollup.delA.totalt + rollup.delB.totalt, 6);
  });

  it("gir samme total som summen av alle inngående deler", () => {
    expect(rollup.totalt).toBeCloseTo(
      494_414_072.1 + 42_058_286.13 + 153_200_000 + 12_450_000 + 2_500_000 + 1_100_000,
      6,
    );
  });
});

describe("computeForecastRollup — manuelle linjer", () => {
  const base = { booked: booked(1_000_000, 200_000), remaining: remaining(400_000, 50_000) };

  it("legger manuelle linjer på riktig del og blander dem ikke", () => {
    const r = computeForecastRollup({
      ...base,
      manualLines: [
        manuellLinje({ id: "a1", del: "A", belop: 300_000, aktiv: true }),
        manuellLinje({ id: "a2", del: "A", belop: 100_000, aktiv: true }),
        manuellLinje({ id: "b1", del: "B", belop: 75_000, aktiv: true }),
      ],
    });
    expect(r.delA.manuelleLinjer).toBe(400_000);
    expect(r.delB.manuelleLinjer).toBe(75_000);
  });

  it("hopper over inaktive manuelle linjer", () => {
    const r = computeForecastRollup({
      ...base,
      manualLines: [
        manuellLinje({ id: "a1", del: "A", belop: 300_000, aktiv: false }),
        manuellLinje({ id: "a2", del: "A", belop: 100_000, aktiv: true }),
      ],
    });
    expect(r.delA.manuelleLinjer).toBe(100_000);
    expect(r.delA.totalt).toBe(1_000_000 + 400_000 + 100_000);
  });

  it("håndterer negative manuelle linjer (nedjustering) som fradrag", () => {
    const r = computeForecastRollup({
      ...base,
      manualLines: [manuellLinje({ id: "a1", del: "A", belop: -250_000, aktiv: true })],
    });
    expect(r.delA.manuelleLinjer).toBe(-250_000);
    expect(r.delA.totalt).toBe(1_000_000 + 400_000 - 250_000);
  });

  it("gir manuelleLinjer = 0 på begge deler når listen er tom", () => {
    const r = computeForecastRollup({ ...base, manualLines: [] });
    expect(r.delA.manuelleLinjer).toBe(0);
    expect(r.delB.manuelleLinjer).toBe(0);
    expect(r.totalt).toBe(1_000_000 + 200_000 + 400_000 + 50_000);
  });

  it("gir manuelleLinjer = 0 når alle linjene er inaktive", () => {
    const r = computeForecastRollup({
      ...base,
      manualLines: [
        manuellLinje({ id: "a1", del: "A", belop: 300_000, aktiv: false }),
        manuellLinje({ id: "b1", del: "B", belop: 75_000, aktiv: false }),
      ],
    });
    expect(r.delA.manuelleLinjer).toBe(0);
    expect(r.delB.manuelleLinjer).toBe(0);
  });
});

describe("computeForecastRollup — nullgrunnlag og isolasjon", () => {
  it("gir gjennomgående nuller når alt grunnlag er 0", () => {
    const r = computeForecastRollup({ booked: booked(0, 0), remaining: remaining(0, 0), manualLines: [] });
    expect(r.delA).toEqual({ fakturertHittil: 0, manueltNxtHittil: 0, gjenstaende: 0, manuelleLinjer: 0, totalt: 0 });
    expect(r.delB).toEqual({ fakturertHittil: 0, manueltNxtHittil: 0, gjenstaende: 0, manuelleLinjer: 0, totalt: 0 });
    expect(r.totalt).toBe(0);
  });

  it("returnerer nye PartTotals-objekter for hver kjøring (ingen delt akkumulator)", () => {
    // emptyTotals() er en fabrikk, ikke en modul-const — hadde den vært en const, ville
    // gjenstaende/manuelleLinjer akkumulert på tvers av kall (`+=`).
    const args = {
      booked: booked(100, 200),
      remaining: remaining(10, 20),
      manualLines: [manuellLinje({ id: "m", del: "A" as const, belop: 5, aktiv: true })],
    };
    const forste = computeForecastRollup(args);
    const andre = computeForecastRollup(args);
    expect(andre).toEqual(forste);
    expect(andre.delA).not.toBe(forste.delA);
    expect(andre.delA.gjenstaende).toBe(10);
  });
});
