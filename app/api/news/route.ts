import { NextRequest, NextResponse } from "next/server";
import { getNews, invalidateNewsCache } from "@/lib/news";

export const dynamic = "force-dynamic";

// ?refresh=1 tømmer Redis-cachen før hentingen — samme mønster som
// app/api/sports/route.ts, av samme grunn (tvinge frem en retting uten å
// vente på CACHE_FRESH_SECONDS).
export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("refresh") === "1") {
      await invalidateNewsCache();
    }
    const items = await getNews();
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
