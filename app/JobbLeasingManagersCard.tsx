"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_SHELL, CardHeader, ConfirmDialog, SkeletonRows, useConfirmDelete, usePersistedCollapse } from "./CardShell";
import type { LeasingManager } from "@/lib/leasingManagers";
import { Users } from "lucide-react";

function ManagerForm({
  initial,
  onCancel,
  onSave,
}: {
  initial?: LeasingManager;
  onCancel: () => void;
  onSave: (input: { name: string; ansvar: string; email?: string }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [ansvar, setAnsvar] = useState(initial?.ansvar ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");

  function save() {
    if (!name.trim() || !ansvar.trim()) return;
    onSave({ name: name.trim(), ansvar: ansvar.trim(), email: email.trim() || undefined });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Navn"
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <input
        type="text"
        value={ansvar}
        onChange={(e) => setAnsvar(e.target.value)}
        placeholder="Ansvarsområde (f.eks. CC Vest)"
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="E-post (valgfritt)"
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!name.trim() || !ansvar.trim()}
          className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </div>
  );
}

function ManagerRow({
  manager,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
}: {
  manager: LeasingManager;
  editing: boolean;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, input: { name: string; ansvar: string; email?: string }) => void;
  onRemove: (manager: LeasingManager) => void;
}) {
  if (editing) {
    return <ManagerForm initial={manager} onCancel={onCancelEdit} onSave={(input) => onSaveEdit(manager.id, input)} />;
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
      <button type="button" onClick={() => onStartEdit(manager.id)} className="min-w-0 flex-1 text-left">
        <p className="text-sm font-medium text-ink-1">{manager.name}</p>
        <p className="mt-0.5 text-2xs text-ink-4">{manager.ansvar}</p>
      </button>
      {manager.email ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <a
            href={`mailto:${manager.email}`}
            className="rounded-lg border border-line px-2 py-1 text-2xs font-medium text-ink-2 transition hover:border-line-strong hover:text-ink-1"
          >
            E-post
          </a>
          <a
            href={`https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(manager.email)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-line px-2 py-1 text-2xs font-medium text-ink-2 transition hover:border-line-strong hover:text-ink-1"
          >
            Teams
          </a>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onStartEdit(manager.id)}
          className="shrink-0 text-2xs font-medium text-accent hover:text-accent/80"
        >
          + legg til e-post
        </button>
      )}
      <button
        type="button"
        onClick={() => onRemove(manager)}
        aria-label="Slett utleieansvarlig"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
      >
        ×
      </button>
    </div>
  );
}

export default function JobbLeasingManagersCard() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Utleieansvarlige", true);
  const [managers, setManagers] = useState<LeasingManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const confirmDelete = useConfirmDelete<LeasingManager>();

  const load = useCallback(() => {
    fetch("/api/leasing-managers")
      .then((r) => r.json())
      .then((d) => setManagers((d.managers ?? []) as LeasingManager[]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("mitt-dashboard:jobb-refresh", load);
    return () => window.removeEventListener("mitt-dashboard:jobb-refresh", load);
  }, [load]);

  async function handleAdd(input: { name: string; ansvar: string; email?: string }) {
    const res = await fetch("/api/leasing-managers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.ok) {
      const created: LeasingManager = await res.json();
      setManagers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setShowForm(false);
      window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
    }
  }

  async function handleSaveEdit(id: string, input: { name: string; ansvar: string; email?: string }) {
    const res = await fetch(`/api/leasing-managers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, email: input.email ?? null }),
    });
    if (res.ok) {
      const updated: LeasingManager = await res.json();
      setManagers((prev) => prev.map((m) => (m.id === id ? updated : m)).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingId(null);
      window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
    }
  }

  async function handleRemove(manager: LeasingManager) {
    setManagers((prev) => prev.filter((m) => m.id !== manager.id));
    await fetch(`/api/leasing-managers/${manager.id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
  }

  return (
    <div className={`${CARD_SHELL} border-t-2 border-t-violet-400/60 p-4`}>
      <CardHeader
        title="Utleieansvarlige"
        subtitle={`${managers.length} personer`}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        onAdd={() => setShowForm(true)}
        addLabel="Ny utleieansvarlig"
        icon={Users}
        iconColorClass="text-violet-400"
      />
      {!collapsed && (
        <div className="flex flex-col gap-2">
          {loading ? (
            <SkeletonRows count={2} />
          ) : (
            <div className="flex flex-col gap-1.5">
              {managers.map((m) => (
                <ManagerRow
                  key={m.id}
                  manager={m}
                  editing={editingId === m.id}
                  onStartEdit={setEditingId}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={handleSaveEdit}
                  onRemove={confirmDelete.request}
                />
              ))}
            </div>
          )}

          {showForm && <ManagerForm onCancel={() => setShowForm(false)} onSave={handleAdd} />}
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={`Slette ${confirmDelete.pending?.name ?? ""} fra utleieansvarlige?`}
        onCancel={confirmDelete.cancel}
        onConfirm={() => {
          if (confirmDelete.pending) handleRemove(confirmDelete.pending);
          confirmDelete.cancel();
        }}
      />
    </div>
  );
}
