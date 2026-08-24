import { NextResponse } from "next/server";
import { getContractExpiry2026Snapshot } from "@/lib/contractExpiry2026";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getContractExpiry2026Snapshot();
    return NextResponse.json({ snapshot });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
