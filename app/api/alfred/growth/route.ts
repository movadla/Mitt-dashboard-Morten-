import { NextRequest, NextResponse } from "next/server";
import { addGrowthEntry, getGrowthEntries } from "@/lib/alfred";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const entries = await getGrowthEntries();
    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const entry = await addGrowthEntry(body);
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
