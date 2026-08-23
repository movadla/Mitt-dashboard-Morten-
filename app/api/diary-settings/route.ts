import { NextRequest, NextResponse } from "next/server";
import { getDiarySettings, updateDiarySettings } from "@/lib/diarySettings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getDiarySettings();
    return NextResponse.json(settings);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const settings = await updateDiarySettings(body);
    return NextResponse.json(settings);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
