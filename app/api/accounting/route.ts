import { NextRequest, NextResponse } from "next/server";
import { addAccountingEntry, getAccountingEntries } from "@/lib/accounting";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const entries = await getAccountingEntries();
    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const entry = await addAccountingEntry(body);
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
