"use client";

import { useEffect, useId, useRef, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { CardHeader, SkeletonRows } from "../CardShell";
import { SECTION_ACCENT } from "./sectionAccents";
import { formatDMY } from "@/lib/payday";
import { AI_TIPS_CATEGORY_LABELS, type AiTip, type AiTipFeedbackInput } from "@/lib/aiTipsTypes";
import { Sparkles, Link2, CirclePlay, AtSign, ExternalLink, Highlighter, CircleHelp, Terminal } from "lucide-react";

// Seksjonen har ÉN fast aksentfarge (fuchsia-400, se sectionAccents.ts) —
// klassene under er derfor skrevet som RENE, statiske strenger i stedet for
// CardHeader/SidebarNav sitt generiske `iconColorClass.replace("text-","bg-")`-
// triks. Det generiske trikset er OK for /10-varianten CardHeader selv bruker
// (etablert over 200+ steder), men her trengs flere ulike opasitetsvarianter
// (/10, /15, /25) og border-/hover:-kombinasjoner Tailwind v4 sin skanner må
// se som bokstavelig tekst i kildefilen for i det hele tatt å generere dem —
// en dynamisk sammensatt streng ville IKKE dukket opp i det skannede
// resultatet. Se DESIGN.md.
const ACCENT_TEXT = SECTION_ACCENT.aitips; // "text-fuchsia-400"

// De to marker-fargene er bevisst IKKE hentet fra Tailwind-tokenene: "gul
// markering" skal se ekte gul ut i begge temaer (yellow-300 er omdirigert til
// en mørk gull-tekstfarge i dagmodus, se DESIGN.md — riktig for tekst, feil
// for en markeringsbakgrunn), og "forstår ikke"-fargen må skille seg tydelig
// fra den. Rene rgba-verdier via inline style unngår begge fellene.
const HIGHLIGHT_BG = "rgba(253, 224, 71, 0.45)";
const CONFUSION_BG = "rgba(56, 189, 248, 0.32)";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3.5 w-3.5 shrink-0 text-ink-4 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function LevelDots({ level }: { level: number }) {
  const filled = Math.round(level);
  return (
    <span className="flex items-center gap-0.5" aria-label={`Nivå ${filled} av 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < filled ? "bg-fuchsia-400" : "bg-line-strong"}`} />
      ))}
    </span>
  );
}

function resourceIcon(type: AiTip["resources"][number]["type"]) {
  if (type === "video") return CirclePlay;
  if (type === "konto") return AtSign;
  return Link2;
}

function ResourceList({ resources }: { resources: AiTip["resources"] }) {
  if (resources.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <p className="text-2xs font-bold uppercase tracking-[0.13em] text-ink-3">Verdt å sjekke ut</p>
      {resources.map((r, i) => {
        const Icon = resourceIcon(r.type);
        return (
          <a
            key={i}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2 transition hover:border-line-strong"
          >
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fuchsia-400" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-xs font-medium text-ink-1">{r.title}</span>
                <ExternalLink className="h-2.5 w-2.5 shrink-0 text-ink-4" />
              </span>
              {(r.source || r.why) && (
                <span className="mt-0.5 block text-2xs text-ink-4">
                  {r.source}
                  {r.source && r.why ? " — " : ""}
                  {r.why}
                </span>
              )}
            </span>
          </a>
        );
      })}
    </div>
  );
}

// ── Markering ("viktig" gult / "forstår ikke" blått) ────────────────────────

type MarkSegment =
  | { kind: "text"; value: string }
  | { kind: "highlight"; value: string }
  | { kind: "confusion"; value: string; explanation?: string };

function buildMarkSegments(text: string, tip: AiTip): MarkSegment[] {
  const marks: { value: string; kind: "highlight" | "confusion"; explanation?: string }[] = [
    ...tip.highlights.map((h) => ({ value: h, kind: "highlight" as const })),
    ...tip.confusions.map((c) => ({ value: c.text, kind: "confusion" as const, explanation: c.explanation })),
  ]
    .filter((m) => m.value)
    // Lengste frase først: et kort merke som tilfeldigvis er en delstreng av
    // et lengre, skal ikke "kutte opp" det lengre merket.
    .sort((a, b) => b.value.length - a.value.length);

  let segments: MarkSegment[] = [{ kind: "text", value: text }];
  for (const m of marks) {
    segments = segments.flatMap((seg) => {
      if (seg.kind !== "text") return [seg];
      const parts = seg.value.split(m.value);
      if (parts.length === 1) return [seg];
      const out: MarkSegment[] = [];
      parts.forEach((p, i) => {
        if (i > 0) {
          out.push(
            m.kind === "highlight"
              ? { kind: "highlight", value: m.value }
              : { kind: "confusion", value: m.value, explanation: m.explanation },
          );
        }
        if (p) out.push({ kind: "text", value: p });
      });
      return out;
    });
  }
  return segments;
}

// "**fet tekst**" — brukt av modellen for delseksjons-overskrifter i det
// rikere "details"-formatet (2026-09-21). Splittes FØR markering-segmentene,
// slik at en gul/blå markering fortsatt kan ligge inni en fet overskrift.
function splitBoldParts(text: string): { bold: boolean; value: string }[] {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((value, i) => ({ bold: i % 2 === 1, value }))
    .filter((p) => p.value.length > 0);
}

function MarkedText({
  text,
  tip,
  pendingConfusion,
  openConfusionKey,
  onOpenConfusion,
  onRemoveHighlight,
  onRemoveConfusion,
  className,
}: {
  text: string;
  tip: AiTip;
  pendingConfusion: string | null;
  openConfusionKey: string | null;
  onOpenConfusion: (text: string | null) => void;
  onRemoveHighlight: (text: string) => void;
  onRemoveConfusion: (text: string) => void;
  className?: string;
}) {
  function renderMarkSegments(part: string, keyPrefix: string) {
    return buildMarkSegments(part, tip).map((seg, i) => {
      const key = `${keyPrefix}-${i}`;
      if (seg.kind === "text") return <span key={key}>{seg.value}</span>;
      if (seg.kind === "highlight") {
        return (
          <mark
            key={key}
            onClick={() => onRemoveHighlight(seg.value)}
            style={{ backgroundColor: HIGHLIGHT_BG }}
            className="cursor-pointer rounded px-0.5 text-ink-1"
            title="Trykk for å fjerne markeringen"
          >
            {seg.value}
          </mark>
        );
      }
      const isOpen = openConfusionKey === seg.value;
      const isPending = pendingConfusion === seg.value;
      return (
        <span key={key} className="relative inline">
          <mark
            onClick={() => onOpenConfusion(isOpen ? null : seg.value)}
            style={{ backgroundColor: CONFUSION_BG, textDecoration: "underline dotted" }}
            className="cursor-pointer rounded px-0.5 text-ink-1"
            title="Trykk for forklaring"
          >
            {seg.value}
          </mark>
          {isOpen && (
            <span className="absolute left-0 top-full z-20 mt-1 block w-64 max-w-[80vw] rounded-lg border border-line-strong bg-surface-1 p-2.5 text-xs text-ink-2 shadow-xl">
              {isPending || !seg.explanation ? (
                <span className="text-ink-4">Forklarer …</span>
              ) : (
                <>
                  <span className="block whitespace-pre-line">{seg.explanation}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveConfusion(seg.value)}
                    className="mt-1.5 text-2xs font-medium text-ink-4 underline"
                  >
                    Fjern markering
                  </button>
                </>
              )}
            </span>
          )}
        </span>
      );
    });
  }

  return (
    <span className={className}>
      {splitBoldParts(text).map((part, pi) =>
        part.bold ? (
          <strong key={pi} className="font-semibold text-ink-1">
            {renderMarkSegments(part.value, `b${pi}`)}
          </strong>
        ) : (
          <span key={pi}>{renderMarkSegments(part.value, `p${pi}`)}</span>
        ),
      )}
    </span>
  );
}

interface PendingSelection {
  text: string;
  top: number;
  left: number;
}

// Fanger opp tekstmarkering (dra-over-ord) INNENFOR en gitt container og
// viser en liten svevende "Viktig/Forstår ikke"-knapperad ved markeringen.
function useSelectionToolbar(containerRef: React.RefObject<HTMLElement | null>) {
  const [selection, setSelection] = useState<PendingSelection | null>(null);

  useEffect(() => {
    function handleUp() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const text = sel.toString().trim().replace(/\s+/g, " ");
      const container = containerRef.current;
      const range = sel.getRangeAt(0);
      if (!text || text.length < 2 || text.length > 240 || !container || !container.contains(range.commonAncestorContainer)) {
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      setSelection({ text, top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 240) });
    }
    function handleDown(e: MouseEvent | TouchEvent) {
      // Klikk utenfor selve svevende knapperaden lukker den — men ikke
      // ved klikk PÅ raden (da ville knappetrykket aldri rekke å registreres).
      const target = e.target as HTMLElement;
      if (target.closest?.("[data-selection-toolbar]")) return;
      setSelection((prev) => (prev ? null : prev));
    }
    document.addEventListener("mouseup", handleUp);
    document.addEventListener("touchend", handleUp);
    document.addEventListener("mousedown", handleDown);
    return () => {
      document.removeEventListener("mouseup", handleUp);
      document.removeEventListener("touchend", handleUp);
      document.removeEventListener("mousedown", handleDown);
    };
  }, [containerRef]);

  return [selection, setSelection] as const;
}

function SelectionToolbar({
  selection,
  onHighlight,
  onConfuse,
}: {
  selection: PendingSelection;
  onHighlight: () => void;
  onConfuse: () => void;
}) {
  return (
    <div
      data-selection-toolbar
      style={{ position: "fixed", top: selection.top, left: Math.max(selection.left, 8) }}
      className="z-30 flex gap-1 rounded-lg border border-line-strong bg-surface-1 p-1 shadow-xl shadow-black/20"
    >
      <button
        type="button"
        onClick={onHighlight}
        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-2xs font-medium text-ink-1 transition hover:bg-surface-2"
      >
        <Highlighter className="h-3.5 w-3.5 text-yellow-300" />
        Viktig
      </button>
      <button
        type="button"
        onClick={onConfuse}
        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-2xs font-medium text-ink-1 transition hover:bg-surface-2"
      >
        <CircleHelp className="h-3.5 w-3.5 text-sky-400" />
        Forstår ikke
      </button>
    </div>
  );
}

// ── Tilbakemelding ───────────────────────────────────────────────────────────

function SliderField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between text-2xs font-medium text-ink-3">
        <span>{label}</span>
        <span className="tabular-nums font-bold text-fuchsia-400">{value}/10</span>
      </span>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-fuchsia-400"
      />
    </label>
  );
}

// Listet NEDOVER i like store bokser (én per rad) i stedet for wrappede
// piller av ulik bredde — lettere å skanne når det er flere valg (jf.
// tilbakemelding).
function TopicChips({ topics, selected, onToggle }: { topics: string[]; selected: string[]; onToggle: (topic: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {topics.map((t) => {
        const isOn = selected.includes(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggle(t)}
            aria-pressed={isOn}
            className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
              isOn
                ? "border-fuchsia-400 bg-fuchsia-400/15 text-fuchsia-400"
                : "border-line bg-surface-2 text-ink-2 hover:border-line-strong hover:text-ink-1"
            }`}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

function toggleInArray(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function FeedbackForm({ tip, onSubmit }: { tip: AiTip; onSubmit: (input: AiTipFeedbackInput) => void }) {
  const [priorKnowledge, setPriorKnowledge] = useState(5);
  const [understanding, setUnderstanding] = useState(5);
  const [interest, setInterest] = useState(5);
  const [formatFit, setFormatFit] = useState(5);
  const [difficultTopics, setDifficultTopics] = useState<string[]>([]);
  const [difficultNote, setDifficultNote] = useState("");
  const [wantMoreTopics, setWantMoreTopics] = useState<string[]>([]);
  const [improvementNote, setImprovementNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-3">
      <p className="text-2xs font-bold uppercase tracking-[0.13em] text-ink-3">Rask tilbakemelding</p>
      <SliderField label="Hvor mye kunne du fra før?" value={priorKnowledge} onChange={setPriorKnowledge} />
      <SliderField label="Hvor mye forsto du av dette?" value={understanding} onChange={setUnderstanding} />
      <SliderField label="Hvor interessert er du i dette?" value={interest} onChange={setInterest} />
      <SliderField label="Hvor godt traff dette formen du er ute etter?" value={formatFit} onChange={setFormatFit} />

      {tip.subtopics.length > 0 && (
        <>
          <div className="flex flex-col gap-1.5">
            <p className="text-2xs font-medium text-ink-3">Hvilke ting var vanskelig å forstå?</p>
            <TopicChips
              topics={tip.subtopics}
              selected={difficultTopics}
              onToggle={(t) => setDifficultTopics((prev) => toggleInArray(prev, t))}
            />
            <input
              type="text"
              value={difficultNote}
              onChange={(e) => setDifficultNote(e.target.value)}
              placeholder="Noe annet som var vanskelig? (valgfritt)"
              className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-ink-1 placeholder:text-ink-4 focus:border-line-strong focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-2xs font-medium text-ink-3">Hvilke ting vil du lære mer om?</p>
            <TopicChips
              topics={tip.subtopics}
              selected={wantMoreTopics}
              onToggle={(t) => setWantMoreTopics((prev) => toggleInArray(prev, t))}
            />
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="text-2xs font-medium text-ink-3">
          Noe som burde vært forklart bedre eller mer i detalj for at det skulle vært mest relevant for deg? (valgfritt)
        </p>
        <textarea
          value={improvementNote}
          onChange={(e) => setImprovementNote(e.target.value)}
          rows={2}
          placeholder="Brukes til å gå dypere neste gang et beslektet tema kommer opp — ikke til å gjenta akkurat dette temaet oftere."
          className="resize-none rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-ink-1 placeholder:text-ink-4 focus:border-line-strong focus:outline-none"
        />
      </div>

      <button
        type="button"
        disabled={submitting}
        onClick={() => {
          setSubmitting(true);
          onSubmit({ priorKnowledge, understanding, interest, formatFit, difficultTopics, difficultNote, wantMoreTopics, improvementNote });
        }}
        className="self-start rounded-lg bg-fuchsia-400/15 px-3 py-1.5 text-xs font-semibold text-fuchsia-400 transition hover:bg-fuchsia-400/25 disabled:opacity-60"
      >
        Send inn
      </button>
    </div>
  );
}

// Mermaid dynamisk importert (ikke i toppbunten) — samme prinsipp som
// CommandPalette sin lazy-lasting: et tungt bibliotek som kun trengs når et
// tips faktisk har et diagram, ikke for alle som åpner Privat-fanen.
function DiagramBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const diagramId = useId().replace(/:/g, "-");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const isDag = document.documentElement.getAttribute("data-theme") === "dag";
        mermaid.initialize({ startOnLoad: false, theme: isDag ? "default" : "dark", securityLevel: "strict", fontFamily: "inherit" });
        const { svg: rendered } = await mermaid.render(diagramId, code);
        if (!cancelled) setSvg(rendered);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, diagramId]);

  // Stille feil — diagrammet er en bonus for forståelsen, ikke kritisk
  // innhold. Resten av tipset skal fungere fint uten det.
  if (failed) return null;
  if (!svg) return <div className="mt-3 h-28 animate-pulse rounded-xl bg-surface-2" />;
  return <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface-1 p-3" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function ActionablePromptBox({ prompt, effort }: { prompt: string; effort?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard-tilgang blokkert – ignorer */
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-fuchsia-400/30 bg-fuchsia-400/[0.06] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-[0.13em] text-fuchsia-400">
          <Terminal className="h-3.5 w-3.5" />
          Ferdig prompt til Claude Code
        </div>
        {effort && <span className="shrink-0 text-2xs font-medium text-ink-4">{effort}</span>}
      </div>
      <p className="mt-1.5 whitespace-pre-line rounded-lg bg-surface-1 p-2 font-mono text-xs text-ink-2">{prompt}</p>
      <button
        type="button"
        onClick={handleCopy}
        aria-live="polite"
        className="mt-1.5 flex items-center gap-1 text-2xs font-semibold text-fuchsia-400 transition hover:text-fuchsia-300"
      >
        {copied ? "Kopiert" : "Kopier"}
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {copied ? (
            <path d="M3 8.5L6.5 12 13 5" />
          ) : (
            <>
              <rect x="5" y="5" width="9" height="9" rx="1.5" />
              <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

function FeedbackSummary({ tip }: { tip: AiTip }) {
  const fb = tip.feedback;
  if (!fb) return null;
  return (
    <div className="mt-3 flex flex-col gap-1 rounded-xl border border-line bg-surface-1 p-3 text-2xs text-ink-4">
      <p>
        Kunne fra før: <span className="font-semibold text-fuchsia-400">{fb.priorKnowledge}/10</span> · Forsto:{" "}
        <span className="font-semibold text-fuchsia-400">{fb.understanding}/10</span> · Interesse:{" "}
        <span className="font-semibold text-fuchsia-400">{fb.interest}/10</span> · Formtreff:{" "}
        <span className="font-semibold text-fuchsia-400">{fb.formatFit}/10</span>
      </p>
      {fb.difficultTopics.length > 0 && <p>Vanskelig: {fb.difficultTopics.join(", ")}</p>}
      {fb.difficultNote && <p>«{fb.difficultNote}»</p>}
      {fb.wantMoreTopics.length > 0 && <p>Vil lære mer om: {fb.wantMoreTopics.join(", ")}</p>}
      {fb.improvementNote && <p>Forbedringsønske: «{fb.improvementNote}»</p>}
    </div>
  );
}

// ── Selve tips-innholdet, delt mellom dagens kort og arkiv-rader ────────────

async function postJson(url: string, body: object): Promise<AiTip | null> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    return json.tip ?? null;
  } catch {
    return null;
  }
}

function TipBody({
  tip,
  onUpdate,
  showHeader = true,
  onFeedbackSubmitted,
}: {
  tip: AiTip;
  onUpdate: (tip: AiTip) => void;
  showHeader?: boolean;
  // Kun satt av TodayCard — trigger for å hake av den koblede daglige
  // påminnelsen når dagens tips faktisk er ferdig vurdert.
  onFeedbackSubmitted?: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [openConfusionKey, setOpenConfusionKey] = useState<string | null>(null);
  const [pendingConfusion, setPendingConfusion] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useSelectionToolbar(containerRef);
  const paragraphs = tip.details.split(/\n{2,}/).filter(Boolean);

  async function handleHighlight() {
    if (!selection) return;
    const text = selection.text;
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    const nextTip = await postJson("/api/ai-tips/highlight", { date: tip.date, text, action: "add" });
    if (nextTip) onUpdate(nextTip);
  }

  async function handleConfuse() {
    if (!selection) return;
    const text = selection.text;
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    setPendingConfusion(text);
    setOpenConfusionKey(text);
    const nextTip = await postJson("/api/ai-tips/confusion", { date: tip.date, text, action: "add" });
    setPendingConfusion(null);
    if (nextTip) onUpdate(nextTip);
  }

  async function handleRemoveHighlight(text: string) {
    const nextTip = await postJson("/api/ai-tips/highlight", { date: tip.date, text, action: "remove" });
    if (nextTip) onUpdate(nextTip);
  }

  async function handleRemoveConfusion(text: string) {
    setOpenConfusionKey(null);
    const nextTip = await postJson("/api/ai-tips/confusion", { date: tip.date, text, action: "remove" });
    if (nextTip) onUpdate(nextTip);
  }

  async function handleSubmitFeedback(input: AiTipFeedbackInput) {
    const nextTip = await postJson("/api/ai-tips/rate", { date: tip.date, ...input });
    if (nextTip) {
      onUpdate(nextTip);
      onFeedbackSubmitted?.();
    }
  }

  const markedProps = {
    tip,
    pendingConfusion,
    openConfusionKey,
    onOpenConfusion: setOpenConfusionKey,
    onRemoveHighlight: handleRemoveHighlight,
    onRemoveConfusion: handleRemoveConfusion,
  };

  return (
    <div ref={containerRef}>
      {selection && <SelectionToolbar selection={selection} onHighlight={handleHighlight} onConfuse={handleConfuse} />}

      {showHeader && (
        <>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-fuchsia-400/10 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-fuchsia-400">
              {AI_TIPS_CATEGORY_LABELS[tip.category]}
            </span>
            <LevelDots level={tip.level} />
          </div>
          <h4 className="mt-2 text-base font-semibold text-ink-1">{tip.title}</h4>
        </>
      )}

      <p className="mt-1.5 whitespace-pre-line text-sm text-ink-2">
        <MarkedText text={tip.summary} {...markedProps} />
      </p>

      {tip.diagram && <DiagramBlock code={tip.diagram} />}

      {tip.actionablePrompt && <ActionablePromptBox prompt={tip.actionablePrompt} effort={tip.actionableEffort} />}

      {paragraphs.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            className="mt-2 flex items-center gap-1 text-2xs font-semibold text-ink-3 transition hover:text-ink-1"
          >
            {detailsOpen ? "Vis mindre" : "Les mer"}
            <Chevron open={detailsOpen} />
          </button>
          {detailsOpen && (
            <div className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
              {paragraphs.map((p, i) => (
                <p key={i} className="whitespace-pre-line text-sm text-ink-2">
                  <MarkedText text={p} {...markedProps} />
                </p>
              ))}
              <ResourceList resources={tip.resources} />
            </div>
          )}
        </>
      )}

      {tip.feedback ? <FeedbackSummary tip={tip} /> : <FeedbackForm tip={tip} onSubmit={handleSubmitFeedback} />}
    </div>
  );
}

function TodayCard({
  tip,
  onUpdate,
  onFeedbackSubmitted,
}: {
  tip: AiTip;
  onUpdate: (tip: AiTip) => void;
  onFeedbackSubmitted?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-3.5">
      <TipBody tip={tip} onUpdate={onUpdate} onFeedbackSubmitted={onFeedbackSubmitted} />
    </div>
  );
}

function ArchiveRow({ tip, onUpdate }: { tip: AiTip; onUpdate: (tip: AiTip) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border border-line bg-surface-2 px-3 py-2">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-2.5 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-2xs font-medium tabular-nums text-ink-4">{formatDMY(tip.date)}</span>
            <span className="text-2xs font-semibold uppercase tracking-wide text-fuchsia-400">{AI_TIPS_CATEGORY_LABELS[tip.category]}</span>
          </div>
          <p className="mt-0.5 truncate text-sm font-medium text-ink-1">{tip.title}</p>
        </div>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="mt-2 border-t border-line pt-2">
          <TipBody tip={tip} onUpdate={onUpdate} showHeader={false} />
        </div>
      )}
    </li>
  );
}

// ── Lager-fanen — enklere lesevisning uten markering (highlight-/confusion-
// API-ene slår opp på Dagens sin Redis-hash og ville uansett ikke funnet et
// lager-tips), men MED egen tilbakemelding: rettet 2026-09-21 til at
// tilbakemelding her faktisk skal ha effekt — bare avgrenset til Lager selv
// (se submitStockFeedback i lib/aiTips.ts). Kun fet-skrift-formattering,
// samme FeedbackForm/FeedbackSummary som Dagens, og en "Ferdig lest"-knapp.
function PlainFormattedText({ text }: { text: string }) {
  return (
    <>
      {splitBoldParts(text).map((part, i) =>
        part.bold ? (
          <strong key={i} className="font-semibold text-ink-1">
            {part.value}
          </strong>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </>
  );
}

function StockRow({
  tip,
  onUpdate,
  onComplete,
}: {
  tip: AiTip;
  onUpdate: (tip: AiTip) => void;
  onComplete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const paragraphs = tip.details.split(/\n{2,}/).filter(Boolean);

  async function handleSubmitFeedback(input: AiTipFeedbackInput) {
    const nextTip = await postJson("/api/ai-tips/stock/rate", { id: tip.date, ...input });
    if (nextTip) onUpdate(nextTip);
  }

  async function handleComplete() {
    setCompleting(true);
    try {
      await fetch("/api/ai-tips/stock/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tip.date }),
      });
      onComplete(tip.date);
    } catch {
      setCompleting(false);
    }
  }

  return (
    <li className="rounded-xl border border-line bg-surface-2 px-3 py-2">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-2.5 text-left">
        <div className="min-w-0 flex-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-fuchsia-400">{AI_TIPS_CATEGORY_LABELS[tip.category]}</span>
          <p className="mt-0.5 truncate text-sm font-medium text-ink-1">{tip.title}</p>
        </div>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
          <p className="whitespace-pre-line text-sm text-ink-2">
            <PlainFormattedText text={tip.summary} />
          </p>
          {tip.diagram && <DiagramBlock code={tip.diagram} />}
          {tip.actionablePrompt && <ActionablePromptBox prompt={tip.actionablePrompt} effort={tip.actionableEffort} />}
          {paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-line text-sm text-ink-2">
              <PlainFormattedText text={p} />
            </p>
          ))}
          <ResourceList resources={tip.resources} />
          {tip.feedback ? <FeedbackSummary tip={tip} /> : <FeedbackForm tip={tip} onSubmit={handleSubmitFeedback} />}
          <button
            type="button"
            onClick={handleComplete}
            disabled={completing}
            className="self-start rounded-lg bg-fuchsia-400/15 px-3 py-1.5 text-xs font-semibold text-fuchsia-400 transition hover:bg-fuchsia-400/25 disabled:opacity-60"
          >
            {completing ? "…" : "Ferdig lest"}
          </button>
        </div>
      )}
    </li>
  );
}

function LagerSection() {
  const { data, mutate, isLoading } = useSWR<{ stock: AiTip[] }>("/api/ai-tips/stock", jsonFetcher);
  const stock = data?.stock ?? [];

  function handleUpdate(nextTip: AiTip) {
    mutate({ stock: stock.map((t) => (t.date === nextTip.date ? nextTip : t)) }, { revalidate: false });
  }

  function handleComplete(id: string) {
    mutate({ stock: stock.filter((t) => t.date !== id) }, { revalidate: false });
    // Etterfyllingen skjer i bakgrunnen på serveren — hent på nytt om litt for
    // å se om en ny har dukket opp, uten at brukeren må gjøre noe selv.
    setTimeout(() => mutate(), 5000);
  }

  return (
    <div>
      <p className="mb-2 text-2xs text-ink-4">
        Ekstra tips å lese når du har tid. Tilbakemeldingen din her styrer kun fremtidige Lager-tips — den påvirker aldri «Dagens». Fylles automatisk opp til 4.
      </p>
      {isLoading ? (
        <SkeletonRows count={3} className="h-14" />
      ) : stock.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface-2 p-3.5 text-sm text-ink-3">Lageret fylles opp … kom tilbake om litt.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {stock.map((tip) => (
            <StockRow key={tip.date} tip={tip} onUpdate={handleUpdate} onComplete={handleComplete} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DagensSection() {
  const { data, isLoading, mutate } = useSWR<{ today: AiTip | null; archive: AiTip[] }>("/api/ai-tips", jsonFetcher);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const openedRef = useRef<string | null>(null);

  const today = data?.today ?? null;
  const archive = data?.archive ?? [];

  // Markerer tipset som åpnet (styrer nav-badgen) idet det faktisk vises —
  // ref-vakten hindrer at samme dato POSTes flere ganger ved SWR-revalidering.
  useEffect(() => {
    if (!today || today.openedAt || openedRef.current === today.date) return;
    openedRef.current = today.date;
    fetch("/api/ai-tips/opened", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: today.date }),
    }).catch(() => {});
  }, [today]);

  function handleUpdateToday(nextTip: AiTip) {
    mutate({ today: nextTip, archive }, { revalidate: false });
  }

  function handleUpdateArchive(nextTip: AiTip) {
    mutate({ today, archive: archive.map((t) => (t.date === nextTip.date ? nextTip : t)) }, { revalidate: false });
  }

  // Haker av den koblede daglige påminnelsen ("Les dagens AI-tips") idet
  // tilbakemeldingen er sendt inn — recurrence:"daily" gjør at
  // toggleReminder da automatisk rykker den frem til i morgen i stedet for å
  // markere den permanent fullført (se lib/reminders.ts).
  async function handleFeedbackSubmitted() {
    try {
      const res = await fetch("/api/reminders");
      const json = await res.json();
      const reminder = (json.reminders ?? []).find(
        (r: { linkedTo?: { targetId?: string }; done?: boolean }) => r.linkedTo?.targetId === "aitips" && !r.done,
      );
      if (reminder) {
        await fetch(`/api/reminders/${reminder.id}`, { method: "PATCH" });
        window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      }
    } catch {
      /* påminnelsen henger igjen til neste manuelle avhaking — ikke kritisk */
    }
  }

  return (
    <div>
      {isLoading ? (
        <SkeletonRows count={2} className="h-16" />
      ) : today ? (
        <TodayCard tip={today} onUpdate={handleUpdateToday} onFeedbackSubmitted={handleFeedbackSubmitted} />
      ) : (
        <div className="rounded-2xl border border-line bg-surface-2 p-3.5 text-sm text-ink-3">
          Dagens tips er ikke klart ennå.{" "}
          <button type="button" onClick={() => mutate()} className="font-medium text-fuchsia-400 underline">
            Prøv igjen
          </button>
        </div>
      )}

      {archive.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setArchiveOpen((v) => !v)}
            aria-expanded={archiveOpen}
            className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-[0.13em] text-ink-3 transition hover:text-ink-1"
          >
            Tidligere tips ({archive.length})
            <Chevron open={archiveOpen} />
          </button>
          {archiveOpen && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {archive.map((tip) => (
                <ArchiveRow key={tip.date} tip={tip} onUpdate={handleUpdateArchive} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function AiTipsSection() {
  const [mainView, setMainView] = useState<"dagens" | "lager">("dagens");
  return (
    // border-t-fuchsia-400 må matche SECTION_ACCENT.aitips — se sectionAccents.ts.
    <div className="border-t-2 border-t-fuchsia-400/60 p-4">
      <CardHeader title="AI-tips" icon={Sparkles} iconColorClass={ACCENT_TEXT} />
      <div className="mb-3 flex items-center gap-1.5 self-start rounded-lg border border-line bg-surface-1 p-0.5">
        {(["dagens", "lager"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setMainView(v)}
            aria-pressed={mainView === v}
            className={`rounded-md px-2.5 py-1 text-2xs font-semibold uppercase transition ${
              mainView === v ? "bg-fuchsia-400/15 text-fuchsia-400" : "text-ink-3 hover:text-ink-1"
            }`}
          >
            {v === "dagens" ? "Dagens" : "Lager"}
          </button>
        ))}
      </div>
      {mainView === "dagens" ? <DagensSection /> : <LagerSection />}
    </div>
  );
}
