import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { pin } = await request.json();
  if (pin !== process.env.AUTH_PIN) {
    return NextResponse.json({ error: "Feil PIN" }, { status: 401 });
  }
  const cookieStore = await cookies();
  cookieStore.set("auth", process.env.AUTH_SECRET!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return NextResponse.json({ ok: true });
}
