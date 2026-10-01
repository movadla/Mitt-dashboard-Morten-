import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { recordUsage } from "./aiUsage";
import type { RyggWeekDecision } from "./ryggLog";

// Del 2 av "personlig trener"-ønsket (2026-10-01). HARD GRENSE, avtalt eksplisitt med Morten
// før dette ble bygget: denne modulen genererer KOMMENTAR, aldri en beslutning. Hvilken
// beslutning uka får (progress/repeat/deload/hold) er 100% bestemt av evaluateWeek() i
// lib/ryggAlgorithm.ts, FØR dette kallet i det hele tatt skjer - den regelbaserte logikken er
// den eneste delen av systemet som faktisk er testet/auditerbar, og skal forbli det. Denne
// fila tar imot en allerede ferdig beslutning og skriver en kort, personlig kommentar rundt
// den - den kan aldri overstyre eller antyde en annen beslutning.
const MODEL = "claude-sonnet-5";
const MAX_NOTE_LENGTH = 600;

export interface RyggCoachNoteInput {
  week: number;
  decision: RyggWeekDecision;
  decisionReason: string;
  painAvg: number | null;
  priorWeekPainAvg: number | null;
  rpeAvg: number | null;
  sessionsCompleted: number;
  // exerciseId -> alle loggede verdier denne uka (flere økter kan ha logget samme øvelse).
  exerciseRpeByExercise: Record<string, number[]>;
  exerciseQualityByExercise: Record<string, number[]>;
  userNotes: string[];
  previousCoachNote?: string;
}

function formatExerciseMap(data: Record<string, number[]>): string {
  const entries = Object.entries(data);
  if (entries.length === 0) return "(ingen data denne uka)";
  return entries.map(([id, values]) => `${id}: ${values.join(", ")}`).join(" | ");
}

function buildSystemPrompt(): string {
  return `Du er en erfaren, varm men presis fysioterapeut/personlig trener som følger opp én bestemt brukers 12-ukers korsrygg-rehabprogram, uke for uke.

VIKTIG BEGRENSNING, ALDRI BRYT DEN: beslutningen for denne uka (progresjon/gjenta/lettere uke/pause) er ALLEREDE tatt av et separat, regelbasert system, og er endelig. Du skal ALDRI foreslå en annen beslutning enn den du får oppgitt, ALDRI antyde at brukeren bør ignorere den eller "egentlig burde" gjort noe annet, og ALDRI gi konkrete doserings-/vekt-/serie-tall selv - det styres av programmet, ikke av deg. Din eneste jobb er å skrive en kort, personlig kommentar som forklarer/setter beslutningen i kontekst og gir realistisk, trygg oppmuntring.

Svar med REN TEKST, 2-4 setninger, norsk bokmål, ingen markdown/overskrifter/punktlister/anførselstegn rundt hele svaret. Vær konkret og referer til faktiske tall/øvelser fra konteksten du får oppgitt der det er naturlig - ikke generiske fraser som kunne stått i en hvilken som helst uke. Ikke gi medisinske råd utover det som allerede er bestemt, og ikke bagatelliser smerte brukeren har rapportert.`;
}

function buildUserMessage(input: RyggCoachNoteInput): string {
  const lines = [
    `Uke ${input.week}, beslutning fra systemet: ${input.decision} - grunngitt slik: "${input.decisionReason}"`,
    `Smertesnitt denne uka: ${input.painAvg ?? "ukjent"} (forrige uke: ${input.priorWeekPainAvg ?? "ingen baseline ennå"})`,
    `Gjennomsnittlig opplevd anstrengelse (RPE) for hele økter denne uka: ${input.rpeAvg ?? "ukjent"}, ${input.sessionsCompleted} økter gjennomført`,
    `Tyngde per øvelse denne uka (skala 1-10): ${formatExerciseMap(input.exerciseRpeByExercise)}`,
    `Mestringsfølelse per øvelse denne uka (skala 1-5, høyt=god kontroll): ${formatExerciseMap(input.exerciseQualityByExercise)}`,
    input.userNotes.length > 0
      ? `Brukerens egne notater denne uka: ${input.userNotes.join(" / ")}`
      : "Ingen egne notater logget denne uka.",
    input.previousCoachNote
      ? `Din kommentar forrige uke (ikke gjenta deg selv, men du kan bygge videre på den): "${input.previousCoachNote}"`
      : "Dette er din første kommentar til brukeren.",
  ];
  return lines.join("\n");
}

export async function generateRyggCoachNote(input: RyggCoachNoteInput): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: buildUserMessage(input) }],
    });
    await recordUsage(response.usage);

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) return null;
    return text.slice(0, MAX_NOTE_LENGTH);
  } catch (err) {
    console.error("Rygg-trenerkommentar: generering feilet (uka lukkes likevel, se decisionReason):", err);
    return null;
  }
}
