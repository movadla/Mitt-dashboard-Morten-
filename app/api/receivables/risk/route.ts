import { NextRequest, NextResponse } from "next/server";
import { getReceivableRisks, setReceivableRisk, type ReceivableRiskLevel } from "@/lib/receivableRisk";

export const dynamic = "force-dynamic";

const VALID: ReceivableRiskLevel[] = ["lav", "medium", "hoy"];

export async function GET() {
  try {
    const risks = await getReceivableRisks();
    return NextResponse.json({ risks });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, risk } = body as { id?: string; risk?: ReceivableRiskLevel | null };
  if (!id) {
    return NextResponse.json({ error: "Mangler id" }, { status: 400 });
  }
  if (risk !== null && !VALID.includes(risk as ReceivableRiskLevel)) {
    return NextResponse.json({ error: "Ugyldig risikoverdi" }, { status: 400 });
  }
  try {
    await setReceivableRisk(id, risk ?? null);
    return NextResponse.json({ id, risk: risk ?? null });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
