"use client";

import { useEffect, useState } from "react";

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

export function CardHeader({
  title,
  subtitle,
  collapsed,
  onToggleCollapse,
}: {
  title: string;
  subtitle?: React.ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const inner = (
    <>
      <h3 className="text-sm font-semibold text-ink-1">{title}</h3>
      <div className="flex shrink-0 items-baseline gap-2">
        {subtitle && <span className="text-xs tabular-nums text-ink-3">{subtitle}</span>}
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

  if (!onToggleCollapse) {
    return <div className="mb-3 flex items-baseline justify-between gap-2">{inner}</div>;
  }

  return (
    <button
      type="button"
      onClick={onToggleCollapse}
      aria-label={collapsed ? `Vis ${title}` : `Skjul ${title}`}
      aria-expanded={!collapsed}
      className="-mx-1 mb-3 flex w-full items-baseline justify-between gap-2 rounded-lg px-1 py-1.5 text-left transition hover:bg-surface-2/60 active:opacity-80"
    >
      {inner}
    </button>
  );
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
