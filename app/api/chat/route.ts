import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { buildDashboardContext } from "@/lib/widgets";
import { buildPrivatContext } from "@/lib/privatContext";
import { addReminder, deleteReminder, getReminders, toggleReminder } from "@/lib/reminders";
import { addPrivatEvent, deletePrivatEvent, getPrivatEvents } from "@/lib/privatCalendar";
import { getMilestones, toggleMilestone } from "@/lib/alfred";
import { appendChatMessages } from "@/lib/chatHistory";

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

const TOGGLE_REMINDER_TOOL: Anthropic.Tool = {
  name: "toggle_reminder",
  description: "Huk en påminnelse av eller på (ferdig/ikke ferdig). Identifiser den med et utdrag av teksten.",
  input_schema: {
    type: "object",
    properties: {
      textMatch: { type: "string", description: "Del av teksten i påminnelsen som skal hukes av/på." },
    },
    required: ["textMatch"],
  },
};

const DELETE_REMINDER_TOOL: Anthropic.Tool = {
  name: "delete_reminder",
  description: "Slett en påminnelse. Identifiser den med et utdrag av teksten.",
  input_schema: {
    type: "object",
    properties: {
      textMatch: { type: "string", description: "Del av teksten i påminnelsen som skal slettes." },
    },
    required: ["textMatch"],
  },
};

const DELETE_CALENDAR_EVENT_TOOL: Anthropic.Tool = {
  name: "delete_calendar_event",
  description: "Slett en hendelse i den private kalenderen. Identifiser den med et utdrag av tittelen.",
  input_schema: {
    type: "object",
    properties: {
      titleMatch: { type: "string", description: "Del av tittelen på hendelsen som skal slettes." },
    },
    required: ["titleMatch"],
  },
};

const TOGGLE_MILESTONE_TOOL: Anthropic.Tool = {
  name: "toggle_milestone",
  description:
    "Huk et sjekklistepunkt for Alfred av eller på (motorisk utvikling, barnehageplan eller kommende fokus). Identifiser med et utdrag av teksten.",
  input_schema: {
    type: "object",
    properties: {
      labelMatch: { type: "string", description: "Del av teksten i sjekklistepunktet." },
    },
    required: ["labelMatch"],
  },
};

function findOneMatch<T>(items: T[], getText: (item: T) => string, query: string, kind: string): T {
  const q = query.toLowerCase();
  const matches = items.filter((item) => getText(item).toLowerCase().includes(q));
  if (matches.length === 0) throw new Error(`Fant ingen ${kind} som matcher "${query}".`);
  if (matches.length > 1) {
    throw new Error(
      `Flere ${kind} matcher "${query}": ${matches.map(getText).join(", ")}. Vær mer spesifikk.`,
    );
  }
  return matches[0];
}

async function runTool(name: string, input: unknown): Promise<unknown> {
  if (name === "add_reminder") {
    return addReminder(input as Parameters<typeof addReminder>[0]);
  }
  if (name === "add_calendar_event") {
    return addPrivatEvent(input as Parameters<typeof addPrivatEvent>[0]);
  }
  if (name === "toggle_reminder") {
    const { textMatch } = input as { textMatch: string };
    const reminder = findOneMatch(await getReminders(), (r) => r.text, textMatch, "påminnelser");
    return toggleReminder(reminder.id);
  }
  if (name === "delete_reminder") {
    const { textMatch } = input as { textMatch: string };
    const reminder = findOneMatch(await getReminders(), (r) => r.text, textMatch, "påminnelser");
    await deleteReminder(reminder.id);
    return { ok: true, deleted: reminder.text };
  }
  if (name === "delete_calendar_event") {
    const { titleMatch } = input as { titleMatch: string };
    const event = findOneMatch(await getPrivatEvents(), (e) => e.title, titleMatch, "hendelser");
    await deletePrivatEvent(event.id);
    return { ok: true, deleted: event.title };
  }
  if (name === "toggle_milestone") {
    const { labelMatch } = input as { labelMatch: string };
    const milestone = findOneMatch(await getMilestones(), (m) => m.label, labelMatch, "sjekklistepunkter");
    return toggleMilestone(milestone.id);
  }
  throw new Error(`Ukjent verktøy: ${name}`);
}

function lastUserText(messages: Anthropic.MessageParam[]): string {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return "";
  return typeof last.content === "string" ? last.content : "";
}

async function persistExchange(messages: Anthropic.MessageParam[], assistantText: string): Promise<void> {
  const userText = lastUserText(messages);
  if (!userText) return;
  await appendChatMessages([
    { role: "user", content: userText },
    { role: "assistant", content: assistantText },
  ]);
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
    "EKTE og oppdatert live, det samme er lån (Økonomi) og Alfred-data under. Du kan legge til, " +
    "huke av/på og slette påminnelser og kalenderhendelser, og huke av/på Alfreds sjekklistepunkter, " +
    "med verktøyene når brukeren ber om det — bekreft alltid kort i klartekst hva du gjorde. Hvis et " +
    "verktøy feiler fordi flere eller ingen elementer matcher, forklar det kort til brukeren i stedet " +
    "for å gjette.\n\n" +
    buildDashboardContext() +
    "\n" +
    (await buildPrivatContext());

  // Ephemeral prompt-caching: systemprompten (kontrakter/garantier/lån/Alfred osv.) er lang og
  // identisk for hver oppfølgingsmelding i samme samtale innenfor cache-vinduet (~5 min) — caching
  // reduserer tokenkostnad/latency på Anthropics side. Ingen risiko for utdatert data: endres
  // systemprompt-teksten (f.eks. etter en verktøy-endring), er det bare et cache-miss, ikke en feil.
  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: system, cache_control: { type: "ephemeral" } },
  ];

  // cache_control på siste verktøy: verktøylisten er statisk på tvers av ALLE forespørsler
  // (ikke bare innenfor én samtale), så denne prefiksen kan caches enda bredere enn systemprompten.
  const tools: Anthropic.Tool[] = [
    ADD_REMINDER_TOOL,
    ADD_CALENDAR_EVENT_TOOL,
    TOGGLE_REMINDER_TOOL,
    DELETE_REMINDER_TOOL,
    DELETE_CALENDAR_EVENT_TOOL,
    { ...TOGGLE_MILESTONE_TOOL, cache_control: { type: "ephemeral" } },
  ];
  const convo: Anthropic.MessageParam[] = [...messages];
  let changed = false;

  for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: systemBlocks,
      messages: convo,
      tools,
    });

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      await persistExchange(messages, text);
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

  const fallback = "Fikk ikke fullført forespørselen. Prøv igjen.";
  await persistExchange(messages, fallback);
  return NextResponse.json({ text: fallback, changed });
}
