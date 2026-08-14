import { NextResponse } from "next/server";
import { RECEIVABLES } from "@/lib/widgets";
import { computeAging } from "@/lib/receivablesAging";
import { getReceivableRisks } from "@/lib/receivableRisk";
import { getSnapshots, saveSnapshot, type ReceivableSnapshot } from "@/lib/receivablesSnapshots";
import { localDateString } from "@/lib/payday";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshots = await getSnapshots();
    return NextResponse.json({ snapshots });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const risks = await getReceivableRisks();
    const today = localDateString();
    const snapshot: ReceivableSnapshot = {
      dato: today,
      rader: RECEIVABLES.map((r) => {
        const aging = computeAging(r, today);
        return {
          id: r.id,
          leietaker: r.leietaker,
          utestaende: r.utestaende,
          ikkeForfalt: Math.round(aging.ikkeForfalt * 100) / 100,
          forfalt: Math.round(aging.forfalt * 100) / 100,
          forfalt91: Math.round(aging.d91Plus * 100) / 100,
          risiko: risks[r.id] ?? null,
        };
      }),
    };
    await saveSnapshot(snapshot);
    return NextResponse.json({ snapshot });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
