"use client";

import { CARD_SHELL, CardHeader, usePersistedCollapse } from "../CardShell";

export default function AlfredSection() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Alfred", true);

  return (
    <div className={`${CARD_SHELL} p-4`}>
      <CardHeader title="Alfred" subtitle="Ukentlig" collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      {!collapsed && (
        <p className="text-sm text-ink-3">
          Ingen utviklingssteg lagt inn ennå. Her kommer status og hva som er neste.
        </p>
      )}
    </div>
  );
}
