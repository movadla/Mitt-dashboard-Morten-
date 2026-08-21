import { NextRequest, NextResponse } from "next/server";
import { getJobbTaskState, saveJobbTaskState } from "@/lib/jobbTaskState";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getJobbTaskState();
    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    await saveJobbTaskState({
      done: Array.isArray(body?.done) ? body.done : [],
      priorityOverrides: body?.priorityOverrides ?? {},
      snoozed: body?.snoozed ?? {},
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
