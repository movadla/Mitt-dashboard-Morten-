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
  interest: number; // 1-10: "Hvor interessert er du i dette?"
  // 1-10: "Hvor godt traff dette tipset formen/strukturen du er ute etter?"
  // (den brede, helhetlige gjennomgangs-formen han ba om 2026-09-21) — et
  // signal om FORM, uavhengig av tema/vanskelighetsgrad.
  formatFit: number;
  difficultTopics: string[]; // undermengde av tip.subtopics
  difficultNote?: string;
  wantMoreTopics: string[]; // undermengde av tip.subtopics
  // Hva burde vært forklart bedre/dypere for å vært mest relevant for HAM —
  // brukes til å gjøre et BESLEKTET tema dypere neste gang det uansett kommer
  // opp i rotasjonen, ikke til å tvinge frem mer av akkurat dette temaet (se
  // buildSystemPrompt i lib/aiTips.ts for hvorfor).
  improvementNote?: string;
  ratedAt: string;
}

// Et markert utdrag av tekst — to typer, med helt ulik betydning:
// "viktig" er ren personlig huking (aldri sett av AI-en), "forstår-ikke"
// trigger en on-demand Claude-forklaring (samme "kun ved faktisk bruk"-
// prinsipp som nyhets-berikelsen i lib/news.ts).
export interface AiTipConfusion {
  text: string;
  explanation?: string;
  explainedAt?: string;
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
  highlights: string[]; // gul markering — "dette er viktig å ta med seg"
  confusions: AiTipConfusion[]; // "jeg forstår ikke dette" — forklares av Claude
  // Ferdig utkast til en instruks Morten kan lime rett inn til Claude Code,
  // KUN satt når dagens tema gir en konkret, holdbar handling i ett av hans
  // egne prosjekter (se buildSystemPrompt i lib/aiTips.ts).
  actionablePrompt?: string;
  // Kort anslag ("Lett · ~20 min") knyttet til actionablePrompt — kun satt
  // sammen med den, aldri alene.
  actionableEffort?: string;
  // Gyldig Mermaid-syntaks (flowchart/sequenceDiagram/...) — kun satt når et
  // diagram genuint gjør konseptet lettere å forstå enn ren tekst.
  diagram?: string;
  // KUN for Lager-tips (se completeStockItem i lib/aiTips.ts) — satt når Morten trykker
  // "Ferdig lest". Rettet 2026-09-21: tipset skal IKKE forsvinne fra lageret, bare merkes
  // lest — vises dempet og sortert nederst i stedet for slettet.
  lagerFerdigLestAt?: string;
}

export interface AiTipFeedbackInput {
  priorKnowledge: number;
  understanding: number;
  interest: number;
  formatFit: number;
  difficultTopics: string[];
  difficultNote?: string;
  wantMoreTopics: string[];
  improvementNote?: string;
}
