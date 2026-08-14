import { NextResponse } from "next/server";
import { createAndSaveTodaysSnapshot, getSnapshots } from "@/lib/receivablesSnapshots";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshots = await getSnapshots();
    return NextResponse.json({ snapshots });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const snapshot = await createAndSaveTodaysSnapshot();
    return NextResponse.json({ snapshot });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
