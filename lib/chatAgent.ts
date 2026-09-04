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
import { getDiaryEntries, upsertDiaryEntry, type DiaryEntryInput } from "@/lib/diary";
import { addChecklistItem, addProject, getProjects, setChecklistItemNote, toggleChecklistItem } from "@/lib/projects";
import { getLoans, updateLoan } from "@/lib/loans";
import { getSavings, updateSavings } from "@/lib/savings";
import { addFplNote, deleteFplNote, getFplNotes } from "@/lib/fplNotes";
import { addComment } from "@/lib/comments";
import { getLifeEvents } from "@/lib/events";
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

const DIARY_CATEGORIES = ["morgen", "ettermiddag", "kveld", "personer", "steder", "notat"] as const;

const ADD_DIARY_ITEM_TOOL: Anthropic.Tool = {
  name: "add_diary_item",
  description:
    "Legg til ETT punkt i Dagbok-oppføringen for en dag (standard: i dag) — for ting brukeren forteller om " +
    "dagen sin (hva som skjedde på morgenen/ettermiddagen/kvelden, hvem de var sammen med, hvor de var), typisk " +
    "svar på spørsmål du selv har stilt eller ting de bare forteller løpende. Legger TIL i eksisterende " +
    "oppføring for dagen — overskriver ikke det som allerede er der. Bruk denne gjentatte ganger for flere " +
    "punkter i samme svar (ett kall per punkt), ikke prøv å slå sammen flere ting i én text-verdi.",
  input_schema: {
    type: "object",
    properties: {
      date: { type: "string", description: "Dato, format YYYY-MM-DD. Utelates for i dag." },
      category: {
        type: "string",
        enum: [...DIARY_CATEGORIES],
        description:
          "morgen/ettermiddag/kveld = hva som skjedde da, personer = hvem de var sammen med, " +
          "steder = hvor de var, notat = fritekst som ikke passer noen av de andre kategoriene.",
      },
      text: { type: "string", description: "Selve punktet, kort (f.eks. 'Tur i parken', 'Bestemor', 'Kaffe med Ida')." },
    },
    required: ["category", "text"],
  },
};

// Kommentarer er ÉN samlet mekanisme for løpende notater på en påminnelse,
// kalenderhendelse eller hendelse — tidsstemplet, flere per element, og
// vist bak snakkeboble-ikonet på raden. Kalenderhendelsens gamle `note`-felt
// er bevisst IKKE lenger noe assistenten skriver til (og er fjernet fra
// redigeringsskjemaet), slik at det bare finnes én måte å notere på.
// Eksplisitt "gi brukeren ordet"-signal. Erstatter den tidligere
// heuristikken (svaret inneholder et spørsmålstegn), som slo inn på helt
// vanlige høflighetsfraser — sa brukeren "beklager, trykket feil" og
// assistenten svarte "ingen problem, noe annet?", åpnet mikrofonen seg på
// nytt uten grunn. Nå må modellen BE om ordet bevisst, og alt annet
// avslutter samtalen.
const ASK_USER_TOOL: Anthropic.Tool = {
  name: "ask_user",
  description:
    "Bruk KUN når du faktisk trenger et svar fra brukeren for å komme videre, og du vil at mikrofonen " +
    "skal åpne seg igjen med det samme. Spørsmålet du oppgir er det som leses høyt. Typiske gyldige " +
    "tilfeller: du mangler en opplysning for å utføre noe (dato, hvilket prosjekt, hvilken av flere " +
    "treff), du gjennomfører en spørsmålsrunde brukeren selv har bedt om (f.eks. dagbok-gjennomgang), " +
    "eller du må avklare om noe også skal i kalenderen. IKKE bruk den til høflighetsfraser som 'Noe " +
    "mer?', 'Trenger du noe annet?' eller 'Var det alt?' — da skal du bare svare ferdig uten å kalle " +
    "dette verktøyet, slik at samtalen avsluttes naturlig.",
  input_schema: {
    type: "object",
    properties: {
      question: { type: "string", description: "Ett kort spørsmål, det som leses høyt for brukeren." },
    },
    required: ["question"],
  },
};

const ADD_COMMENT_TOOL: Anthropic.Tool = {
  name: "add_comment",
  description:
    "Legg til en tidsstemplet kommentar på en påminnelse, kalenderhendelse eller hendelse — for løpende " +
    "notater underveis ('ringte presten', 'bekreftet tid'). Flere kommentarer kan ligge på samme element, " +
    "og en ny sletter ikke de gamle. Bruk denne til alt som er en merknad om noe som ALLEREDE finnes, i " +
    "stedet for å opprette et nytt element eller overskrive noe.",
  input_schema: {
    type: "object",
    properties: {
      targetType: {
        type: "string",
        enum: ["calendar-event", "reminder", "life-event"],
        description: "calendar-event = privat kalenderhendelse, reminder = påminnelse, life-event = hendelse.",
      },
      titleMatch: {
        type: "string",
        description: "Del av tittelen/teksten på elementet kommentaren skal legges på.",
      },
      text: { type: "string", description: "Selve kommentaren." },
    },
    required: ["targetType", "titleMatch", "text"],
  },
};

const ADD_PROJECT_ITEM_TOOL: Anthropic.Tool = {
  name: "add_project_item",
  description:
    "Legg til et nytt UNDERPUNKT i et prosjekt (Prosjekter-seksjonen) — f.eks. 'Time med presten', " +
    "'Bestille kake'. Identifiser prosjektet med navnet (delvis treff holder, f.eks. 'dåp'). Kan ta med et " +
    "notat på punktet med det samme. VIKTIG: inneholder punktet et tidspunkt eller en dato (møte, avtale, " +
    "frist), SPØR brukeren om det også skal legges inn i kalenderen — ikke legg det inn i kalenderen på " +
    "eget initiativ, og ikke la det være usagt.",
  input_schema: {
    type: "object",
    properties: {
      projectMatch: { type: "string", description: "Del av prosjektnavnet, f.eks. 'dåp'." },
      text: { type: "string", description: "Selve punktet, kort." },
      note: { type: "string", description: "Valgfritt notat om punktet (detaljer, tidspunkt, avklaringer)." },
    },
    required: ["projectMatch", "text"],
  },
};

const NOTE_ON_PROJECT_ITEM_TOOL: Anthropic.Tool = {
  name: "note_on_project_item",
  description:
    "Legg et notat til et EKSISTERENDE underpunkt i et prosjekt. Legger til en ny linje i notatet — " +
    "sletter ikke det som står der fra før. Bruk denne når brukeren utdyper eller oppdaterer status på et " +
    "punkt som allerede finnes, i stedet for å opprette et nytt punkt.",
  input_schema: {
    type: "object",
    properties: {
      projectMatch: { type: "string", description: "Del av prosjektnavnet." },
      itemMatch: { type: "string", description: "Del av teksten i underpunktet." },
      note: { type: "string", description: "Notatet som skal legges til." },
    },
    required: ["projectMatch", "itemMatch", "note"],
  },
};

const TOGGLE_PROJECT_ITEM_TOOL: Anthropic.Tool = {
  name: "toggle_project_item",
  description: "Huk et underpunkt i et prosjekt av eller på (ferdig/ikke ferdig).",
  input_schema: {
    type: "object",
    properties: {
      projectMatch: { type: "string", description: "Del av prosjektnavnet." },
      itemMatch: { type: "string", description: "Del av teksten i underpunktet." },
    },
    required: ["projectMatch", "itemMatch"],
  },
};

const ADD_PROJECT_TOOL: Anthropic.Tool = {
  name: "add_project",
  description: "Opprett et helt nytt prosjekt i Prosjekter-seksjonen. Bruk kun når prosjektet ikke finnes fra før.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Navn på prosjektet." },
      targetDate: { type: "string", description: "Måldato, format YYYY-MM-DD. Valgfritt." },
    },
    required: ["name"],
  },
};

const UPDATE_LOAN_TOOL: Anthropic.Tool = {
  name: "update_loan",
  description:
    "Oppdater et lån i Økonomi-seksjonen — typisk gjenstående beløp etter en nedbetaling, eller ny rente. " +
    "Identifiser lånet med navn eller bank (delvis treff holder). Endrer kun feltene du oppgir.",
  input_schema: {
    type: "object",
    properties: {
      loanMatch: { type: "string", description: "Del av lånets navn eller bank." },
      remainingAmount: { type: "number", description: "Nytt gjenstående beløp i kroner. Valgfritt." },
      nominalRate: { type: "number", description: "Ny nominell rente i prosent. Valgfritt." },
      effectiveRate: { type: "number", description: "Ny effektiv rente i prosent. Valgfritt." },
    },
    required: ["loanMatch"],
  },
};

const UPDATE_SAVINGS_TOOL: Anthropic.Tool = {
  name: "update_savings",
  description:
    "Oppdater en sparekonto i Økonomi-seksjonen — typisk ny saldo. Identifiser kontoen med navn eller " +
    "institusjon (delvis treff holder).",
  input_schema: {
    type: "object",
    properties: {
      accountMatch: { type: "string", description: "Del av kontoens navn eller institusjon." },
      balance: { type: "number", description: "Ny saldo i kroner. Valgfritt." },
      note: { type: "string", description: "Nytt notat på kontoen. Valgfritt." },
    },
    required: ["accountMatch"],
  },
};

const ADD_FPL_NOTE_TOOL: Anthropic.Tool = {
  name: "add_fpl_note",
  description:
    "Legg til et notat til Boko Haramsdale sitt årsmøte (FPL-seksjonen) — saker som dukker opp gjennom " +
    "sesongen og skal diskuteres senere.",
  input_schema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Innholdet i notatet." },
    },
    required: ["text"],
  },
};

const DELETE_FPL_NOTE_TOOL: Anthropic.Tool = {
  name: "delete_fpl_note",
  description: "Slett et FPL-årsmøtenotat. Identifiser det med et utdrag av teksten.",
  input_schema: {
    type: "object",
    properties: {
      textMatch: { type: "string", description: "Del av teksten i notatet som skal slettes." },
    },
    required: ["textMatch"],
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
  if (name === "add_comment") {
    const { targetType, titleMatch, text } = input as {
      targetType: "calendar-event" | "reminder" | "life-event";
      titleMatch: string;
      text: string;
    };
    if (targetType === "calendar-event") {
      const event = findOneMatch(await getPrivatEvents(), (e) => e.title, titleMatch, "kalenderhendelser");
      return addComment("calendar-event", event.id, text);
    }
    if (targetType === "reminder") {
      const reminder = findOneMatch(await getReminders(), (r) => r.text, titleMatch, "påminnelser");
      return addComment("reminder", reminder.id, text);
    }
    const lifeEvent = findOneMatch(await getLifeEvents(), (e) => e.title, titleMatch, "hendelser");
    return addComment("life-event", lifeEvent.id, text);
  }
  if (name === "add_project") {
    const { name: projectName, targetDate } = input as { name: string; targetDate?: string };
    return addProject(projectName, targetDate);
  }
  if (name === "add_project_item") {
    const { projectMatch, text, note } = input as { projectMatch: string; text: string; note?: string };
    const project = findOneMatch(await getProjects(), (p) => p.name, projectMatch, "prosjekter");
    return addChecklistItem(project.id, text, note);
  }
  if (name === "note_on_project_item") {
    const { projectMatch, itemMatch, note } = input as { projectMatch: string; itemMatch: string; note: string };
    const project = findOneMatch(await getProjects(), (p) => p.name, projectMatch, "prosjekter");
    const item = findOneMatch(project.checklist ?? [], (i) => i.text, itemMatch, `underpunkter i «${project.name}»`);
    return setChecklistItemNote(project.id, item.id, note, true);
  }
  if (name === "toggle_project_item") {
    const { projectMatch, itemMatch } = input as { projectMatch: string; itemMatch: string };
    const project = findOneMatch(await getProjects(), (p) => p.name, projectMatch, "prosjekter");
    const item = findOneMatch(project.checklist ?? [], (i) => i.text, itemMatch, `underpunkter i «${project.name}»`);
    return toggleChecklistItem(project.id, item.id);
  }
  if (name === "update_loan") {
    const { loanMatch, ...updates } = input as {
      loanMatch: string;
      remainingAmount?: number;
      nominalRate?: number;
      effectiveRate?: number;
    };
    const loan = findOneMatch(await getLoans(), (l) => `${l.name} ${l.lender}`, loanMatch, "lån");
    return updateLoan(loan.id, updates);
  }
  if (name === "update_savings") {
    const { accountMatch, ...updates } = input as { accountMatch: string; balance?: number; note?: string };
    const account = findOneMatch(await getSavings(), (s) => `${s.name} ${s.institution}`, accountMatch, "sparekontoer");
    return updateSavings(account.id, updates);
  }
  if (name === "add_fpl_note") {
    const { text } = input as { text: string };
    return addFplNote(text);
  }
  if (name === "delete_fpl_note") {
    const { textMatch } = input as { textMatch: string };
    const note = findOneMatch(await getFplNotes(), (n) => n.text, textMatch, "FPL-notater");
    await deleteFplNote(note.id);
    return { ok: true, deleted: note.text };
  }
  if (name === "add_diary_item") {
    const { date, category, text } = input as { date?: string; category: (typeof DIARY_CATEGORIES)[number]; text: string };
    const targetDate = date || localDateString();
    const entries = await getDiaryEntries();
    const current = entries.find((e) => e.date === targetDate);
    const base: DiaryEntryInput = current
      ? { morning: current.morning, afternoon: current.afternoon, evening: current.evening, people: current.people, places: current.places, notes: current.notes }
      : { morning: [], afternoon: [], evening: [], people: [], places: [] };
    if (category === "notat") {
      base.notes = base.notes ? `${base.notes}\n${text}` : text;
    } else {
      const field = { morgen: "morning", ettermiddag: "afternoon", kveld: "evening", personer: "people", steder: "places" }[category] as
        | "morning"
        | "afternoon"
        | "evening"
        | "people"
        | "places";
      if (!base[field].some((l) => l.toLowerCase() === text.toLowerCase())) {
        base[field] = [...base[field], text];
      }
    }
    return upsertDiaryEntry(targetDate, base);
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
  // true KUN når modellen bevisst kalte ask_user-verktøyet — signalet
  // iOS-snarveien bruker til å åpne mikrofonen på nytt i stedet for å
  // avslutte. Bevisst ikke en heuristikk på spørsmålstegn lenger: det slo
  // inn på høflighetsfraser ("noe mer?") og åpnet mikrofonen uten grunn.
  awaitingReply: boolean;
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
      ? "Dette svaret leses høyt av en telefon-snarvei. Du er en muntlig samtalepartner, ikke et " +
        "engangs-svar. Regler for talemodus:\n" +
        "- Svar EKSTRA kort, maks én til to korte setninger.\n" +
        "- Trenger du et svar fra brukeren for å komme videre: kall ask_user med ETT kort " +
        "spørsmål. Da åpnes mikrofonen automatisk, og samtalen fortsetter i neste runde.\n" +
        "- Trenger du IKKE noe mer: svar bare ferdig UTEN å kalle ask_user, så avsluttes " +
        "samtalen. Dette gjelder også når brukeren bare bekrefter, takker, eller sier at de " +
        "trykket feil — da svarer du kort og avslutter, du skal ALDRI kalle ask_user for å være " +
        "høflig ('noe mer?').\n" +
        "- Har brukeren bedt om en gjennomgang (f.eks. av dagen sin): lagre det du har fått med " +
        "verktøyene og kall ask_user med neste enkeltspørsmål i samme trekk.\n"
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
    "ut fra hva slags vare det er), og legge punkter til dagens (eller en oppgitt dags) Dagbok-oppføring " +
    "(add_diary_item — ett kall per punkt, legger TIL uten å overskrive resten av dagen).\n\n" +
    "PROSJEKTER: du kan opprette prosjekter (add_project), legge til underpunkter (add_project_item), " +
    "notere ting på et eksisterende underpunkt (note_on_project_item — legger til en linje, sletter ikke " +
    "det som står der) og huke punkter av/på (toggle_project_item). Du har full oversikt over prosjektene " +
    "og alle underpunktene med notater i PROSJEKTER-seksjonen under, så bruk den til å svare på spørsmål " +
    "om status. VIKTIG REGEL: legger du inn et punkt som inneholder et tidspunkt eller en dato (møte, " +
    "avtale, frist — f.eks. 'time med presten onsdag 16. september'), skal du ALLTID spørre brukeren " +
    "(bruk ask_user) om det også skal legges inn i kalenderen. Ikke legg det i kalenderen på eget " +
    "initiativ, og ikke la spørsmålet være usagt. Svarer brukeren ja, bruk add_calendar_event.\n\n" +
    "KOMMENTARER: løpende, tidsstemplede merknader på en påminnelse, kalenderhendelse eller hendelse " +
    "legges til med add_comment (flere per element, en ny sletter ikke de gamle). Du ser eksisterende " +
    "kommentarer i listene under, markert med 'kommentarer:'. Bruk add_comment til alt som er en merknad " +
    "OM noe som allerede finnes, i stedet for å opprette et nytt element. Kalenderhendelser har ikke noe " +
    "eget notat-felt du skal skrive til — kommentarer er den ene mekanismen.\n\n" +
    "ØKONOMI: du kan oppdatere lån (update_loan — gjenstående beløp, rente) og sparekontoer " +
    "(update_savings — saldo, notat). Tallene du ser under er de gjeldende.\n\n" +
    "FPL: du kan legge til og slette notater til Boko Haramsdale sitt årsmøte (add_fpl_note/" +
    "delete_fpl_note).\n\n" +
    "TRENING: du kan LESE treningsloggen (siste sett per øvelse står under TRENING-seksjonen) og svare på " +
    "spørsmål som 'hva tok jeg i benkpress sist?'. Du kan IKKE legge inn økter, sett eller øvelser — " +
    "har du ikke tallet i konteksten, si at du ikke finner det, og be brukeren logge det i " +
    "Trening-seksjonen selv i stedet for å gjette.\n\n" +
    "Du kan aktivt " +
    "STILLE brukeren oppfølgingsspørsmål om dagen sin (f.eks. 'Hva gjorde du i dag?', 'Hvem var du sammen " +
    "med?') og legge svarene rett i dagboken med add_diary_item etter hvert som de kommer — samtalen " +
    "fortsetter på tvers av flere meldinger/talekommandoer (du har full historikk under), så det er helt " +
    "greit å stille ETT spørsmål om gangen og vente på svar i stedet for å be om alt på én gang. " +
    "Bruk verktøyene når brukeren ber om det — bekreft alltid kort i klartekst hva du gjorde " +
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
    ASK_USER_TOOL,
    ADD_COMMENT_TOOL,
    ADD_DIARY_ITEM_TOOL,
    ADD_PROJECT_TOOL,
    ADD_PROJECT_ITEM_TOOL,
    NOTE_ON_PROJECT_ITEM_TOOL,
    TOGGLE_PROJECT_ITEM_TOOL,
    UPDATE_LOAN_TOOL,
    UPDATE_SAVINGS_TOOL,
    ADD_FPL_NOTE_TOOL,
    DELETE_FPL_NOTE_TOOL,
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
    const responseText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    if (toolUseBlocks.length === 0) {
      let text = responseText;
      if (!text && response.stop_reason === "max_tokens") {
        text = "Svaret ble for langt og ble kappet av. Prøv å be om en mindre liste om gangen.";
      }
      await persistExchange(messages, text);
      return { text, changed, awaitingReply: false };
    }

    convo.push({ role: "assistant", content: response.content });

    // ask_user er terminalt: modellen har bedt om ordet, så vi svarer med
    // spørsmålet i stedet for å kjøre nok en runde. Eventuelle ANDRE verktøy
    // i samme svar kjøres først, slik at "lagre dette OG spør om det neste"
    // fungerer i ett trekk.
    const askBlock = toolUseBlocks.find((b) => b.name === "ask_user");

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      if (block.name === "ask_user") continue;
      try {
        const result = await runTool(block.name, block.input);
        changed = true;
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      } catch (err) {
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: String(err), is_error: true });
      }
    }

    if (askBlock) {
      const { question } = askBlock.input as { question?: string };
      const text = [responseText, question].filter((s) => s && s.trim()).join(" ").trim();
      await persistExchange(messages, text);
      return { text, changed, awaitingReply: true };
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
  return { text: fallback, changed, awaitingReply: false };
}
