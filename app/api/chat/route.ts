import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { buildDashboardContext, buildPrivatContext } from "@/lib/widgets";
import { addReminder } from "@/lib/reminders";
import { addPrivatEvent } from "@/lib/privatCalendar";

const MODEL = "claude-haiku-4-5";
const MAX_TOOL_ROUNDS = 3;

const ADD_REMINDER_TOOL: Anthropic.Tool = {
  name: "add_reminder",
  description: "Legg til en ny påminnelse i Privat-fanen.",
  input_schema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Hva påminnelsen gjelder." },
      dueDate: { type: "string", description: "Forfallsdato, format YYYY-MM-DD. Utelates hvis ingen frist nevnes." },
      recurrence: {
        type: "string",
        enum: ["none", "daily", "weekly", "monthly"],
        description: "Gjentakelse. Bruk 'none' hvis brukeren ikke nevner gjentakelse.",
      },
    },
    required: ["text"],
  },
};

const ADD_CALENDAR_EVENT_TOOL: Anthropic.Tool = {
  name: "add_calendar_event",
  description: "Legg til en ny hendelse i den private kalenderen.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Tittel på hendelsen." },
      date: { type: "string", description: "Dato, format YYYY-MM-DD." },
      startTime: { type: "string", description: "Starttidspunkt, format HH:MM. Valgfritt." },
      endTime: { type: "string", description: "Sluttidspunkt, format HH:MM. Valgfritt." },
      note: { type: "string", description: "Valgfri merknad." },
    },
    required: ["title", "date"],
  },
};

async function runTool(name: string, input: unknown): Promise<unknown> {
  if (name === "add_reminder") {
    return addReminder(input as Parameters<typeof addReminder>[0]);
  }
  if (name === "add_calendar_event") {
    return addPrivatEvent(input as Parameters<typeof addPrivatEvent>[0]);
  }
  throw new Error(`Ukjent verktøy: ${name}`);
}

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
  const today = new Date().toISOString().slice(0, 10);

  const system =
    `Dagens dato er ${today}.\n\n` +
    "Du er Mortens personlige assistent i mitt-dashboard. Svar kort og konkret på norsk.\n" +
    "Nye kontrakter, leieinntekt per bygg, dagens møter og garantioversikt under er EKTE data " +
    "(Fazile, Outlook og Asana — hentet 2026-08-10). Kundefordringer er fortsatt TESTDATA " +
    "(Fazile sitt fakturaverktøy er nedafor akkurat nå) — gjør det klart hvis du bruker de tallene, " +
    "f.eks. 'ifølge testdataene i dashboardet'. Sport, FPL, påminnelser og privat kalender under er " +
    "EKTE og oppdatert live. Du kan legge til nye påminnelser og kalenderhendelser med verktøyene " +
    "add_reminder/add_calendar_event når brukeren ber om det — bekreft alltid kort i klartekst hva du gjorde.\n\n" +
    buildDashboardContext() +
    "\n" +
    (await buildPrivatContext());

  const tools: Anthropic.Tool[] = [ADD_REMINDER_TOOL, ADD_CALENDAR_EVENT_TOOL];
  const convo: Anthropic.MessageParam[] = [...messages];
  let changed = false;

  for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system,
      messages: convo,
      tools,
    });

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return NextResponse.json({ text, changed });
    }

    convo.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      try {
        const result = await runTool(block.name, block.input);
        changed = true;
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      } catch (err) {
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: String(err), is_error: true });
      }
    }
    convo.push({ role: "user", content: toolResults });
  }

  return NextResponse.json({ text: "Fikk ikke fullført forespørselen. Prøv igjen.", changed });
}
