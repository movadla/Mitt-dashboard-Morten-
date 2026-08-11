import { NextRequest, NextResponse } from "next/server";
import { addSavings, getSavings } from "@/lib/savings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const savings = await getSavings();
    return NextResponse.json({ savings });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const account = await addSavings(body);
    return NextResponse.json(account, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
