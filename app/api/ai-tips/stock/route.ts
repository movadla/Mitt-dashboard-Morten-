import { NextResponse, after } from "next/server";
import { getStock, ensureStockFilled } from "@/lib/aiTips";

export const dynamic = "force-dynamic";

// Leser lageret umiddelbart og returnerer det som finnes NÅ (kan være under
// 10, spesielt tidlig) — etterfyllingen trigges i bakgrunnen via after() slik
// at responsen aldri venter på et Sonnet+web_search-kall (samme mønster som
// refreshNewsInBackground i lib/news.ts).
export async function GET() {
  const stock = await getStock();
  if (stock.length < 10) {
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
