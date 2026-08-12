"use client";

import { useState } from "react";
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
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={
        count > 0
          ? "inline-flex items-center rounded-full bg-surface-3 px-2.5 py-1 text-2xs font-medium text-ink-2 transition hover:bg-surface-3/70"
          : "inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-medium text-ink-4 transition hover:text-ink-2"
      }
    >
      {count > 0 ? `Notat (${count})` : "+ notat"}
    </button>
  );
}

export function CommentThreadBody({
  comments,
  onAdd,
  onDelete,
  accentClassName = "bg-accent hover:bg-accent/85",
}: {
  comments: Comment[];
  onAdd: (tekst: string) => void;
  onDelete: (commentId: string, preview: string) => void;
  accentClassName?: string;
}) {
  const [draft, setDraft] = useState("");

  function submit() {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      {comments.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {[...comments]
            .sort((a, b) => a.opprettet.localeCompare(b.opprettet))
            .map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap text-sm text-ink-2">{c.tekst}</p>
                  <p className="mt-0.5 text-2xs text-ink-4">{formatDateTime(c.opprettet)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(c.id, c.tekst)}
                  aria-label="Slett kommentar"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-base leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
                >
                  ×
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
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim()}
          className={`self-start rounded-lg px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition disabled:opacity-40 ${accentClassName}`}
        >
          Legg til
        </button>
      </div>
    </div>
  );
}
