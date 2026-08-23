import { NextRequest, NextResponse } from "next/server";
import { addPurchase } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const project = await addPurchase(id, body.name, body.quantity || undefined);
    if (!project) return NextResponse.json({ error: "Fant ikke prosjektet" }, { status: 404 });
    return NextResponse.json(project);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
