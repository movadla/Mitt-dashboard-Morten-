"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_SHELL, CardHeader, CollapsibleBody, ConfirmDialog, SkeletonRows, useConfirmDelete, usePersistedCollapse } from "../CardShell";
import type { ShoppingItem, StoreSection } from "@/lib/shoppingList";
import type { QuickPick } from "@/lib/shoppingQuickPicks";
import { vibrate } from "@/lib/haptics";
import SwipeableRow from "./SwipeableRow";
import { Pencil, ShoppingCart } from "lucide-react";

// Hver seksjon får en egen fast farge, gjenbrukt fra de eksisterende fargetokenene
// i app/globals.css, slik at varelisten er rask å skanne på vei gjennom butikken.
const SECTION_ORDER: StoreSection[] = [
  "frukt-gront",
  "frysevarer",
  "palegg",
  "meieriprodukter",
  "drikke",
  "snacks",
  "torrvarer",
  "baby",
  "elektro",
  "snop",
  "annet",
];

const SECTION_META: Record<StoreSection, { label: string; bg: string; text: string }> = {
  "frukt-gront": { label: "Frukt & grønt", bg: "bg-status-positive/8", text: "text-status-positive" },
  frysevarer: { label: "Frysevarer", bg: "bg-source-teams/8", text: "text-source-teams" },
  palegg: { label: "Pålegg", bg: "bg-status-warning/8", text: "text-status-warning" },
  meieriprodukter: { label: "Meieriprodukter", bg: "bg-accent/8", text: "text-accent" },
  drikke: { label: "Drikke", bg: "bg-accent-privat/8", text: "text-accent-privat" },
  snacks: { label: "Snacks", bg: "bg-source-outlook/8", text: "text-source-outlook" },
  torrvarer: { label: "Tørrvarer", bg: "bg-source-asana/8", text: "text-source-asana" },
  baby: { label: "Baby", bg: "bg-status-action/8", text: "text-status-action" },
  elektro: { label: "Elektro", bg: "bg-cyan-500/8", text: "text-cyan-400" },
  snop: { label: "Snop", bg: "bg-status-danger/8", text: "text-status-danger" },
  annet: { label: "Annet", bg: "bg-slate-500/8", text: "text-slate-300" },
};

const VISIBLE_QUICK_PICKS = 10;

function ItemEditForm({
  item,
  onCancel,
  onSave,
}: {
  item: ShoppingItem;
  onCancel: () => void;
  onSave: (updates: { name: string; section: StoreSection; quantity?: string }) => void;
}) {
  const [name, setName] = useState(item.name);
  const [section, setSection] = useState<StoreSection>(item.section);
  const [quantity, setQuantity] = useState(item.quantity ?? "");

  function save() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), section, quantity: quantity.trim() || undefined });
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onCancel();
        }}
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 outline-none focus:border-line-strong"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={section}
          onChange={(e) => setSection(e.target.value as StoreSection)}
          className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        >
          {SECTION_ORDER.map((s) => (
            <option key={s} value={s}>
              {SECTION_META[s].label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Mengde (valgfritt)"
          className="w-32 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!name.trim()}
          className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </li>
  );
}

function ItemRow({
  item,
  editing,
  onToggle,
  onRemove,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}: {
  item: ShoppingItem;
  editing: boolean;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, updates: { name: string; section: StoreSection; quantity?: string }) => void;
}) {
  if (editing) {
    return <ItemEditForm item={item} onCancel={onCancelEdit} onSave={(updates) => onSaveEdit(item.id, updates)} />;
  }

  const meta = SECTION_META[item.section];
  return (
    <li>
      <SwipeableRow onSwipeRight={() => onToggle(item.id)} onSwipeLeft={() => onRemove(item.id)} rightLabel={item.done ? "Ikke kjøpt" : "Kjøpt"} leftLabel="Slett">
        <div className={`flex items-center gap-3 rounded-xl ${meta.bg} px-3 py-2`}>
          <button
            type="button"
            onClick={() => onToggle(item.id)}
            aria-pressed={item.done}
            aria-label={item.done ? "Marker som ikke kjøpt" : "Marker som kjøpt"}
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ring-1 transition ${
              item.done ? "bg-emerald-500 ring-emerald-500" : "bg-transparent ring-line-strong hover:ring-line-strong"
            }`}
          >
            {item.done && (
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-surface-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8.5L6.5 12 13 5" />
              </svg>
            )}
          </button>
          <button type="button" onClick={() => onStartEdit(item.id)} aria-label="Rediger vare" className="flex min-w-0 flex-1 items-baseline justify-between gap-2 text-left">
            <p className={`min-w-0 truncate text-sm ${item.done ? "text-ink-4 line-through" : "text-ink-1"}`}>
              {item.name}
              {item.quantity ? ` · ${item.quantity}` : ""}
            </p>
            <span className={`shrink-0 text-2xs ${meta.text}`}>{meta.label}</span>
          </button>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label="Slett vare"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
          >
            ×
          </button>
        </div>
      </SwipeableRow>
    </li>
  );
}

function QuickPickEditForm({
  quickPick,
  onCancel,
  onSave,
}: {
  quickPick: QuickPick;
  onCancel: () => void;
  onSave: (updates: { name: string; section: StoreSection }) => void;
}) {
  const [name, setName] = useState(quickPick.name);
  const [section, setSection] = useState<StoreSection>(quickPick.section);

  function save() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), section });
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onCancel();
        }}
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 outline-none focus:border-line-strong"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={section}
          onChange={(e) => setSection(e.target.value as StoreSection)}
          className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        >
          {SECTION_ORDER.map((s) => (
            <option key={s} value={s}>
              {SECTION_META[s].label}
            </option>
          ))}
        </select>
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!name.trim()}
          className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </li>
  );
}

function QuickPickManageRow({
  quickPick,
  editing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  quickPick: QuickPick;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (updates: { name: string; section: StoreSection }) => void;
  onDelete: () => void;
}) {
  if (editing) {
    return <QuickPickEditForm quickPick={quickPick} onCancel={onCancelEdit} onSave={onSave} />;
  }
  return (
    <li className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
      <p className="min-w-0 flex-1 truncate text-sm text-ink-1">{quickPick.name}</p>
      <span className={`shrink-0 text-2xs ${SECTION_META[quickPick.section].text}`}>{SECTION_META[quickPick.section].label}</span>
      <button
        type="button"
        onClick={onStartEdit}
        aria-label="Rediger hurtigvalg"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-ink-1"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Slett hurtigvalg"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
      >
        ×
      </button>
    </li>
  );
}

export default function ShoppingListSection() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Handleliste", true);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [section, setSection] = useState<StoreSection>("frukt-gront");
  const [quantity, setQuantity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const confirmDelete = useConfirmDelete<string>();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  // Holder en nettopp av/på-huket vare synlig i sin nåværende liste en kort
  // stund — uten denne hopper varen rett over i "Kjøpt"/tilbake med det samme,
  // og man rekker aldri se avkrysningen bli fylt inn. Se RemindersSection.tsx.
  const [justToggledIds, setJustToggledIds] = useState<Set<string>>(new Set());

  const [quickPicks, setQuickPicks] = useState<QuickPick[]>([]);
  const [showAllQuickPicks, setShowAllQuickPicks] = useState(false);
  const [quickPickQuery, setQuickPickQuery] = useState("");
  const [managingQuickPicks, setManagingQuickPicks] = useState(false);
  const [editingQuickPickId, setEditingQuickPickId] = useState<string | null>(null);
  const confirmQuickPickDelete = useConfirmDelete<QuickPick>();

  const load = useCallback(() => {
    fetch("/api/shopping")
      .then((r) => r.json())
      .then((d) => setItems((d.items ?? []) as ShoppingItem[]))
      .finally(() => setLoading(false));
  }, []);

  const loadQuickPicks = useCallback(() => {
    fetch("/api/shopping/quick-picks")
      .then((r) => r.json())
      .then((d) => setQuickPicks((d.quickPicks ?? []) as QuickPick[]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    loadQuickPicks();
    window.addEventListener("mitt-dashboard:privat-refresh", load);
    window.addEventListener("mitt-dashboard:privat-refresh", loadQuickPicks);
    return () => {
      window.removeEventListener("mitt-dashboard:privat-refresh", load);
      window.removeEventListener("mitt-dashboard:privat-refresh", loadQuickPicks);
    };
  }, [load, loadQuickPicks]);

  // Legger varen til selve handlelisten, og bygger samtidig opp/oppdaterer
  // hurtigvalg-katalogen — uansett om varen ble skrevet inn i skjemaet eller
  // valgt direkte fra et hurtigvalg, slik at katalogen vokser organisk av bruk.
  async function addItemToList(itemName: string, itemSection: StoreSection, itemQuantity?: string) {
    const res = await fetch("/api/shopping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: itemName, section: itemSection, quantity: itemQuantity }),
    });
    if (!res.ok) return;
    const created: ShoppingItem = await res.json();
    setItems((prev) => [...prev, created]);
    window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));

    const qpRes = await fetch("/api/shopping/quick-picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: itemName, section: itemSection }),
    });
    if (qpRes.ok) {
      const updated: QuickPick = await qpRes.json();
      setQuickPicks((prev) => {
        const exists = prev.some((p) => p.id === updated.id);
        const next = exists ? prev.map((p) => (p.id === updated.id ? updated : p)) : [...prev, updated];
        return [...next].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "nb"));
      });
    }
  }

  async function handleAdd() {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await addItemToList(name.trim(), section, quantity.trim() || undefined);
      setName("");
      setQuantity("");
      setShowForm(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQuickAdd(qp: QuickPick) {
    vibrate(8);
    await addItemToList(qp.name, qp.section);
  }

  async function handleSaveQuickPick(id: string, updates: { name: string; section: StoreSection }) {
    const res = await fetch(`/api/shopping/quick-picks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated: QuickPick = await res.json();
      setQuickPicks((prev) =>
        prev.map((p) => (p.id === id ? updated : p)).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "nb")),
      );
      setEditingQuickPickId(null);
    }
  }

  async function handleDeleteQuickPick(qp: QuickPick) {
    setQuickPicks((prev) => prev.filter((p) => p.id !== qp.id));
    await fetch(`/api/shopping/quick-picks/${qp.id}`, { method: "DELETE" });
  }

  async function handleToggle(id: string) {
    const res = await fetch(`/api/shopping/${id}`, { method: "PATCH" });
    if (res.ok) {
      const updated: ShoppingItem = await res.json();
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      vibrate(updated.done ? 15 : 8);
      setJustToggledIds((prev) => new Set(prev).add(id));
      setTimeout(() => {
        setJustToggledIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 700);
    }
  }

  async function handleSaveEditItem(id: string, updates: { name: string; section: StoreSection; quantity?: string }) {
    const res = await fetch(`/api/shopping/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...updates, quantity: updates.quantity ?? null }),
    });
    if (res.ok) {
      const updated: ShoppingItem = await res.json();
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      setEditingItemId(null);
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    }
  }

  async function handleRemove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    vibrate([10, 30, 10]);
    await fetch(`/api/shopping/${id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
  }

  async function handleClearDone() {
    setItems((prev) => prev.filter((i) => !i.done));
    await fetch("/api/shopping/clear-done", { method: "POST" });
    window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
  }

  const notDone = items.filter((i) => !i.done || justToggledIds.has(i.id));
  const done = items.filter((i) => i.done || justToggledIds.has(i.id));
  const grouped = SECTION_ORDER.map((s) => ({ section: s, items: notDone.filter((i) => i.section === s) })).filter(
    (g) => g.items.length > 0,
  );
  const isSearchingQuickPicks = quickPickQuery.trim().length > 0;
  const visibleQuickPicks = isSearchingQuickPicks
    ? quickPicks.filter((qp) => qp.name.toLowerCase().includes(quickPickQuery.trim().toLowerCase()))
    : showAllQuickPicks
      ? quickPicks
      : quickPicks.slice(0, VISIBLE_QUICK_PICKS);

  function handleAddClick() {
    if (collapsed) toggleCollapsed();
    setShowForm(true);
  }

  return (
    <div className={`${CARD_SHELL} border-t-2 border-t-cyan-400/60 p-4`}>
      <CardHeader
        title="Handleliste"
        subtitle={notDone.length > 0 ? `${notDone.length} varer` : "Tom"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        onAdd={handleAddClick}
        addLabel="Ny vare"
        icon={ShoppingCart}
        iconColorClass="text-cyan-400"
      />
      <CollapsibleBody collapsed={collapsed}>
        <div className="flex flex-col gap-2">
          {quickPicks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <p className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Hurtigvalg</p>
                <button
                  type="button"
                  onClick={() => {
                    setManagingQuickPicks((v) => !v);
                    setEditingQuickPickId(null);
                  }}
                  className="text-2xs font-medium text-accent-privat hover:text-accent-privat/80"
                >
                  {managingQuickPicks ? "Ferdig" : "Rediger"}
                </button>
              </div>
              {quickPicks.length > VISIBLE_QUICK_PICKS && !managingQuickPicks && (
                <input
                  type="text"
                  value={quickPickQuery}
                  onChange={(e) => setQuickPickQuery(e.target.value)}
                  placeholder="Søk i hurtigvalg..."
                  className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
                />
              )}
              {managingQuickPicks ? (
                <ul className="flex flex-col gap-1.5">
                  {visibleQuickPicks.map((qp) => (
                    <QuickPickManageRow
                      key={qp.id}
                      quickPick={qp}
                      editing={editingQuickPickId === qp.id}
                      onStartEdit={() => setEditingQuickPickId(qp.id)}
                      onCancelEdit={() => setEditingQuickPickId(null)}
                      onSave={(updates) => handleSaveQuickPick(qp.id, updates)}
                      onDelete={() => confirmQuickPickDelete.request(qp)}
                    />
                  ))}
                </ul>
              ) : visibleQuickPicks.length === 0 ? (
                <p className="text-xs text-ink-4">Ingen treff.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {visibleQuickPicks.map((qp) => (
                    <button
                      key={qp.id}
                      type="button"
                      onClick={() => handleQuickAdd(qp)}
                      className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-1 transition hover:border-line-strong hover:bg-surface-3 active:opacity-70"
                    >
                      {qp.name}
                    </button>
                  ))}
                </div>
              )}
              {quickPicks.length > VISIBLE_QUICK_PICKS && !isSearchingQuickPicks && (
                <button
                  type="button"
                  onClick={() => setShowAllQuickPicks((v) => !v)}
                  className="self-start text-xs font-medium text-accent-privat hover:text-accent-privat/80"
                >
                  {showAllQuickPicks ? "Vis mindre" : `Mer (${quickPicks.length - VISIBLE_QUICK_PICKS})`}
                </button>
              )}
            </div>
          )}

          {showForm ? (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-2.5">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") setShowForm(false);
                }}
                placeholder="Ny vare..."
                className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
              />
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value as StoreSection)}
                  className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
                >
                  {SECTION_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {SECTION_META[s].label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Mengde (valgfritt)"
                  className="w-32 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 placeholder-ink-4 outline-none focus:border-line-strong"
                />
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-xs font-medium text-ink-4 hover:text-ink-2"
                >
                  Avbryt
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!name.trim() || submitting}
                  className="ml-auto rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
                >
                  Legg til
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm text-ink-3 transition hover:border-line-strong hover:text-ink-1"
            >
              <span className="text-base leading-none">+</span> Ny vare
            </button>
          )}

          {loading ? (
            <SkeletonRows count={2} />
          ) : notDone.length === 0 ? (
            <p className="text-sm text-ink-3">Handlelisten er tom.</p>
          ) : (
            // Kategorien vises inline til høyre på hver rad (se ItemRow) i
            // stedet for en egen seksjonsoverskrift-linje per gruppe — færre
            // linjer/mindre rot, men rekkefølgen fra `grouped` (SECTION_ORDER)
            // beholdes så varer i samme kategori fortsatt ligger samlet.
            <ul className="flex flex-col gap-1.5">
              {grouped.flatMap((g) => g.items).map((i) => (
                <ItemRow
                  key={i.id}
                  item={i}
                  editing={editingItemId === i.id}
                  onToggle={handleToggle}
                  onRemove={confirmDelete.request}
                  onStartEdit={setEditingItemId}
                  onCancelEdit={() => setEditingItemId(null)}
                  onSaveEdit={handleSaveEditItem}
                />
              ))}
            </ul>
          )}

          {done.length > 0 && (
            <>
              {showDone && (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {done.map((i) => (
                    <ItemRow
                      key={i.id}
                      item={i}
                      editing={editingItemId === i.id}
                      onToggle={handleToggle}
                      onRemove={confirmDelete.request}
                      onStartEdit={setEditingItemId}
                      onCancelEdit={() => setEditingItemId(null)}
                      onSaveEdit={handleSaveEditItem}
                    />
                  ))}
                </ul>
              )}
              <div className="mt-1 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowDone((v) => !v)}
                  className="text-left text-xs font-medium text-accent-privat hover:text-accent-privat/80"
                >
                  {showDone ? "Vis mindre" : `Kjøpt (${done.length})`}
                </button>
                <button type="button" onClick={() => setConfirmClearOpen(true)} className="text-left text-xs font-medium text-ink-4 hover:text-ink-2">
                  Tøm kjøpte
                </button>
              </div>
            </>
          )}
        </div>
      </CollapsibleBody>
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={`Slette «${items.find((i) => i.id === confirmDelete.pending)?.name ?? ""}» fra handlelisten?`}
        onCancel={confirmDelete.cancel}
        onConfirm={() => {
          handleRemove(confirmDelete.pending!);
          confirmDelete.cancel();
        }}
      />
      <ConfirmDialog
        open={confirmClearOpen}
        message={`Tømme ${done.length} kjøpte ${done.length === 1 ? "vare" : "varer"} fra handlelisten?`}
        confirmLabel="Tøm"
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={() => {
          handleClearDone();
          setConfirmClearOpen(false);
        }}
      />
      <ConfirmDialog
        open={confirmQuickPickDelete.isOpen}
        message={confirmQuickPickDelete.pending ? `Slette hurtigvalget «${confirmQuickPickDelete.pending.name}»?` : ""}
        onCancel={confirmQuickPickDelete.cancel}
        onConfirm={() => {
          if (confirmQuickPickDelete.pending) handleDeleteQuickPick(confirmQuickPickDelete.pending);
          confirmQuickPickDelete.cancel();
        }}
      />
    </div>
  );
}
