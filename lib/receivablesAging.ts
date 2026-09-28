import type { Receivable } from "./widgets";
import type { ReceivableRiskLevel } from "./receivableRisk";

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

// Standard-risiko når Morten ikke har satt en manuell overstyring (lib/receivableRisk.ts):
// 91+ dager forfalt regnes som høy risiko, 61-90 dager som medium, ellers lav. Bevisst plassert
// her (ikke i receivableRisk.ts) siden den filen importerer "server-only"/ioredis via lib/kv.ts —
// denne funksjonen må også kunne importeres trygt inn i klientkomponenter (ReceivablesCard).
//
// v2 (2026-09-28, Morten: "sjekk hvem vi har garanti på, for de er jo risikofrie" - dataene ble
// lagt inn på Receivable 2026-09-22, men ble aldri koblet inn her): en verifisert garanti som
// DEKKER hele det forfalte 30+-beløpet gjør leietakeren automatisk lav risiko, uansett hvor mange
// dager forfalt - garantien er jo nettopp poenget med å ikke bekymre seg. En garanti som ikke
// fullt dekker skal IKKE dempe risikoen (samme regel som garantiDekket i IncomeForecastSection.tsx
// sin Kundefordringer-widget).
export function computeAutoRisk(receivable: Receivable, asOfDateISO: string): ReceivableRiskLevel {
  const aging = computeAging(receivable, asOfDateISO);
  if (receivable.garanti && receivable.garanti.belop >= aging.forfalt30Plus) return "lav";
  if (aging.d91Plus > 0) return "hoy";
  if (aging.d61_90 > 0) return "medium";
  return "lav";
}
