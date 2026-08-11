import { NextRequest, NextResponse } from "next/server";
import { getAlfredProfile, updateAlfredProfile } from "@/lib/alfred";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await getAlfredProfile();
    return NextResponse.json({ profile });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  try {
    const profile = await updateAlfredProfile(body);
    return NextResponse.json(profile);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
