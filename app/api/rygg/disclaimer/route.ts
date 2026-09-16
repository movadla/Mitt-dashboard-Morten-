import { NextResponse } from "next/server";
import { getRyggDisclaimerSeenAt, markRyggDisclaimerSeen } from "@/lib/ryggLog";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const seenAt = await getRyggDisclaimerSeenAt();
    return NextResponse.json({ seenAt });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    await markRyggDisclaimerSeen();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
