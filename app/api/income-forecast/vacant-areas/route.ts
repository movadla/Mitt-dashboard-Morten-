import { NextResponse } from "next/server";
import { getVacantAreasSnapshot } from "@/lib/vacantAreas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getVacantAreasSnapshot();
    return NextResponse.json({ snapshot });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
