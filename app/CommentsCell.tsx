"use client";

import { useState } from "react";
import { MessageSquare, X } from "lucide-react";
import type { Comment } from "@/lib/comments";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CommentBadge({
  count,
  open,
  onClick,
}: {
  count: number;
  open: boolean;
  onClick: () => void;
}) {
  // Ved 0 kommentarer: et lite, stille ikon (ingen "+ notat"-tekst som
  // konkurrerer med selve påminnelsen på hver eneste rad) — men fortsatt
  // klikkbart, siden dette er eneste sted man kan legge til det aller
  // første notatet på en eksisterende påminnelse.
  if (count === 0) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-expanded={open}
        aria-label="Legg til notat"
        title="Legg til notat"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-ink-2"
      >
        <MessageSquare className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="inline-flex items-center rounded-full bg-surface-3 px-2.5 py-1 text-2xs font-medium text-ink-2 transition hover:bg-surface-3/70"
    >
      {`Notat (${count})`}
    </button>
  );
}

export function CommentThreadBody({
  comments,
  onAdd,
  onDelete,
  onToggleRelevance,
  accentClassName = "bg-accent hover:bg-accent/85",
}: {
  comments: Comment[];
  onAdd: (tekst: string) => Promise<boolean>;
  onDelete: (commentId: string, preview: string) => void;
  onToggleRelevance: (commentId: string, ikkeRelevant: boolean) => void;
  accentClassName?: string;
}) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!draft.trim() || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onAdd(draft);
      if (ok) setDraft("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {comments.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {[...comments]
            .sort((a, b) => a.opprettet.localeCompare(b.opprettet))
            .map((c) => (
              <li
                key={c.id}
                className={`flex items-start justify-between gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 ${c.ikkeRelevant ? "opacity-50" : ""}`}
              >
                <div className="min-w-0">
                  <p className={`whitespace-pre-wrap text-sm text-ink-2 ${c.ikkeRelevant ? "line-through" : ""}`}>{c.tekst}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-2xs text-ink-4">
                    <span>{formatDateTime(c.opprettet)}</span>
                    <label className="flex items-center gap-1 cursor-pointer hover:text-ink-2">
                      <input
                        type="checkbox"
                        checked={Boolean(c.ikkeRelevant)}
                        onChange={(e) => onToggleRelevance(c.id, e.target.checked)}
                        className="h-3 w-3 rounded border-line accent-ink-4"
                      />
                      Ikke lenger relevant
                    </label>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(c.id, c.tekst)}
                  aria-label="Slett kommentar"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
        </ul>
      )}
      <div className="flex flex-col gap-1.5 sm:flex-row">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Skriv en kommentar…"
          rows={2}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-surface-1 px-2.5 py-1.5 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim() || submitting}
          className={`self-start rounded-lg px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition disabled:opacity-40 ${accentClassName}`}
        >
          Legg til
        </button>
      </div>
    </div>
  );
}
