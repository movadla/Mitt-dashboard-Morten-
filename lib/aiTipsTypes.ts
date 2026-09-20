// Rene typer/konstanter uten Redis-/Anthropic-avhengighet — trygge å importere
// direkte i klientkomponenter (AiTipsSection.tsx). lib/aiTips.ts importerer
// ./kv (ioredis, "server-only") og ville feilet nettleser-bygget hvis disse
// lå der i stedet, se samme resonnement som lib/payday.ts/lib/privatContext.ts.

export const AI_TIPS_CATEGORIES = [
  "prompting",
  "modeller",
  "verktoy",
  "appbygging",
  "automatisering",
  "effektivitet",
  "nyheter",
] as const;
export type AiTipCategory = (typeof AI_TIPS_CATEGORIES)[number];

export const AI_TIPS_CATEGORY_LABELS: Record<AiTipCategory, string> = {
  prompting: "Promptteknikk",
  modeller: "Claude-modeller",
  verktoy: "AI-verktøy",
  appbygging: "Bygge med AI",
  automatisering: "Automatisering",
  effektivitet: "Effektivitet",
  nyheter: "AI-nyheter",
};

export interface AiTipResource {
  type: "artikkel" | "video" | "konto" | "annet";
  title: string;
  url: string;
  source?: string;
  why?: string;
}

// Enkel å fylle ut, men fanger mer enn "likte/likte ikke": to raske 1-10-
// skalaer (forkunnskap/forståelse) styrer nivå-justeringen automatisk, mens
// tema-avkrysningene gir presise signaler til NESTE dagers emnevalg — uten at
// Morten må skrive noe (fritekstfeltet er valgfritt).
export interface AiTipFeedback {
  priorKnowledge: number; // 1-10: "Hvor mye kunne du fra før?"
  understanding: number; // 1-10: "Hvor mye forsto du av dette?"
  difficultTopics: string[]; // undermengde av tip.subtopics
  difficultNote?: string;
  wantMoreTopics: string[]; // undermengde av tip.subtopics
  ratedAt: string;
}

export interface AiTip {
  date: string; // "YYYY-MM-DD"
  category: AiTipCategory;
  level: number; // 1-5, nivået tipset ble generert på
  title: string;
  summary: string; // dagens korte lesing (et par minutter)
  details: string; // utdypende innhold bak "les mer"
  subtopics: string[]; // 2-5 konkrete delemner — brukes som avkrysning i tilbakemeldingen
  resources: AiTipResource[];
  generatedAt: string;
  openedAt?: string;
  feedback?: AiTipFeedback;
}

export interface AiTipFeedbackInput {
  priorKnowledge: number;
  understanding: number;
  difficultTopics: string[];
  difficultNote?: string;
  wantMoreTopics: string[];
}
