import { NextRequest, NextResponse } from "next/server";
import { addSalaryEntry, getSalaryEntries } from "@/lib/salary";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const salary = await getSalaryEntries();
    return NextResponse.json({ salary });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const entry = await addSalaryEntry(body);
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
