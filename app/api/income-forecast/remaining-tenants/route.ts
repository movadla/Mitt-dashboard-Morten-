import { NextResponse } from "next/server";
import { getRemainingTenantsSnapshot } from "@/lib/incomeForecastRemainingTenants";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getRemainingTenantsSnapshot();
    return NextResponse.json({ snapshot });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
