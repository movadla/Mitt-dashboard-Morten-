import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { buildDashboardContext } from "@/lib/widgets";

const MODEL = "claude-haiku-4-5";

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY er ikke satt i .env.local" },
      { status: 500 },
    );
  }

  const { messages } = await request.json();
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Mangler meldinger" }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const system =
    "Du er Mortens personlige assistent i mitt-dashboard. Svar kort og konkret på norsk.\n" +
    "Nye kontrakter, leieinntekt per bygg, dagens møter og garantioversikt under er EKTE data " +
    "(Fazile, Outlook og Asana — hentet 2026-08-10). Kundefordringer er fortsatt TESTDATA " +
    "(Fazile sitt fakturaverktøy er nedafor akkurat nå) — gjør det klart hvis du bruker de tallene, " +
    "f.eks. 'ifølge testdataene i dashboardet'. Du har ikke direkte tilgang til å slå opp i disse " +
    "systemene selv — du kjenner bare det som står i sammendraget under.\n\n" +
    buildDashboardContext();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    system,
    messages,
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return NextResponse.json({ text });
}
