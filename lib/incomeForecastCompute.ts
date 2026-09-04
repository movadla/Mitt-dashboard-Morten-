import type { BookedAccountRangeSnapshot, RemainingSnapshot } from "./incomeForecast";
import type { ManualIncomeLine } from "./incomeForecastManual";

export interface PartTotals {
  fakturertHittil: number;
  // Historisk felt - stod tidligere for manuelt bokførte NXT-bilag lagt til OVENPÅ
  // fakturertHittil (fra INVOICED, periode-begrenset). OPPDATERT 2026-08-30: fant en reell
  // dobbelttelling ved å spore en enkelt post (konto 3632, "Avsetning omsetningsleie 2025")
  // direkte i NXT - generalLedgerPeriodBalance sin periodesaldo inkluderer ALLEREDE alle
  // posteringer uansett origin (bekreftet: summen av samtlige origin-transaksjoner for
  // konto+periode matchet periodesaldoen på øret), så et eget MANUAL_NXT-tillegg dobbelttalte
  // manuelle bilag som periodesaldoen allerede hadde med. `fakturertHittil` kommer nå fra
  // `BOOKED_3600_3699` (rå, helårs, ingen periodebegrensning) i stedet for INVOICED+MANUAL_NXT -
  // dette feltet holdes på 0 og beholdes kun for å unngå å endre PartTotals-formen andre steder
  // i UI-en (se ForecastSummaryBlock). MANUAL_NXT-konstanten/visningen lever videre som ren
  // historikk/kontekst, bare ikke lenger summert inn her.
  manueltNxtHittil: number;
  gjenstaende: number;
  manuelleLinjer: number;
  totalt: number;
}

export interface ForecastRollup {
  delA: PartTotals;
  delB: PartTotals;
  totalt: number;
}

function emptyTotals(): PartTotals {
  return { fakturertHittil: 0, manueltNxtHittil: 0, gjenstaende: 0, manuelleLinjer: 0, totalt: 0 };
}

export function computeForecastRollup(params: {
  booked: BookedAccountRangeSnapshot;
  remaining: RemainingSnapshot;
  manualLines: ManualIncomeLine[];
}): ForecastRollup {
  const { booked, remaining, manualLines } = params;

  const delA = emptyTotals();
  const delB = emptyTotals();

  delA.fakturertHittil = booked.totalDelA;
  delB.fakturertHittil = booked.totalDelB;

  delA.gjenstaende += remaining.totalDelA;
  delB.gjenstaende += remaining.totalDelB;

  for (const m of manualLines) {
    if (!m.aktiv) continue;
    const target = m.del === "A" ? delA : delB;
    target.manuelleLinjer += m.belop;
  }

  for (const totals of [delA, delB]) {
    totals.totalt = totals.fakturertHittil + totals.manueltNxtHittil + totals.gjenstaende + totals.manuelleLinjer;
  }

  return {
    delA,
    delB,
    totalt: delA.totalt + delB.totalt,
  };
}
