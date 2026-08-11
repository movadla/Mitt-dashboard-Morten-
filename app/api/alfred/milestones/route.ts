import { NextRequest, NextResponse } from "next/server";
import { addMilestone, getMilestones, type MilestoneCategory } from "@/lib/alfred";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const milestones = await getMilestones();
    return NextResponse.json({ milestones });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const milestone = await addMilestone(body.category as MilestoneCategory, body.label, body.done ?? false);
    return NextResponse.json(milestone, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
