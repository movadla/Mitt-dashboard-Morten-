import { NextRequest, NextResponse } from "next/server";
import { getReviewMarks, removeReviewMark, setReviewMark, type ReviewMarkStatus } from "@/lib/incomeForecastReviewMarks";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ marks: await getReviewMarks() });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PUT setter/oppdaterer et merke, DELETE fjerner det. Begge tar (leietaker, bygg) - tomt bygg
// betyr "gjelder alle byggene til denne leietakeren", se lib/incomeForecastReviewMarks.ts.
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const leietaker = String(body.leietaker ?? "");
    const bygg = String(body.bygg ?? "");
    const status = String(body.status ?? "") as ReviewMarkStatus;
    const notat = String(body.notat ?? "");
    const skjul = body.skjulFraGjennomgang === undefined ? undefined : Boolean(body.skjulFraGjennomgang);
    return NextResponse.json(await setReviewMark(leietaker, bygg, status, notat, skjul));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    await removeReviewMark(String(body.leietaker ?? ""), String(body.bygg ?? ""));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
