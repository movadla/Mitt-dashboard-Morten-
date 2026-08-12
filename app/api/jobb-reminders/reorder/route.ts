import { NextRequest, NextResponse } from "next/server";
import { reorderJobbReminders } from "@/lib/jobbReminders";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const ids = body?.ids;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
      return NextResponse.json({ error: "Mangler gyldig ids-liste" }, { status: 400 });
    }
    const reminders = await reorderJobbReminders(ids);
    return NextResponse.json({ reminders });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
