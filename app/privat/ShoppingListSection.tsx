"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_SHELL, CardHeader, ConfirmDialog, SkeletonRows, useConfirmDelete, usePersistedCollapse } from "../CardShell";
import type { ShoppingItem, StoreSection } from "@/lib/shoppingList";
import { vibrate } from "@/lib/haptics";
import SwipeableRow from "./SwipeableRow";
import { ShoppingCart } from "lucide-react";

// Rekkefølge = typisk gangrute i en dagligvarebutikk (inngang -> kasse).
// Hver seksjon får en egen fast farge, gjenbrukt fra de eksisterende fargetokenene
// i app/globals.css, slik at varelisten er rask å skanne på vei gjennom butikken.
const SECTION_ORDER: StoreSection[] = [
  "frukt-gront",
  "bakervarer",
  "kjott-fisk",
  "meieri",
  "torrvarer",
  "frys",
  "drikke",
  "snacks",
  "husholdning",
];

const SECTION_META: Record<StoreSection, { label: string; bg: string; text: string }> = {
  "frukt-gront": { label: "Frukt & grønt", bg: "bg-status-positive/8", text: "text-status-positive" },
  bakervarer: { label: "Bakervarer", bg: "bg-status-warning/8", text: "text-status-warning" },
  "kjott-fisk": { label: "Kjøtt & fisk", bg: "bg-status-danger/8", text: "text-status-danger" },
  meieri: { label: "Meieri & egg", bg: "bg-accent/8", text: "text-accent" },
  torrvarer: { label: "Tørrvarer", bg: "bg-source-asana/8", text: "text-source-asana" },
  frys: { label: "Frys", bg: "bg-source-teams/8", text: "text-source-teams" },
  drikke: { label: "Drikke", bg: "bg-accent-privat/8", text: "text-accent-privat" },
  snacks: { label: "Snacks & godteri", bg: "bg-source-outlook/8", text: "text-source-outlook" },
  husholdning: { label: "Husholdning & hygiene", bg: "bg-status-action/8", text: "text-status-action" },
};

function ItemRow({
  item,
  onToggle,
  onRemove,
}: {
  item: ShoppingItem;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
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
          <p className={`min-w-0 flex-1 truncate text-sm ${item.done ? "text-ink-4 line-through" : "text-ink-1"}`}>
            {item.name}
            {item.quantity ? ` · ${item.quantity}` : ""}
          </p>
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

  const load = useCallback(() => {
    fetch("/api/shopping")
      .then((r) => r.json())
      .then((d) => setItems((d.items ?? []) as ShoppingItem[]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("mitt-dashboard:privat-refresh", load);
    return () => window.removeEventListener("mitt-dashboard:privat-refresh", load);
  }, [load]);

  async function handleAdd() {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/shopping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, section, quantity: quantity || undefined }),
      });
      if (res.ok) {
        const created: ShoppingItem = await res.json();
        setItems((prev) => [...prev, created]);
        setName("");
        setQuantity("");
        setShowForm(false);
        window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(id: string) {
    const res = await fetch(`/api/shopping/${id}`, { method: "PATCH" });
    if (res.ok) {
      const updated: ShoppingItem = await res.json();
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      vibrate(updated.done ? 15 : 8);
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

  const notDone = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const grouped = SECTION_ORDER.map((s) => ({ section: s, items: notDone.filter((i) => i.section === s) })).filter(
    (g) => g.items.length > 0,
  );

  function handleAddClick() {
    if (collapsed) toggleCollapsed();
    setShowForm(true);
  }

  return (
    <div className={`${CARD_SHELL} p-4`}>
      <CardHeader
        title="Handleliste"
        subtitle={notDone.length > 0 ? `${notDone.length} varer` : "Tom"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        onAdd={handleAddClick}
        addLabel="Ny vare"
        icon={ShoppingCart}
      />
      {!collapsed && (
        <div className="flex flex-col gap-2">
          {showForm ? (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-2.5">
              <input
                type="text"
                autoFocus
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
            <div className="flex flex-col gap-2.5">
              {grouped.map((g) => (
                <div key={g.section} className="flex flex-col gap-1.5">
                  <p className={`text-2xs font-semibold uppercase tracking-wide ${SECTION_META[g.section].text}`}>
                    {SECTION_META[g.section].label}
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {g.items.map((i) => (
                      <ItemRow key={i.id} item={i} onToggle={handleToggle} onRemove={confirmDelete.request} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {done.length > 0 && (
            <>
              {showDone && (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {done.map((i) => (
                    <ItemRow key={i.id} item={i} onToggle={handleToggle} onRemove={confirmDelete.request} />
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
      )}
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
    </div>
  );
}
