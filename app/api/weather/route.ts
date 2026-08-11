import { NextResponse } from "next/server";
import { getWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const weather = await getWeather();
    return NextResponse.json(weather);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
