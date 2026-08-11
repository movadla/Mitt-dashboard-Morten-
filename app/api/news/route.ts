import { NextResponse } from "next/server";
import { getNews } from "@/lib/news";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await getNews();
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
