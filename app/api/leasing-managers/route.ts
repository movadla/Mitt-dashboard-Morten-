import { NextRequest, NextResponse } from "next/server";
import { addLeasingManager, getLeasingManagers } from "@/lib/leasingManagers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const managers = await getLeasingManagers();
    return NextResponse.json({ managers });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const manager = await addLeasingManager(body);
    return NextResponse.json(manager, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
