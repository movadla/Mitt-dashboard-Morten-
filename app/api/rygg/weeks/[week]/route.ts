import { NextRequest, NextResponse } from "next/server";
import type { RyggWeekDecision } from "@/lib/ryggLog";
import { overrideWeekDecision, resumeFromHold } from "@/lib/ryggWeekCycle";

export const dynamic = "force-dynamic";

const VALID_DECISIONS: RyggWeekDecision[] = ["progress", "repeat", "deload", "hold"];

// Manuell overstyring av ukas beslutning ({ action: "override", decision, reason })
// eller gjenopptak etter "hold"/utstråling ({ action: "resume" }) — se spec §4:
// "Algoritmen er et forslag, ikke en sjef."
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ week: string }> }) {
  const { week: weekParam } = await params;
  const week = Number(weekParam);
  if (!Number.isFinite(week)) return NextResponse.json({ error: "Ugyldig ukenummer" }, { status: 400 });

  try {
    const body = await request.json();

    if (body.action === "resume") {
      const weekState = await resumeFromHold(week);
      return NextResponse.json(weekState);
    }

    if (body.action === "override") {
      if (!VALID_DECISIONS.includes(body.decision)) {
        return NextResponse.json({ error: "Ugyldig beslutning" }, { status: 400 });
      }
      if (!body.reason || typeof body.reason !== "string") {
        return NextResponse.json({ error: "Mangler begrunnelse" }, { status: 400 });
      }
      const result = await overrideWeekDecision(week, body.decision, body.reason);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Ukjent action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
