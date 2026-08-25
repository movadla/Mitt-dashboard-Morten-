import { NextResponse } from "next/server";
import { getOmsetningsavregningSnapshot } from "@/lib/omsetningsavregning";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getOmsetningsavregningSnapshot();
    return NextResponse.json({ snapshot });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
