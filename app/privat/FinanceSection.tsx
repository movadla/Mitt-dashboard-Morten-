"use client";

import { CARD_SHELL, CardHeader, usePersistedCollapse } from "../CardShell";

export default function FinanceSection() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Økonomi", true);

  return (
    <div className={`${CARD_SHELL} p-4`}>
      <CardHeader title="Økonomi" subtitle="Ukentlig" collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      {!collapsed && (
        <p className="text-sm text-ink-3">
          Ingen data lagt inn ennå. Her kommer lån, sparing og lønn.
        </p>
      )}
    </div>
  );
}
