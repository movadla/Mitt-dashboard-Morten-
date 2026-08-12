"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

export const CARD_SHELL = "rounded-2xl border border-line bg-surface-1 shadow-md shadow-black/15";

const KPI_COLLAPSED_KEY = "mitt-dashboard:kpi-collapsed:v1";

export function usePersistedCollapse(key: string, defaultCollapsed = false): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KPI_COLLAPSED_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, boolean>;
        if (key in parsed) setCollapsed(parsed[key]);
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const stored = window.localStorage.getItem(KPI_COLLAPSED_KEY);
      const parsed: Record<string, boolean> = stored ? JSON.parse(stored) : {};
      parsed[key] = collapsed;
      window.localStorage.setItem(KPI_COLLAPSED_KEY, JSON.stringify(parsed));
    } catch {
      /* ignore quota errors */
    }
  }, [collapsed, hydrated, key]);

  return [collapsed, () => setCollapsed((v) => !v)];
}

// Lar brukeren dra kort til egen rekkefølge (f.eks. flytte Sport-kortet opp en
// periode) — rent lokalt UI-preferanse, samme localStorage-mønster som
// usePersistedCollapse. Ukjente/fjernede id-er luket bort ved lasting, nye
// id-er (f.eks. et nytt kort lagt til i en senere versjon) legges til på slutten
// i stedet for å forsvinne, slik at rekkefølgen aldri mister et kort.
export function usePersistedOrder(storageKey: string, defaultOrder: string[]): [string[], (order: string[]) => void] {
  const [order, setOrder] = useState<string[]>(defaultOrder);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        const known = new Set(defaultOrder);
        const kept = parsed.filter((id) => known.has(id));
        const missing = defaultOrder.filter((id) => !kept.includes(id));
        setOrder([...kept, ...missing]);
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
    // defaultOrder er stabil per kalleside (definert utenfor komponenten) — kun storageKey skal trigge re-lasting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(order));
    } catch {
      /* ignore quota errors */
    }
  }, [order, hydrated, storageKey]);

  return [order, setOrder];
}

export function CardHeader({
  title,
  subtitle,
  collapsed,
  onToggleCollapse,
  onAdd,
  addLabel,
  icon: Icon,
  iconColorClass = "text-ink-3",
  alwaysShowSubtitle = false,
}: {
  title: string;
  subtitle?: React.ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onAdd?: () => void;
  addLabel?: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconColorClass?: string;
  // Kollapset kort viser normalt KUN tittelen — ingen forhåndsvisningstekst
  // (tall, status osv.). Sett denne når subtitle er en aktiv frist/nedtelling
  // (f.eks. FPL-deadline) som er nyttig å se selv når kortet er lukket.
  alwaysShowSubtitle?: boolean;
}) {
  const showSubtitle = subtitle && (alwaysShowSubtitle || !collapsed);

  const inner = (
    <>
      <div className="flex min-w-0 items-center gap-1.5">
        {Icon && <Icon className={`h-4 w-4 shrink-0 ${iconColorClass}`} />}
        <h3 className="truncate text-sm font-semibold text-ink-1">{title}</h3>
      </div>
      <div className="flex shrink-0 items-baseline gap-2">
        {showSubtitle && <span className="text-xs tabular-nums text-ink-3">{subtitle}</span>}
        {onToggleCollapse && (
          <svg
            viewBox="0 0 16 16"
            className={`h-3.5 w-3.5 text-ink-3 transition-transform ${collapsed ? "-rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        )}
      </div>
    </>
  );

  // Egen knapp ved siden av (ikke inni) collapse-toggle-knappen — en <button>
  // inni en <button> er ugyldig HTML og ville uansett trigget begge handlingene.
  const addButton = onAdd && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onAdd();
      }}
      aria-label={addLabel ?? `Legg til i ${title}`}
      title={addLabel ?? `Legg til i ${title}`}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-surface-2 hover:text-ink-1"
    >
      <Plus className="h-4 w-4" />
    </button>
  );

  if (!onToggleCollapse) {
    return (
      <div className="mb-2 flex items-center justify-between gap-2">
        {inner}
        {addButton}
      </div>
    );
  }

  if (!onAdd) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={collapsed ? `Vis ${title}` : `Skjul ${title}`}
        aria-expanded={!collapsed}
        className="-mx-1 mb-2 flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left transition hover:bg-surface-2/60 active:opacity-80"
      >
        {inner}
      </button>
    );
  }

  return (
    <div className="-mx-1 mb-2 flex items-center gap-1">
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={collapsed ? `Vis ${title}` : `Skjul ${title}`}
        aria-expanded={!collapsed}
        className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left transition hover:bg-surface-2/60 active:opacity-80"
      >
        {inner}
      </button>
      {addButton}
    </div>
  );
}

// Delt bekreftelsesdialog foran destruktive handlinger (sletting) — brukes IKKE
// foran avhuking/toggle, kun der data faktisk forsvinner permanent.
export function ConfirmDialog({
  open,
  title = "Er du sikker?",
  message,
  confirmLabel = "Slett",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line-strong bg-surface-1 p-4 shadow-xl shadow-black/30"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <h3 className="text-sm font-semibold text-ink-1">{title}</h3>
        <p className="mt-1.5 text-sm text-ink-3">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-3 transition hover:text-ink-1"
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-status-danger px-3 py-1.5 text-sm font-semibold text-surface-0 transition hover:bg-status-danger/85"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Liten hjelper for "trykk slett -> vis bekreftelse -> slett for ekte": holder
// hvilket element (id eller annen nøkkel) som venter på bekreftelse.
export function useConfirmDelete<T = string>() {
  const [pending, setPending] = useState<T | null>(null);
  return {
    pending,
    isOpen: pending !== null,
    request: (item: T) => setPending(item),
    cancel: () => setPending(null),
  };
}

export function SkeletonRows({ count = 2, className = "h-12" }: { count?: number; className?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />
      ))}
    </div>
  );
}
