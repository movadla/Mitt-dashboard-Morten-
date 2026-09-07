import { NextResponse } from "next/server";
import { getManualIncomeLines } from "@/lib/incomeForecastManual";
import { getPotentialIncomeSnapshot } from "@/lib/incomeForecastPotential";
import { getTenantSignals } from "@/lib/tenantSignals";
import { getTenantForecastComments } from "@/lib/tenantForecastComments";

export const dynamic = "force-dynamic";

// v18 (2026-09-07, "sikre tallgrunnlaget"-gjennomgangen): JSON-eksport av ALT innhold som KUN
// finnes i Redis og IKKE er re-utledbart fra Fazile/NXT/Excel - Morten sine egne
// leietakerkommentarer, manuelle inntektslinjer, potensial-anslag og reforhandlingssignaler.
// `npm run refresh:income-forecast` overskriver aldri disse (egne Redis-nøkler), men en mistet
// Redis-instans ville tatt dem for godt siden ingen kildesystem har dem. Kun LESING her - en
// gjenopprettingsrute ville vært et separat, mer forsiktig stykke arbeid (risiko for å overskrive
// levende data), se scripts/REFRESH.md.
export async function GET() {
  try {
    const [manualLines, potential, tenantSignals, tenantComments] = await Promise.all([
      getManualIncomeLines(),
      getPotentialIncomeSnapshot(),
      getTenantSignals(),
      getTenantForecastComments(),
    ]);
    return NextResponse.json({
      eksportertDato: new Date().toISOString(),
      manualLines,
      potential,
      tenantSignals,
      tenantComments,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
