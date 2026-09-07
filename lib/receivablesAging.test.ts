import { describe, it, expect } from "vitest";
import type { Receivable, ReceivableInvoice } from "./widgets";
import { computeAging, computeAutoRisk } from "./receivablesAging";

// Semantikken som testes her står i kommentarene i lib/receivablesAging.ts:
//  - bøttene inkluderer BÅDE positive og negative fakturabeløp (kreditnotaer teller inn i
//    bøtten deres egen forfallsdato hører til), slik at bøttene summerer seg nøyaktig opp til
//    totalt utestående,
//  - `forfalt` = alt med >0 dager forfalt, `forfalt30Plus` = alt med >30 dager forfalt,
//  - auto-risiko: 91+ dager = "hoy", 61-90 dager = "medium", ellers "lav".
//
// Alle beløp er kroner, alle datoer ISO ("YYYY-MM-DD") — samme form som RECEIVABLES i
// lib/widgets.ts, som er kilden funksjonene faktisk kjøres på i appen.

const AS_OF = "2026-09-07";

/** Forfallsdato som ligger nøyaktig `dager` dager før AS_OF (negativ = frem i tid). */
function forfallsdatoMedDagerForfalt(dager: number): string {
  const dt = new Date(Date.UTC(2026, 8, 7));
  dt.setUTCDate(dt.getUTCDate() - dager);
  return dt.toISOString().slice(0, 10);
}

function fordring(fakturaer: ReceivableInvoice[]): Receivable {
  const sum = fakturaer.reduce((a, f) => a + f.belop, 0);
  return {
    id: "r-test",
    leietaker: "Demokunde 1",
    utestaende: sum,
    selskaper: [{ selskap: "Mustad Eiendom AS", belop: sum, antallLinjer: fakturaer.length, fakturaer }],
  };
}

/** Én faktura med gitt alder — praktisk for grensetestene. */
function medAlder(dager: number, belop = 100_000): Receivable {
  return fordring([{ fakturaNr: "1", belop, forfallsdato: forfallsdatoMedDagerForfalt(dager) }]);
}

describe("computeAging — bøttegrenser", () => {
  it("legger en faktura som forfaller i dag (0 dager forfalt) i ikkeForfalt", () => {
    const a = computeAging(medAlder(0), AS_OF);
    expect(a.ikkeForfalt).toBe(100_000);
    expect(a.d0_30).toBe(0);
    expect(a.forfalt).toBe(0);
  });

  it("legger en faktura med forfallsdato frem i tid i ikkeForfalt", () => {
    const a = computeAging(medAlder(-14), AS_OF);
    expect(a.ikkeForfalt).toBe(100_000);
    expect(a.forfalt).toBe(0);
  });

  it("legger en faktura forfalt i 1 dag i d0_30, ikke ikkeForfalt", () => {
    const a = computeAging(medAlder(1), AS_OF);
    expect(a.d0_30).toBe(100_000);
    expect(a.ikkeForfalt).toBe(0);
  });

  it("legger en faktura forfalt i 30 dager i d0_30, ikke d31_60", () => {
    const a = computeAging(medAlder(30), AS_OF);
    expect(a.d0_30).toBe(100_000);
    expect(a.d31_60).toBe(0);
  });

  it("legger en faktura forfalt i 31 dager i d31_60, ikke d0_30", () => {
    const a = computeAging(medAlder(31), AS_OF);
    expect(a.d31_60).toBe(100_000);
    expect(a.d0_30).toBe(0);
  });

  it("legger en faktura forfalt i 60 dager i d31_60, ikke d61_90", () => {
    const a = computeAging(medAlder(60), AS_OF);
    expect(a.d31_60).toBe(100_000);
    expect(a.d61_90).toBe(0);
  });

  it("legger en faktura forfalt i 61 dager i d61_90, ikke d31_60", () => {
    const a = computeAging(medAlder(61), AS_OF);
    expect(a.d61_90).toBe(100_000);
    expect(a.d31_60).toBe(0);
  });

  it("legger en faktura forfalt i 90 dager i d61_90, ikke d91Plus", () => {
    const a = computeAging(medAlder(90), AS_OF);
    expect(a.d61_90).toBe(100_000);
    expect(a.d91Plus).toBe(0);
  });

  it("legger en faktura forfalt i 91 dager i d91Plus, ikke d61_90", () => {
    const a = computeAging(medAlder(91), AS_OF);
    expect(a.d91Plus).toBe(100_000);
    expect(a.d61_90).toBe(0);
  });

  it("legger en faktura forfalt i over to år i d91Plus", () => {
    const a = computeAging(medAlder(890), AS_OF);
    expect(a.d91Plus).toBe(100_000);
  });

  it("plasserer hver bøttegrense i nøyaktig én bøtte (ingen dobbelttelling)", () => {
    for (const dager of [0, 1, 30, 31, 60, 61, 90, 91]) {
      const a = computeAging(medAlder(dager, 1_000), AS_OF);
      const bøtter = [a.ikkeForfalt, a.d0_30, a.d31_60, a.d61_90, a.d91Plus];
      expect(bøtter.filter((b) => b !== 0), `dager=${dager}`).toHaveLength(1);
      expect(bøtter.reduce((x, y) => x + y, 0)).toBe(1_000);
    }
  });

  it("summerer bøttene til totalt utestående for en fordring med fakturaer i alle bøtter", () => {
    const r = fordring([
      { fakturaNr: "1", belop: 500_000, forfallsdato: forfallsdatoMedDagerForfalt(-10) },
      { fakturaNr: "2", belop: 120_000, forfallsdato: forfallsdatoMedDagerForfalt(15) },
      { fakturaNr: "3", belop: 90_000, forfallsdato: forfallsdatoMedDagerForfalt(45) },
      { fakturaNr: "4", belop: 60_000, forfallsdato: forfallsdatoMedDagerForfalt(75) },
      { fakturaNr: "5", belop: 30_000, forfallsdato: forfallsdatoMedDagerForfalt(200) },
    ]);
    const a = computeAging(r, AS_OF);
    expect(a.ikkeForfalt + a.d0_30 + a.d31_60 + a.d61_90 + a.d91Plus).toBe(r.utestaende);
  });
});

describe("computeAging — kreditnotaer (negative beløp)", () => {
  it("legger en kreditnota forfalt i 45 dager i d31_60 (ikke i ikkeForfalt)", () => {
    const a = computeAging(medAlder(45, -25_000), AS_OF);
    expect(a.d31_60).toBe(-25_000);
    expect(a.ikkeForfalt).toBe(0);
  });

  it("legger en kreditnota med forfallsdato frem i tid i ikkeForfalt", () => {
    const a = computeAging(medAlder(-5, -25_000), AS_OF);
    expect(a.ikkeForfalt).toBe(-25_000);
    expect(a.d0_30).toBe(0);
  });

  it("netter kreditnota mot faktura innenfor samme bøtte", () => {
    const r = fordring([
      { fakturaNr: "1", belop: 200_000, forfallsdato: forfallsdatoMedDagerForfalt(120) },
      { belop: -50_000, forfallsdato: forfallsdatoMedDagerForfalt(100) },
    ]);
    const a = computeAging(r, AS_OF);
    expect(a.d91Plus).toBe(150_000);
    expect(a.forfalt).toBe(150_000);
  });

  it("lar bøttene summere seg til totalt utestående også når totalen er negativ", () => {
    const r = fordring([
      { fakturaNr: "1", belop: 40_000, forfallsdato: forfallsdatoMedDagerForfalt(10) },
      { belop: -100_000, forfallsdato: forfallsdatoMedDagerForfalt(95) },
    ]);
    const a = computeAging(r, AS_OF);
    expect(r.utestaende).toBe(-60_000);
    expect(a.ikkeForfalt + a.d0_30 + a.d31_60 + a.d61_90 + a.d91Plus).toBe(-60_000);
  });
});

describe("computeAging — forfalt / forfalt30Plus", () => {
  const r = fordring([
    { fakturaNr: "1", belop: 500_000, forfallsdato: forfallsdatoMedDagerForfalt(-3) },
    { fakturaNr: "2", belop: 120_000, forfallsdato: forfallsdatoMedDagerForfalt(1) },
    { fakturaNr: "3", belop: 100_000, forfallsdato: forfallsdatoMedDagerForfalt(30) },
    { fakturaNr: "4", belop: 90_000, forfallsdato: forfallsdatoMedDagerForfalt(31) },
    { fakturaNr: "5", belop: 60_000, forfallsdato: forfallsdatoMedDagerForfalt(90) },
    { fakturaNr: "6", belop: 30_000, forfallsdato: forfallsdatoMedDagerForfalt(91) },
  ]);

  it("forfalt er summen av d0_30 + d31_60 + d61_90 + d91Plus", () => {
    const a = computeAging(r, AS_OF);
    expect(a.forfalt).toBe(a.d0_30 + a.d31_60 + a.d61_90 + a.d91Plus);
    expect(a.forfalt).toBe(400_000);
  });

  it("forfalt utelater ikkeForfalt", () => {
    const a = computeAging(r, AS_OF);
    expect(a.forfalt).toBe(r.utestaende - a.ikkeForfalt);
  });

  it("forfalt30Plus er summen av d31_60 + d61_90 + d91Plus (utelater d0_30)", () => {
    const a = computeAging(r, AS_OF);
    expect(a.forfalt30Plus).toBe(a.d31_60 + a.d61_90 + a.d91Plus);
    expect(a.forfalt30Plus).toBe(180_000);
    expect(a.forfalt - a.forfalt30Plus).toBe(a.d0_30);
  });

  it("regner en faktura forfalt i nøyaktig 30 dager som forfalt, men IKKE som forfalt30Plus", () => {
    const a = computeAging(medAlder(30), AS_OF);
    expect(a.forfalt).toBe(100_000);
    expect(a.forfalt30Plus).toBe(0);
  });

  it("gir nullstilt aggregat for en fordring uten fakturalinjer", () => {
    const a = computeAging(fordring([]), AS_OF);
    expect(a).toEqual({ ikkeForfalt: 0, d0_30: 0, d31_60: 0, d61_90: 0, d91Plus: 0, forfalt: 0, forfalt30Plus: 0 });
  });
});

describe("computeAging — flere selskaper", () => {
  it("summerer fakturaer på tvers av alle selskapene i fordringen", () => {
    const r: Receivable = {
      id: "r-flere",
      leietaker: "Demokunde 12",
      utestaende: 300_000,
      selskaper: [
        {
          selskap: "Mustad Eiendom AS",
          belop: 200_000,
          antallLinjer: 1,
          fakturaer: [{ fakturaNr: "A", belop: 200_000, forfallsdato: forfallsdatoMedDagerForfalt(95) }],
        },
        {
          selskap: "Lilleaker Service AS",
          belop: 100_000,
          antallLinjer: 1,
          fakturaer: [{ fakturaNr: "B", belop: 100_000, forfallsdato: forfallsdatoMedDagerForfalt(5) }],
        },
      ],
    };
    const a = computeAging(r, AS_OF);
    expect(a.d91Plus).toBe(200_000);
    expect(a.d0_30).toBe(100_000);
    expect(a.forfalt).toBe(300_000);
  });
});

describe("computeAutoRisk — eskaleringsterskler", () => {
  it("gir lav risiko når alt er innenfor forfall", () => {
    expect(computeAutoRisk(medAlder(-10), AS_OF)).toBe("lav");
  });

  it("gir lav risiko ved 60 dager forfalt (under medium-terskelen)", () => {
    expect(computeAutoRisk(medAlder(60), AS_OF)).toBe("lav");
  });

  it("gir medium risiko ved 61 dager forfalt", () => {
    expect(computeAutoRisk(medAlder(61), AS_OF)).toBe("medium");
  });

  it("gir medium risiko ved 90 dager forfalt", () => {
    expect(computeAutoRisk(medAlder(90), AS_OF)).toBe("medium");
  });

  it("gir hoy risiko ved 91 dager forfalt", () => {
    expect(computeAutoRisk(medAlder(91), AS_OF)).toBe("hoy");
  });

  it("lar 91+ trumfe 61-90 når begge bøttene har beløp", () => {
    const r = fordring([
      { fakturaNr: "1", belop: 10_000, forfallsdato: forfallsdatoMedDagerForfalt(70) },
      { fakturaNr: "2", belop: 5_000, forfallsdato: forfallsdatoMedDagerForfalt(200) },
    ]);
    expect(computeAutoRisk(r, AS_OF)).toBe("hoy");
  });

  it("gir lav risiko når 91+-bøtten er nettet ut til null av en kreditnota", () => {
    // Dokumenterer gjeldende netto-semantikk: terskelen ser på bøttesummen, ikke på om det
    // finnes en gammel faktura. Nettet ut = ingenting utestående = lav risiko.
    const r = fordring([
      { fakturaNr: "1", belop: 300_000, forfallsdato: forfallsdatoMedDagerForfalt(200) },
      { belop: -300_000, forfallsdato: forfallsdatoMedDagerForfalt(150) },
    ]);
    expect(computeAging(r, AS_OF).d91Plus).toBe(0);
    expect(computeAutoRisk(r, AS_OF)).toBe("lav");
  });

  it("gir medium risiko når 91+ er negativ men 61-90 er positiv", () => {
    const r = fordring([
      { belop: -50_000, forfallsdato: forfallsdatoMedDagerForfalt(200) },
      { fakturaNr: "1", belop: 80_000, forfallsdato: forfallsdatoMedDagerForfalt(75) },
    ]);
    expect(computeAutoRisk(r, AS_OF)).toBe("medium");
  });
});
