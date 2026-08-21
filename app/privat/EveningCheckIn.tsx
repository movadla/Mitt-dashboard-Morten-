"use client";

import { useState } from "react";
import type { EveningLogEntry } from "@/lib/eveningLog";
import { formatDMY } from "@/lib/payday";

// Fast, hardkodet liste (ikke Redis-backet/redigerbar som handleliste sine
// "quick-picks") — en liten, sjelden-endret liste er riktig kompleksitetsnivå
// her. Kategorisering/analyse av dataen er en bevisst fremtidig oppgave.
const CATEGORIES: { key: string; label: string }[] = [
  { key: "alfred", label: "Permisjon med Alfred" },
  { key: "dart", label: "Dart på Ly" },
  { key: "familie", label: "Rolig kveld med familien" },
  { key: "jobb", label: "Jobb" },
  { key: "sosialt", label: "Sosialt/venner" },
  { key: "trening", label: "Trening" },
  { key: "reise", label: "Reise/bortreist" },
];

function categoryLabels(categories: string[]): string[] {
  return categories.map((k) => CATEGORIES.find((c) => c.key === k)?.label ?? k);
}

// "I dag"-boksens dag-navigering går kun FREMOVER i tid (viewedOffset er
// klemt til minimum 0 — den er bygget for å se hva som kommer, ikke for å
// bla i historikk), så den kan ikke gjenbrukes til å se tidligere kvelder.
// Egen enkel liste her i stedet — samme "Mer (N)"-mønster som Notater/
// Handleliste (lokal visibleCount + slice), ingen delt hook å gjenbruke.
function EveningLogHistory({ entries }: { entries: EveningLogEntry[] }) {
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);
  if (entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-ink-3 hover:text-ink-1">
        {open ? "Skjul tidligere kvelder" : `Tidligere kvelder (${sorted.length})`}
      </button>
      {open && (
        <>
          <ul className="mt-1.5 flex flex-col gap-1.5 border-l border-line pl-2.5">
            {sorted.slice(0, visibleCount).map((e) => {
              const labels = categoryLabels(e.categories);
              return (
                <li key={e.date} className="text-sm">
                  <span className="text-xs tabular-nums text-ink-4">{formatDMY(e.date)}</span>
                  {labels.length > 0 && <span className="ml-1.5 text-ink-2">{labels.join(", ")}</span>}
                  {e.notes && <p className="text-ink-1">{e.notes}</p>}
                </li>
              );
            })}
          </ul>
          {sorted.length > visibleCount && (
            <button
              type="button"
              onClick={() => setVisibleCount((v) => v + 10)}
              className="mt-1.5 text-xs font-medium text-ink-3 hover:text-ink-1"
            >
              Mer ({sorted.length - visibleCount})
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function EveningCheckIn({
  entry,
  pastEntries,
  onSave,
}: {
  date: string;
  entry: EveningLogEntry | null;
  pastEntries: EveningLogEntry[];
  onSave: (categories: string[], notes: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(!entry);
  const [categories, setCategories] = useState<string[]>(entry?.categories ?? []);
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  function startEdit() {
    setCategories(entry?.categories ?? []);
    setNotes(entry?.notes ?? "");
    setEditing(true);
  }

  function toggleCategory(key: string) {
    setCategories((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function handleSave() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSave(categories, notes.trim());
      setEditing(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (!editing && entry) {
    const labels = categoryLabels(entry.categories);
    return (
      <div className="flex flex-col gap-1.5">
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {labels.map((label) => (
              <span key={label} className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs text-ink-2">
                {label}
              </span>
            ))}
          </div>
        )}
        {entry.notes && <p className="text-sm text-ink-1">{entry.notes}</p>}
        {labels.length === 0 && !entry.notes && <p className="text-sm text-ink-3">Ingen kryss denne kvelden.</p>}
        <button
          type="button"
          onClick={startEdit}
          className="self-start text-xs font-medium text-accent-privat hover:text-accent-privat/80"
        >
          Rediger
        </button>
        <EveningLogHistory entries={pastEntries} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => {
          const active = categories.includes(c.key);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => toggleCategory(c.key)}
              aria-pressed={active}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? "border-accent-privat/40 bg-accent-privat/15 text-accent-privat"
                  : "border-line text-ink-3 hover:border-line-strong hover:text-ink-1"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Notat om kvelden (valgfritt)..."
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <div className="flex items-center gap-2">
        {entry && (
          <button type="button" onClick={() => setEditing(false)} className="text-xs font-medium text-ink-4 hover:text-ink-2">
            Avbryt
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
      <EveningLogHistory entries={pastEntries} />
    </div>
  );
}
