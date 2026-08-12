import { NextRequest, NextResponse } from "next/server";
import { getQuickPicks, recordQuickPickUsage } from "@/lib/shoppingQuickPicks";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const quickPicks = await getQuickPicks();
    return NextResponse.json({ quickPicks });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const quickPick = await recordQuickPickUsage(body.name, body.section);
    return NextResponse.json(quickPick, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
