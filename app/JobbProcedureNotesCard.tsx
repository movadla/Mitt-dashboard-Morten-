"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CARD_SHELL, CardHeader, ConfirmDialog, SkeletonRows, useConfirmDelete, usePersistedCollapse } from "./CardShell";
import type { ProcedureNote } from "@/lib/procedureNotes";
import { Plus } from "lucide-react";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NoteForm({ onCancel, onSave }: { onCancel: () => void; onSave: (input: { title: string; text: string }) => void }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");

  function save() {
    if (!title.trim() || !text.trim()) return;
    onSave({ title: title.trim(), text: text.trim() });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Tittel"
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Notat..."
        rows={3}
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!title.trim() || !text.trim()}
          className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </div>
  );
}

function NoteRow({ note, onRemove }: { note: ProcedureNote; onRemove: (note: ProcedureNote) => void }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-ink-1">{note.title}</p>
        <button
          type="button"
          onClick={() => onRemove(note)}
          aria-label="Slett notat"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
        >
          ×
        </button>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{note.text}</p>
      <p className="mt-1.5 text-2xs text-ink-4">{formatDateTime(note.createdAt)}</p>
    </div>
  );
}

export default function JobbProcedureNotesCard() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Prosedyrenotater", true);
  const [notes, setNotes] = useState<ProcedureNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const confirmDelete = useConfirmDelete<ProcedureNote>();

  const load = useCallback(() => {
    fetch("/api/procedure-notes")
      .then((r) => r.json())
      .then((d) => setNotes((d.notes ?? []) as ProcedureNote[]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("mitt-dashboard:jobb-refresh", load);
    return () => window.removeEventListener("mitt-dashboard:jobb-refresh", load);
  }, [load]);

  const filtered = useMemo(() => {
    if (!query.trim()) return notes;
    const q = query.trim().toLowerCase();
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.text.toLowerCase().includes(q));
  }, [notes, query]);

  async function handleAdd(input: { title: string; text: string }) {
    const res = await fetch("/api/procedure-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.ok) {
      const created: ProcedureNote = await res.json();
      setNotes((prev) => [created, ...prev]);
      setShowForm(false);
      window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
    }
  }

  async function handleRemove(note: ProcedureNote) {
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
    await fetch(`/api/procedure-notes/${note.id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
  }

  return (
    <div className={`${CARD_SHELL} p-4`}>
      <CardHeader title="Prosedyrenotater" subtitle={`${notes.length} notater`} collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      {!collapsed && (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søk i notater..."
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
          />

          {showForm ? (
            <NoteForm onCancel={() => setShowForm(false)} onSave={handleAdd} />
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              aria-label="Nytt notat"
              title="Nytt notat"
              className="grid h-9 w-9 place-items-center self-start rounded-xl border border-dashed border-line text-ink-3 transition hover:border-line-strong hover:text-ink-1"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}

          {loading ? (
            <SkeletonRows count={2} />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-ink-3">{query.trim() ? "Ingen treff." : "Ingen notater ennå."}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filtered.map((n) => (
                <NoteRow key={n.id} note={n} onRemove={confirmDelete.request} />
              ))}
            </div>
          )}
        </div>
      )}
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
