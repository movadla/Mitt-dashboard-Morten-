import type { Receivable } from "./widgets";

export interface ReceivableAging {
  ikkeForfalt: number;
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d91Plus: number;
  forfalt: number;
  forfalt30Plus: number;
}

function daysOverdue(forfallsdato: string, asOfDateISO: string): number {
  return Math.round((new Date(asOfDateISO).getTime() - new Date(forfallsdato).getTime()) / 86400000);
}

// Bøtter inkluderer BÅDE positive og negative fakturabeløp (kreditnotaer/motposter
// teller inn i bøtten sin egen forfallsdato hører til) — slik summerer bøttene seg
// nøyaktig opp til Totalt utestående, samme prinsipp som i Mortens Excel-ark.
export function computeAging(receivable: Receivable, asOfDateISO: string): ReceivableAging {
  const agg: ReceivableAging = { ikkeForfalt: 0, d0_30: 0, d31_60: 0, d61_90: 0, d91Plus: 0, forfalt: 0, forfalt30Plus: 0 };
  for (const selskap of receivable.selskaper) {
    for (const f of selskap.fakturaer) {
      const days = daysOverdue(f.forfallsdato, asOfDateISO);
      if (days <= 0) agg.ikkeForfalt += f.belop;
      else if (days <= 30) agg.d0_30 += f.belop;
      else if (days <= 60) agg.d31_60 += f.belop;
      else if (days <= 90) agg.d61_90 += f.belop;
      else agg.d91Plus += f.belop;
    }
  }
  agg.forfalt = agg.d0_30 + agg.d31_60 + agg.d61_90 + agg.d91Plus;
  agg.forfalt30Plus = agg.d31_60 + agg.d61_90 + agg.d91Plus;
  return agg;
}

// Enkel terskelsum (brukt for kortets "60+ dgr"/"91+ dgr"-kolonner) — samme
// inkluder-alt-prinsipp som computeAging, bare uten faste 30-dagers bøtter.
export function sumOverdueDays(receivable: Receivable, asOfDateISO: string, minDays: number): number {
  let sum = 0;
  for (const selskap of receivable.selskaper) {
    for (const f of selskap.fakturaer) {
      if (daysOverdue(f.forfallsdato, asOfDateISO) >= minDays) sum += f.belop;
    }
  }
  return sum;
}
