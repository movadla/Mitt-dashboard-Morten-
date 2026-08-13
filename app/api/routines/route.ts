import { NextRequest, NextResponse } from "next/server";
import { addRoutine, getRoutines } from "@/lib/routines";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const routines = await getRoutines();
    return NextResponse.json({ routines });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const routine = await addRoutine(body);
    return NextResponse.json(routine, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
