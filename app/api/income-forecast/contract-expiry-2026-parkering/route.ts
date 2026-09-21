import { NextResponse } from "next/server";
import { getContractExpiryParking2026Snapshot } from "@/lib/contractExpiryParking2026";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getContractExpiryParking2026Snapshot();
    return NextResponse.json({ snapshot });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
