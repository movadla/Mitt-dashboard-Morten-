import type { InvoicedSnapshot, ManualNxtSnapshot, RemainingSnapshot } from "./incomeForecast";
import type { ManualIncomeLine } from "./incomeForecastManual";

export interface PartTotals {
  fakturertHittil: number;
  manueltNxtHittil: number;
  gjenstaendeSikker: number;
  gjenstaendeUsikker: number;
  manuelleLinjer: number;
  totalt: number;
}

export interface ForecastRollup {
  delA: PartTotals;
  delB: PartTotals;
  totalt: number;
  hvoravAntattFornyelse: number;
}

function emptyTotals(): PartTotals {
  return { fakturertHittil: 0, manueltNxtHittil: 0, gjenstaendeSikker: 0, gjenstaendeUsikker: 0, manuelleLinjer: 0, totalt: 0 };
}

export function computeForecastRollup(params: {
  invoiced: InvoicedSnapshot;
  manualNxt: ManualNxtSnapshot;
  remaining: RemainingSnapshot;
  manualLines: ManualIncomeLine[];
}): ForecastRollup {
  const { invoiced, manualNxt, remaining, manualLines } = params;

  const delA = emptyTotals();
  const delB = emptyTotals();

  for (const p of invoiced.periods) {
    delA.fakturertHittil += p.delA;
    delB.fakturertHittil += p.delB;
  }

  for (const v of manualNxt.vouchers) {
    if (v.del === "A") delA.manueltNxtHittil += v.belop;
    else delB.manueltNxtHittil += v.belop;
  }

  for (const t of remaining.tenants) {
    for (const l of t.lines) {
      const target = l.del === "A" ? delA : delB;
      if (l.sikkerhet === "sikker") target.gjenstaendeSikker += l.belopGjenstaende;
      else target.gjenstaendeUsikker += l.belopGjenstaende;
    }
  }

  for (const m of manualLines) {
    if (!m.aktiv) continue;
    const target = m.del === "A" ? delA : delB;
    target.manuelleLinjer += m.belop;
  }

  for (const totals of [delA, delB]) {
    totals.totalt =
      totals.fakturertHittil + totals.manueltNxtHittil + totals.gjenstaendeSikker + totals.gjenstaendeUsikker + totals.manuelleLinjer;
  }

  return {
    delA,
    delB,
    totalt: delA.totalt + delB.totalt,
    hvoravAntattFornyelse: delA.gjenstaendeUsikker + delB.gjenstaendeUsikker,
  };
}
