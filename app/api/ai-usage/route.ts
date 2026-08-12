import { NextRequest, NextResponse } from "next/server";
import { getAiUsageSummary, setBalance } from "@/lib/aiUsage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const summary = await getAiUsageSummary();
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const amount = Number(body?.balanceUsd);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "Ugyldig saldo" }, { status: 400 });
  }
  try {
    await setBalance(amount);
    const summary = await getAiUsageSummary();
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
