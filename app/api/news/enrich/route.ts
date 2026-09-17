import { NextRequest, NextResponse } from "next/server";
import { enrichNewsItem, type NewsItem } from "@/lib/news";

export const dynamic = "force-dynamic";

// Kalt når brukeren faktisk åpner én bestemt nyhetssak — se enrichNewsItem
// for hvorfor dette er det eneste stedet et Claude-kall for nyheter skjer.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<NewsItem>;
    if (!body.link || !body.title || !body.source) {
      return NextResponse.json({ error: "Mangler link, title eller source" }, { status: 400 });
    }
    const item = await enrichNewsItem(body as NewsItem);
    return NextResponse.json(item);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
