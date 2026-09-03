import Anthropic from "@anthropic-ai/sdk";
import { buildDashboardContext } from "@/lib/widgets";
import { buildPrivatContext } from "@/lib/privatContext";
import { addReminder, deleteReminder, getReminders, toggleReminder } from "@/lib/reminders";
import { addPrivatEvent, deletePrivatEvent, getPrivatEvents } from "@/lib/privatCalendar";
import { addNote, deleteNote, getNotes } from "@/lib/notes";
import { addGrowthEntry, getMilestones, toggleMilestone, updateAlfredProfile } from "@/lib/alfred";
import type { AlfredProfile } from "@/lib/alfred";
import {
  addCustomSportEvent,
  addCustomSportEventsBulk,
  deleteCustomSportEvent,
  getCustomSportEvents,
} from "@/lib/customSports";
import { addShoppingItem } from "@/lib/shoppingList";
import { recordQuickPickUsage } from "@/lib/shoppingQuickPicks";
import { appendChatMessages } from "@/lib/chatHistory";
import { localDateString } from "@/lib/payday";
import { recordUsage } from "@/lib/aiUsage";

// Delt "Claude tolker naturlig språk -> kaller verktøy -> oppdaterer data"-
// motor, brukt av BÅDE den interaktive chat-widgeten (app/api/chat/route.ts,
// full samtalehistorikk) og stemmekommando-endepunktet
// (app/api/voice-command/route.ts, ett enkeltstående utsagn fra en iOS-
// snarvei). Trukket ut hit slik at de 13 verktøyene og system-prompten kun
// vedlikeholdes ett sted.
const MODEL = "claude-haiku-4-5";
const MAX_TOOL_ROUNDS = 6;
// Høyt nok til at bulk-import av et fullt turneringsprogram (100+ hendelser i
// ett add_sport_events_bulk-kall) faktisk får plass i ett svar, ikke bare
// enkeltoppgaver — se resonnement ved responsehåndteringen lenger ned.
const MAX_TOKENS = 8192;

const ADD_REMINDER_TOOL: Anthropic.Tool = {
  name: "add_reminder",
  description: "Legg til en ny påminnelse i Privat-fanen.",
  input_schema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Hva påminnelsen gjelder." },
      dueDate: { type: "string", description: "Forfallsdato, format YYYY-MM-DD. Utelates hvis ingen frist nevnes." },
      dueTime: { type: "string", description: "Klokkeslett, format HH:MM. Valgfritt." },
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
      location: { type: "string", description: "Sted for hendelsen. Valgfritt." },
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

const ADD_NOTE_TOOL: Anthropic.Tool = {
  name: "add_note",
  description:
    "Legg til et fritekstnotat/idé i #Notater-seksjonen i Privat-fanen — for ting brukeren vil huske eller " +
    "lagre til senere som ikke passer naturlig som en påminnelse (med frist) eller kalenderhendelse (med dato).",
  input_schema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Innholdet i notatet/ideen." },
    },
    required: ["text"],
  },
};

const DELETE_NOTE_TOOL: Anthropic.Tool = {
  name: "delete_note",
  description: "Slett et notat fra #Notater-seksjonen. Identifiser det med et utdrag av teksten.",
  input_schema: {
    type: "object",
    properties: {
      textMatch: { type: "string", description: "Del av teksten i notatet som skal slettes." },
    },
    required: ["textMatch"],
  },
};

const TOGGLE_MILESTONE_TOOL: Anthropic.Tool = {
  name: "toggle_milestone",
  description:
    "Huk et sjekklistepunkt for Alfred av eller på (motorisk utvikling, barnehageplan eller fremtidige milepæler). Identifiser med et utdrag av teksten.",
  input_schema: {
    type: "object",
    properties: {
      labelMatch: { type: "string", description: "Del av teksten i sjekklistepunktet." },
    },
    required: ["labelMatch"],
  },
};

const ALFRED_NOTE_FIELDS = [
  "motorikkNotat",
  "helseNotat",
  "matOgSovnNotat",
  "permisjonNotat",
  "barnehageNotat",
  "barnesikringNotat",
] as const;

const UPDATE_ALFRED_NOTE_TOOL: Anthropic.Tool = {
  name: "update_alfred_note",
  description:
    "Oppdater ett av Alfreds notatfelt med det brukeren forteller om ham. Feltets nåværende innhold vises i " +
    "konteksten under ALFRED-seksjonen — skriv den FULLSTENDIGE nye teksten for feltet (slå sammen eksisterende " +
    "innhold med det nye du fikk fortalt, ikke bare det nye alene, med mindre brukeren tydelig ber om å erstatte).",
  input_schema: {
    type: "object",
    properties: {
      field: {
        type: "string",
        enum: [...ALFRED_NOTE_FIELDS],
        description:
          "motorikkNotat=motorisk utvikling, helseNotat=helse, matOgSovnNotat=mat og søvn, " +
          "permisjonNotat=permisjon, barnehageNotat=barnehage, barnesikringNotat=barnesikring.",
      },
      text: { type: "string", description: "Den fullstendige, oppdaterte teksten for feltet." },
    },
    required: ["field", "text"],
  },
};

const ADD_ALFRED_GROWTH_ENTRY_TOOL: Anthropic.Tool = {
  name: "add_alfred_growth_entry",
  description: "Legg til en ny vekstmåling (vekt/lengde) for Alfred.",
  input_schema: {
    type: "object",
    properties: {
      date: { type: "string", description: "Måledato, format YYYY-MM-DD." },
      weightKg: { type: "number", description: "Vekt i kg." },
      lengthCm: { type: "number", description: "Lengde i cm. Valgfritt." },
      approxDate: { type: "boolean", description: "Sett til true hvis datoen er anslått, ikke eksakt. Valgfritt." },
    },
    required: ["date", "weightKg"],
  },
};

const SPORT_EVENT_PROPERTIES = {
  name: { type: "string" as const, description: "Kampen/hendelsen, f.eks. 'Liverpool – Manchester City'." },
  date: { type: "string" as const, description: "Dato, format YYYY-MM-DD." },
  time: { type: "string" as const, description: "Klokkeslett, format HH:MM. Valgfritt." },
  competition: { type: "string" as const, description: "Turnering/liga. Valgfritt." },
  venue: { type: "string" as const, description: "Sted/arena. Valgfritt." },
  highlight: {
    type: "boolean" as const,
    description:
      "Sett til true kun for hendelser som skal fremheves og dukke opp automatisk på 'I dag' den dagen de " +
      "skjer. Standard false — false-hendelser vises fortsatt i det fulle programmet i Sport-boksen, bare " +
      "ikke på 'I dag'. Bruk true sparsomt (brukerens favoritter/finaler), ikke for et helt turneringsprogram.",
  },
};

const ADD_SPORT_EVENT_TOOL: Anthropic.Tool = {
  name: "add_sport_event",
  description:
    "Legg til ÉN kamp/sportshendelse brukeren selv vil følge, som dukker opp i Sport-boksen sammen med de " +
    "faste kildene (Eliteserien, Premier League, darts osv.). Bruk add_sport_events_bulk i stedet hvis " +
    "brukeren limer inn flere enn 2-3 hendelser på én gang (f.eks. et helt turneringsprogram).",
  input_schema: {
    type: "object",
    properties: SPORT_EVENT_PROPERTIES,
    required: ["name", "date"],
  },
};

const ADD_SPORT_EVENTS_BULK_TOOL: Anthropic.Tool = {
  name: "add_sport_events_bulk",
  description:
    "Legg til MANGE kamper/sportshendelser samtidig i ett kall — bruk denne når brukeren limer inn et helt " +
    "program (f.eks. alle kampene i et VM eller et fullt OL-oppsett) i stedet for å kalle add_sport_event " +
    "gjentatte ganger. Hvis listen er svært lang (over ca. 150 hendelser), del den opp i flere kall til " +
    "dette verktøyet i samme svar/runde i stedet for å prøve alt i ett kall.",
  input_schema: {
    type: "object",
    properties: {
      events: {
        type: "array",
        description: "Listen over kamper/hendelser som skal legges til.",
        items: { type: "object", properties: SPORT_EVENT_PROPERTIES, required: ["name", "date"] },
      },
    },
    required: ["events"],
  },
};

const DELETE_SPORT_EVENT_TOOL: Anthropic.Tool = {
  name: "delete_sport_event",
  description: "Slett en egendefinert sportshendelse brukeren har lagt til. Identifiser med et utdrag av navnet.",
  input_schema: {
    type: "object",
    properties: {
      nameMatch: { type: "string", description: "Del av navnet på kampen/hendelsen som skal slettes." },
    },
    required: ["nameMatch"],
  },
};

const ADD_SHOPPING_ITEM_TOOL: Anthropic.Tool = {
  name: "add_shopping_item",
  description: "Legg til en ny vare i Handleliste-seksjonen i Privat-fanen.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Navnet på varen, f.eks. 'Melk' eller 'Bleier str. 4'." },
      section: {
        type: "string",
        enum: [
          "frukt-gront",
          "frysevarer",
          "palegg",
          "meieriprodukter",
          "drikke",
          "snacks",
          "torrvarer",
          "baby",
          "elektro",
          "snop",
          "annet",
        ],
        description:
          "Butikkseksjon — velg den som passer best: frukt-gront=Frukt & grønt, frysevarer=Frysevarer, " +
          "palegg=Pålegg, meieriprodukter=Meieriprodukter, drikke=Drikke, snacks=Snacks, torrvarer=Tørrvarer, " +
          "baby=Baby, elektro=Elektro, snop=Snop, annet=Annet (brukes hvis ingen andre passer).",
      },
      quantity: { type: "string", description: "Mengde/antall, f.eks. '2 stk' eller '1 liter'. Valgfritt." },
    },
    required: ["name", "section"],
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
  if (name === "add_note") {
    return addNote(input as Parameters<typeof addNote>[0]);
  }
  if (name === "delete_note") {
    const { textMatch } = input as { textMatch: string };
    const note = findOneMatch(await getNotes(), (n) => n.text, textMatch, "notater");
    await deleteNote(note.id);
    return { ok: true, deleted: note.text };
  }
  if (name === "toggle_milestone") {
    const { labelMatch } = input as { labelMatch: string };
    const milestone = findOneMatch(await getMilestones(), (m) => m.label, labelMatch, "sjekklistepunkter");
    return toggleMilestone(milestone.id);
  }
  if (name === "update_alfred_note") {
    const { field, text } = input as { field: (typeof ALFRED_NOTE_FIELDS)[number]; text: string };
    if (!ALFRED_NOTE_FIELDS.includes(field)) throw new Error(`Ukjent Alfred-notatfelt: ${field}`);
    return updateAlfredProfile({ [field]: text } as Partial<AlfredProfile>);
  }
  if (name === "add_alfred_growth_entry") {
    return addGrowthEntry(input as Parameters<typeof addGrowthEntry>[0]);
  }
  if (name === "add_sport_event") {
    return addCustomSportEvent(input as Parameters<typeof addCustomSportEvent>[0]);
  }
  if (name === "add_sport_events_bulk") {
    const { events } = input as { events: Parameters<typeof addCustomSportEvent>[0][] };
    const created = await addCustomSportEventsBulk(events);
    return { ok: true, count: created.length };
  }
  if (name === "add_shopping_item") {
    const { name: itemName, section, quantity } = input as {
      name: string;
      section: Parameters<typeof addShoppingItem>[0]["section"];
      quantity?: string;
    };
    const item = await addShoppingItem({ name: itemName, section, quantity });
    // Samme oppførsel som når en vare legges til fra UI (skrevet eller plukket
    // fra hurtigvalg) — holder hurtigvalg-katalogen i sync uansett innfallsvei.
    await recordQuickPickUsage(itemName, section);
    return item;
  }
  if (name === "delete_sport_event") {
    const { nameMatch } = input as { nameMatch: string };
    const event = findOneMatch(await getCustomSportEvents(), (e) => e.name, nameMatch, "egendefinerte sportshendelser");
    await deleteCustomSportEvent(event.id);
    return { ok: true, deleted: event.name };
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

export interface ChatTurnResult {
  text: string;
  changed: boolean;
}

export async function runChatTurn(
  messages: Anthropic.MessageParam[],
  opts?: { voiceMode?: boolean },
): Promise<ChatTurnResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const today = localDateString();

  const system =
    `Dagens dato er ${today}.\n\n` +
    "Du er Mortens personlige assistent i mitt-dashboard. Svar kort og konkret på norsk.\n" +
    (opts?.voiceMode
      ? "Dette svaret leses høyt av en telefon-snarvei — svar EKSTRA kort, maks én kort setning.\n"
      : "") +
    "Nye kontrakter, leieinntekt per bygg, dagens møter, garantioversikt og kundefordringer under er " +
    `EKTE data (Fazile, Outlook, Asana og Visma Business NXT — hentet ${today}). Sport, FPL, ` +
    "påminnelser og privat kalender under er " +
    "EKTE og oppdatert live, det samme er lån (Økonomi) og Alfred-data under. Du kan legge til, " +
    "huke av/på og slette påminnelser og kalenderhendelser, legge til/slette notater i #Notater-seksjonen " +
    "(fritekst-idéer/ting å huske som ikke har en naturlig frist eller dato — bruk add_note for disse i " +
    "stedet for add_reminder/add_calendar_event når brukeren ikke nevner noen dato), huke av/på Alfreds " +
    "sjekklistepunkter, oppdatere Alfreds notatfelt (update_alfred_note — se gjeldende innhold i ALFRED-" +
    "seksjonen under og skriv en sammenslått, fullstendig tekst, ikke bare det nye alene) og legge til " +
    "vekstmålinger for Alfred (add_alfred_growth_entry), og " +
    "legge til/slette egendefinerte sportshendelser (dukker opp i Sport-boksen sammen med de faste " +
    "kildene) — bruk add_sport_events_bulk (ikke gjentatte add_sport_event-kall) når brukeren limer inn " +
    "et helt program med mange kamper på én gang, og sett highlight=true kun på et fåtall hendelser " +
    "brukeren faktisk peker ut som viktige (ellers oversvømmer et fullt program 'I dag' med alt som skjer " +
    "en gitt dag), og legge til nye varer i Handleliste-seksjonen (add_shopping_item — velg butikkseksjon " +
    "ut fra hva slags vare det er). Bruk verktøyene når brukeren ber om det — bekreft alltid kort i klartekst hva du gjorde " +
    "(for bulk: hvor mange som ble lagt til). Hvis et verktøy feiler fordi flere eller ingen elementer " +
    "matcher, forklar det kort til brukeren i stedet for å gjette. VIKTIG: Bekreft ALDRI at noe er lagt " +
    "til/oppdatert/slettet med mindre du faktisk har kalt det tilhørende verktøyet i denne runden — aldri " +
    "late som noe ble gjort. Er forespørselen uklar, ufullstendig eller ser avkuttet ut (typisk fra en " +
    "diktert talekommando, f.eks. et ord uten sammenheng eller en setning som stopper brått), IKKE gjett " +
    "hva som ble ment — si fra at du ikke fikk med deg hele forespørselen og be om at den gjentas i stedet " +
    "for å kalle et verktøy med et gjettet innhold.\n\n" +
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
    ADD_NOTE_TOOL,
    DELETE_NOTE_TOOL,
    TOGGLE_MILESTONE_TOOL,
    UPDATE_ALFRED_NOTE_TOOL,
    ADD_ALFRED_GROWTH_ENTRY_TOOL,
    ADD_SPORT_EVENT_TOOL,
    ADD_SPORT_EVENTS_BULK_TOOL,
    DELETE_SPORT_EVENT_TOOL,
    { ...ADD_SHOPPING_ITEM_TOOL, cache_control: { type: "ephemeral" } },
  ];
  const convo: Anthropic.MessageParam[] = [...messages];
  let changed = false;

  for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemBlocks,
      messages: convo,
      tools,
    });
    await recordUsage(response.usage);

    // Kjør eventuelle FULLFØRTE tool_use-blokker uansett stop_reason: hvis svaret ble
    // kappet av MAX_TOKENS midt i en stor bulk-import, vil Anthropic likevel returnere
    // de tool_use-blokkene som rakk å bli ferdige før avkuttingen — å kun sjekke
    // `stop_reason === "tool_use"` ville droppet alt arbeidet i stedet for det som
    // faktisk gikk gjennom.
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) {
      let text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      if (!text && response.stop_reason === "max_tokens") {
        text = "Svaret ble for langt og ble kappet av. Prøv å be om en mindre liste om gangen.";
      }
      await persistExchange(messages, text);
      return { text, changed };
    }

    convo.push({ role: "assistant", content: response.content });

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

    if (response.stop_reason === "max_tokens") {
      convo.push({
        role: "user",
        content:
          "(Systemmerknad: forrige svar ble kappet av fordi det ble for langt. De hendelsene som rakk å " +
          "bli fullført er lagt til — fortsett med resten av listen hvis noe gjenstår, eller oppsummer " +
          "kort hva som ble gjort.)",
      });
    }
  }

  const fallback = "Fikk ikke fullført forespørselen. Prøv igjen.";
  await persistExchange(messages, fallback);
  return { text: fallback, changed };
}
