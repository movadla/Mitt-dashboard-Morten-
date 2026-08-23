import { NextResponse } from "next/server";
import { getDiaryPresets } from "@/lib/diaryPresets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const presets = await getDiaryPresets();
    return NextResponse.json({ presets });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
