import { NextRequest, NextResponse, after } from "next/server";
import { completeStockItem, ensureStockFilled } from "@/lib/aiTips";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "Mangler id" }, { status: 400 });

  await completeStockItem(id);
  after(async () => {
    try {
      await ensureStockFilled();
    } catch {
      /* neste GET/complete-kall prøver igjen */
    }
  });
  return NextResponse.json({ ok: true });
}
