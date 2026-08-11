import { NextRequest, NextResponse } from "next/server";
import { addLoan, getLoans } from "@/lib/loans";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const loans = await getLoans();
    return NextResponse.json({ loans });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const loan = await addLoan(body);
    return NextResponse.json(loan, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
