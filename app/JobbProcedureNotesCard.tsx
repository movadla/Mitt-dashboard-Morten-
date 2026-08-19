"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { CardHeader, ConfirmDialog, MutationError, SkeletonRows, useConfirmDelete, useMutationError } from "./CardShell";
import type { ProcedureNote } from "@/lib/procedureNotes";
import { FileText, X } from "lucide-react";

// Stabil referanse for "ingen data ennå" — unngår at `notes` blir en ny
// array-instans hver render (som ville trigget useMemo("filtered") unødig).
const EMPTY_NOTES: ProcedureNote[] = [];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NoteForm({ onCancel, onSave }: { onCancel: () => void; onSave: (input: { title: string; text: string }) => Promise<boolean> }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    if (!title.trim() || !text.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSave({ title: title.trim(), text: text.trim() });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Tittel"
        className="rounded-lg border border-transparent bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Notat..."
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
          disabled={!title.trim() || !text.trim() || submitting}
          className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </div>
  );
}

function NoteEditForm({
  note,
  onCancel,
  onSave,
}: {
  note: ProcedureNote;
  onCancel: () => void;
  onSave: (input: { title: string; text: string }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(note.title);
  const [text, setText] = useState(note.text);
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    if (!title.trim() || !text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onSave({ title: title.trim(), text: text.trim() });
      if (ok) onCancel();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded-lg border border-transparent bg-surface-1 px-3 py-2 text-sm text-ink-1 outline-none focus:border-line-strong"
      />
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
          disabled={!title.trim() || !text.trim() || submitting}
          className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </div>
  );
}

function NoteRow({
  note,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
}: {
  note: ProcedureNote;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (input: { title: string; text: string }) => Promise<boolean>;
  onRemove: (note: ProcedureNote) => void;
}) {
  if (editing) {
    return (
      <div className="rounded-xl border border-line-strong bg-surface-2 px-3 py-2">
        <NoteEditForm note={note} onCancel={onCancelEdit} onSave={onSaveEdit} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-ink-1">{note.title}</p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onStartEdit}
            className="text-xs font-medium text-accent hover:text-accent/80"
          >
            Rediger
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
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{note.text}</p>
      <p className="mt-1.5 text-2xs text-ink-4">{formatDateTime(note.createdAt)}</p>
    </div>
  );
}

export default function JobbProcedureNotesCard() {
  const { data, isLoading: loading, mutate: mutateNotes } = useSWR<{ notes: ProcedureNote[] }>("/api/procedure-notes", jsonFetcher);
  const notes = data?.notes ?? EMPTY_NOTES;
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);
  const confirmDelete = useConfirmDelete<ProcedureNote>();
  const mutationError = useMutationError();

  const filtered = useMemo(() => {
    if (!query.trim()) return notes;
    const q = query.trim().toLowerCase();
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.text.toLowerCase().includes(q));
  }, [notes, query]);
  const visibleNotes = filtered.slice(0, visibleCount);

  async function handleAdd(input: { title: string; text: string }): Promise<boolean> {
    try {
      const res = await fetch("/api/procedure-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        mutationError.show("Kunne ikke legge til notatet. Prøv igjen.");
        return false;
      }
      const created: ProcedureNote = await res.json();
      mutateNotes((current) => current && { notes: [created, ...current.notes] }, { revalidate: false });
      setShowForm(false);
      window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
      return true;
    } catch {
      mutationError.show("Kunne ikke legge til notatet. Prøv igjen.");
      return false;
    }
  }

  async function handleRemove(note: ProcedureNote) {
    let previous: ProcedureNote[] = [];
    mutateNotes(
      (current) => {
        previous = current?.notes ?? [];
        return current && { notes: current.notes.filter((n) => n.id !== note.id) };
      },
      { revalidate: false },
    );
    try {
      const res = await fetch(`/api/procedure-notes/${note.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
    } catch {
      mutateNotes({ notes: previous }, { revalidate: false });
      mutationError.show("Kunne ikke slette notatet. Prøv igjen.");
    }
  }

  async function handleSaveEdit(id: string, input: { title: string; text: string }): Promise<boolean> {
    try {
      const res = await fetch(`/api/procedure-notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("save failed");
      const updated: ProcedureNote = await res.json();
      mutateNotes(
        (current) => current && { notes: current.notes.map((n) => (n.id === id ? updated : n)) },
        { revalidate: false },
      );
      window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
      return true;
    } catch {
      mutationError.show("Kunne ikke lagre endringene. Prøv igjen.");
      return false;
    }
  }

  return (
    <div className="border-t-2 border-t-amber-400/60 p-4">
      <CardHeader
        title="Prosedyrenotater"
        subtitle={`${notes.length} notater`}
        onAdd={() => setShowForm(true)}
        addLabel="Nytt notat"
        icon={FileText}
        iconColorClass="text-amber-400"
      />
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
                    editing={editingId === n.id}
                    onStartEdit={() => setEditingId(n.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={(input) => handleSaveEdit(n.id, input)}
                    onRemove={confirmDelete.request}
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
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={`Slette notatet «${confirmDelete.pending?.title ?? ""}»?`}
        onCancel={confirmDelete.cancel}
        onConfirm={() => {
          if (confirmDelete.pending) handleRemove(confirmDelete.pending);
          confirmDelete.cancel();
        }}
      />
    </div>
  );
}
