import { NextRequest, NextResponse } from "next/server";
import { reorderEntries } from "@/lib/workouts";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  try {
    const ids = body?.ids;
    if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string")) {
      return NextResponse.json({ error: "Mangler gyldig ids-liste" }, { status: 400 });
    }
    const session = await reorderEntries(id, ids);
    if (!session) return NextResponse.json({ error: "Fant ikke økten" }, { status: 404 });
    return NextResponse.json(session);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
