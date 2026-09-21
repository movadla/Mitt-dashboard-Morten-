import { NextRequest, NextResponse, after } from "next/server";
import { completeStockItem, ensureStockFilled } from "@/lib/aiTips";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "Mangler id" }, { status: 400 });

  const tip = await completeStockItem(id);
  if (!tip) return NextResponse.json({ error: "Fant ikke tipset" }, { status: 404 });
  after(async () => {
    try {
      await ensureStockFilled();
    } catch {
      /* neste GET/complete-kall prøver igjen */
    }
  });
  return NextResponse.json({ tip });
}
