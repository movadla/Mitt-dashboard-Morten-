"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { CardHeader, SkeletonRows } from "../CardShell";
import { SECTION_ACCENT } from "./sectionAccents";
import { formatDMY } from "@/lib/payday";
import { AI_TIPS_CATEGORY_LABELS, type AiTip, type AiTipFeedbackInput } from "@/lib/aiTipsTypes";
import { Sparkles, Link2, CirclePlay, AtSign, ExternalLink } from "lucide-react";

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

function TopicChips({ topics, selected, onToggle }: { topics: string[]; selected: string[]; onToggle: (topic: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {topics.map((t) => {
        const isOn = selected.includes(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggle(t)}
            aria-pressed={isOn}
            className={`rounded-full border px-2.5 py-1 text-2xs font-medium transition ${
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
  const [difficultTopics, setDifficultTopics] = useState<string[]>([]);
  const [difficultNote, setDifficultNote] = useState("");
  const [wantMoreTopics, setWantMoreTopics] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-3">
      <p className="text-2xs font-bold uppercase tracking-[0.13em] text-ink-3">Rask tilbakemelding</p>
      <SliderField label="Hvor mye kunne du fra før?" value={priorKnowledge} onChange={setPriorKnowledge} />
      <SliderField label="Hvor mye forsto du av dette?" value={understanding} onChange={setUnderstanding} />

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

      <button
        type="button"
        disabled={submitting}
        onClick={() => {
          setSubmitting(true);
          onSubmit({ priorKnowledge, understanding, difficultTopics, difficultNote, wantMoreTopics });
        }}
        className="self-start rounded-lg bg-fuchsia-400/15 px-3 py-1.5 text-xs font-semibold text-fuchsia-400 transition hover:bg-fuchsia-400/25 disabled:opacity-60"
      >
        Send inn
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
        <span className="font-semibold text-fuchsia-400">{fb.understanding}/10</span>
      </p>
      {fb.difficultTopics.length > 0 && <p>Vanskelig: {fb.difficultTopics.join(", ")}</p>}
      {fb.difficultNote && <p>«{fb.difficultNote}»</p>}
      {fb.wantMoreTopics.length > 0 && <p>Vil lære mer om: {fb.wantMoreTopics.join(", ")}</p>}
    </div>
  );
}

function TodayCard({ tip, onSubmitFeedback }: { tip: AiTip; onSubmitFeedback: (input: AiTipFeedbackInput) => void }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const paragraphs = tip.details.split(/\n{2,}/).filter(Boolean);

  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-3.5">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-fuchsia-400/10 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-fuchsia-400">
          {AI_TIPS_CATEGORY_LABELS[tip.category]}
        </span>
        <LevelDots level={tip.level} />
      </div>
      <h4 className="mt-2 text-base font-semibold text-ink-1">{tip.title}</h4>
      <p className="mt-1.5 whitespace-pre-line text-sm text-ink-2">{tip.summary}</p>

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
                  {p}
                </p>
              ))}
              <ResourceList resources={tip.resources} />
            </div>
          )}
        </>
      )}

      {tip.feedback ? <FeedbackSummary tip={tip} /> : <FeedbackForm tip={tip} onSubmit={onSubmitFeedback} />}
    </div>
  );
}

function ArchiveRow({ tip }: { tip: AiTip }) {
  const [open, setOpen] = useState(false);
  const paragraphs = tip.details.split(/\n{2,}/).filter(Boolean);
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
        <div className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
          <p className="whitespace-pre-line text-sm text-ink-2">{tip.summary}</p>
          {paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-line text-sm text-ink-3">
              {p}
            </p>
          ))}
          <ResourceList resources={tip.resources} />
          <FeedbackSummary tip={tip} />
        </div>
      )}
    </li>
  );
}

export default function AiTipsSection() {
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

  async function handleSubmitFeedback(input: AiTipFeedbackInput) {
    if (!today) return;
    try {
      const res = await fetch("/api/ai-tips/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today.date, ...input }),
      });
      const json = await res.json();
      if (json.tip) mutate({ today: json.tip, archive }, { revalidate: false });
    } catch {
      mutate();
    }
  }

  return (
    // border-t-fuchsia-400 må matche SECTION_ACCENT.aitips — se sectionAccents.ts.
    <div className="border-t-2 border-t-fuchsia-400/60 p-4">
      <CardHeader title="AI-tips" icon={Sparkles} iconColorClass={ACCENT_TEXT} />

      {isLoading ? (
        <SkeletonRows count={2} className="h-16" />
      ) : today ? (
        <TodayCard tip={today} onSubmitFeedback={handleSubmitFeedback} />
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
                <ArchiveRow key={tip.date} tip={tip} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
