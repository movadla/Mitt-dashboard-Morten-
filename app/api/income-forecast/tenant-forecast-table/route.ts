import { NextResponse } from "next/server";
import { getTenantForecastTable } from "@/lib/tenantForecastTable";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getTenantForecastTable();
    return NextResponse.json({ snapshot });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
