import { NextResponse } from "next/server";
import { getBookedTenantsSnapshot } from "@/lib/incomeForecastBookedTenants";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getBookedTenantsSnapshot();
    return NextResponse.json({ snapshot });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
