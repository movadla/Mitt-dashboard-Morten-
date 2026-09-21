import { NextResponse, after } from "next/server";
import { getStock, ensureStockFilled, STOCK_TARGET } from "@/lib/aiTips";

export const dynamic = "force-dynamic";

// Leser lageret umiddelbart og returnerer det som finnes NÅ (kan være under
// målet, spesielt tidlig) — etterfyllingen trigges i bakgrunnen via after() slik
// at responsen aldri venter på et Sonnet+web_search-kall (samme mønster som
// refreshNewsInBackground i lib/news.ts).
export async function GET() {
  const stock = await getStock();
  if (stock.length < STOCK_TARGET) {
    after(async () => {
      try {
        await ensureStockFilled();
      } catch {
        /* neste GET/complete-kall prøver igjen */
      }
    });
  }
  return NextResponse.json({ stock });
}
