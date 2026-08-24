import { NextRequest, NextResponse } from "next/server";
import { getPotentialIncomeSnapshot, updatePotentialIncomeCategory, type PotentialIncomeCategoryKey } from "@/lib/incomeForecastPotential";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getPotentialIncomeSnapshot();
    return NextResponse.json({ snapshot });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const key = body.key as PotentialIncomeCategoryKey;
    const category = await updatePotentialIncomeCategory(key, { belop: body.belop, notat: body.notat });
    return NextResponse.json(category);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
