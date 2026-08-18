"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { CARD_SHELL, CardHeader, CollapsibleBody, ConfirmDialog, MutationError, SkeletonRows, useConfirmDelete, useMutationError, usePersistedCollapse } from "../CardShell";
import type { Note } from "@/lib/notes";
import { Pin, StickyNote, X } from "lucide-react";

// Stabil referanse for "ingen data ennå" — unngår at `notes` blir en ny
// array-instans hver render (som ville trigget useMemo("filtered") unødig).
const EMPTY_NOTES: Note[] = [];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NoteForm({ onCancel, onSave }: { onCancel: () => void; onSave: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      if (await onSave(text.trim())) setText("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Idé eller notat..."
        rows={3}
        className="rounded-lg border border-transparent bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!text.trim() || submitting}
          className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </div>
  );
}

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function firstLine(text: string): string {
  const idx = text.indexOf("\n");
  return idx === -1 ? text : text.slice(0, idx);
}

function NoteEditForm({ note, onCancel, onSave }: { note: Note; onCancel: () => void; onSave: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState(note.text);
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSave(text.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        rows={4}
        className="rounded-lg border border-transparent bg-surface-1 px-3 py-2 text-sm text-ink-1 outline-none focus:border-line-strong"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!text.trim() || submitting}
          className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </div>
  );
}

function NoteAppendForm({ onCancel, onSave }: { onCancel: () => void; onSave: (extra: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSave(text.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Ekstra tekst..."
        rows={2}
        className="rounded-lg border border-transparent bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!text.trim() || submitting}
          className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
        >
          Legg til
        </button>
      </div>
    </div>
  );
}

// Bare første linje vises som "header" i lista — man drilling ned (trykk raden)
// for å se hele notatet, i stedet for at alt limes rett i lista. Fra utvidet
// visning kan man redigere hele teksten, legge til mer tekst på slutten uten
// å måtte skrive alt på nytt, eller pinne notatet til toppen av lista.
function NoteRow({
  note,
  expanded,
  onToggle,
  onRemove,
  onSaveEdit,
  onAppend,
  onTogglePin,
}: {
  note: Note;
  expanded: boolean;
  onToggle: () => void;
  onRemove: (note: Note) => void;
  onSaveEdit: (id: string, text: string) => Promise<boolean>;
  onAppend: (id: string, extra: string) => Promise<boolean>;
  onTogglePin: (note: Note) => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "append">("view");

  // Avledet i render (ikke useEffect) — reagerer på expanded-prop-endring uten
  // en ekstra effekt-runde.
  const [prevExpanded, setPrevExpanded] = useState(expanded);
  if (expanded !== prevExpanded) {
    setPrevExpanded(expanded);
    if (!expanded) setMode("view");
  }

  return (
    <div className={`rounded-xl border px-3 py-2 ${note.pinned ? "border-amber-400/50 bg-amber-400/8" : "border-line bg-surface-2"}`}>
      <div className="flex items-start gap-2">
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="min-w-0 flex-1 text-left">
          <p className={`text-sm font-medium text-ink-1 ${expanded ? "whitespace-pre-wrap" : "truncate"}`}>
            {expanded ? note.text : firstLine(note.text)}
          </p>
          {!expanded && <p className="mt-0.5 text-2xs text-ink-4">{formatDateTime(note.createdAt)}</p>}
        </button>
        <button
          type="button"
          onClick={() => onTogglePin(note)}
          aria-label={note.pinned ? "Løsne fra toppen" : "Pin til toppen"}
          aria-pressed={!!note.pinned}
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition hover:bg-surface-3 ${note.pinned ? "text-amber-400" : "text-ink-4"}`}
        >
          <Pin className="h-3.5 w-3.5" fill={note.pinned ? "currentColor" : "none"} />
        </button>
        <button
          type="button"
          onClick={() => onRemove(note)}
          aria-label="Slett notat"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && mode === "view" && (
        <div className="mt-1.5 flex items-center gap-3">
          <p className="text-2xs text-ink-4">{formatDateTime(note.createdAt)}</p>
          <button type="button" onClick={() => setMode("edit")} className="ml-auto text-xs font-medium text-accent-privat hover:text-accent-privat/80">
            Rediger
          </button>
          <button type="button" onClick={() => setMode("append")} className="text-xs font-medium text-accent-privat hover:text-accent-privat/80">
            + Legg til tekst
          </button>
        </div>
      )}
      {expanded && mode === "edit" && (
        <div className="mt-1.5">
          <NoteEditForm
            note={note}
            onCancel={() => setMode("view")}
            onSave={async (text) => {
              const ok = await onSaveEdit(note.id, text);
              if (ok) setMode("view");
              return ok;
            }}
          />
        </div>
      )}
      {expanded && mode === "append" && (
        <div className="mt-1.5">
          <NoteAppendForm
            onCancel={() => setMode("view")}
            onSave={async (extra) => {
              const ok = await onAppend(note.id, extra);
              if (ok) setMode("view");
              return ok;
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function NotesSection() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Notater", true);
  const { data, isLoading: loading, mutate: mutateNotes } = useSWR<{ notes: Note[] }>("/api/notes", jsonFetcher);
  const notes = data?.notes ?? EMPTY_NOTES;
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);
  const confirmDelete = useConfirmDelete<Note>();
  const mutationError = useMutationError();

  const filtered = useMemo(() => {
    if (!query.trim()) return notes;
    const q = query.trim().toLowerCase();
    return notes.filter((n) => n.text.toLowerCase().includes(q));
  }, [notes, query]);
  const visibleNotes = filtered.slice(0, visibleCount);

  function openAddForm() {
    if (collapsed) toggleCollapsed();
    setShowForm(true);
  }

  async function handleAdd(text: string): Promise<boolean> {
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        mutationError.show("Kunne ikke legge til notatet. Prøv igjen.");
        return false;
      }
      const created: Note = await res.json();
      mutateNotes((current) => current && { notes: [created, ...current.notes] }, { revalidate: false });
      setShowForm(false);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      return true;
    } catch {
      mutationError.show("Kunne ikke legge til notatet. Prøv igjen.");
      return false;
    }
  }

  async function handleRemove(note: Note) {
    let previous: Note[] = [];
    mutateNotes(
      (current) => {
        previous = current?.notes ?? [];
        return current && { notes: current.notes.filter((n) => n.id !== note.id) };
      },
      { revalidate: false },
    );
    try {
      const res = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutateNotes({ notes: previous }, { revalidate: false });
      mutationError.show("Kunne ikke slette notatet. Prøv igjen.");
    }
  }

  async function handleSaveEdit(id: string, text: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("save failed");
      const updated: Note = await res.json();
      mutateNotes(
        (current) => current && { notes: sortNotes(current.notes.map((n) => (n.id === id ? updated : n))) },
        { revalidate: false },
      );
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      return true;
    } catch {
      mutationError.show("Kunne ikke lagre endringene. Prøv igjen.");
      return false;
    }
  }

  async function handleAppend(id: string, extra: string): Promise<boolean> {
    const current = notes.find((n) => n.id === id);
    if (!current) return false;
    return handleSaveEdit(id, `${current.text}\n\n${extra}`);
  }

  async function handleTogglePin(note: Note) {
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !note.pinned }),
      });
      if (!res.ok) throw new Error("pin failed");
      const updated: Note = await res.json();
      mutateNotes(
        (current) => current && { notes: sortNotes(current.notes.map((n) => (n.id === note.id ? updated : n))) },
        { revalidate: false },
      );
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutationError.show("Kunne ikke oppdatere notatet. Prøv igjen.");
    }
  }

  return (
    <div className={`${CARD_SHELL} border-t-2 border-t-amber-400/60 p-4`}>
      <CardHeader
        title="Notater"
        subtitle={notes.length > 0 ? `${notes.length} notater` : "Tomt"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        onAdd={openAddForm}
        addLabel="Nytt notat"
        icon={StickyNote}
        iconColorClass="text-amber-400"
      />
      <CollapsibleBody collapsed={collapsed}>
        <div className="flex flex-col gap-2">
          <MutationError message={mutationError.message} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søk i notater..."
            aria-label="Søk i notater"
            className="rounded-lg border border-transparent bg-surface-2 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
          />

          {showForm && <NoteForm onCancel={() => setShowForm(false)} onSave={handleAdd} />}

          {loading ? (
            <SkeletonRows count={2} />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-ink-3">{query.trim() ? "Ingen treff." : "Ingen notater ennå."}</p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                {visibleNotes.map((n) => (
                  <NoteRow
                    key={n.id}
                    note={n}
                    expanded={expandedId === n.id}
                    onToggle={() => setExpandedId((v) => (v === n.id ? null : n.id))}
                    onRemove={confirmDelete.request}
                    onSaveEdit={handleSaveEdit}
                    onAppend={handleAppend}
                    onTogglePin={handleTogglePin}
                  />
                ))}
              </div>
              {filtered.length > visibleCount && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((v) => v + 10)}
                  className="self-start text-xs font-medium text-ink-3 hover:text-ink-1"
                >
                  {`Mer (${filtered.length - visibleCount})`}
                </button>
              )}
            </>
          )}
        </div>
      </CollapsibleBody>
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={
          confirmDelete.pending
            ? `Slette notatet «${confirmDelete.pending.text.slice(0, 60)}${confirmDelete.pending.text.length > 60 ? "…" : ""}»?`
            : ""
        }
        onCancel={confirmDelete.cancel}
        onConfirm={() => {
          if (confirmDelete.pending) handleRemove(confirmDelete.pending);
          confirmDelete.cancel();
        }}
      />
    </div>
  );
}
