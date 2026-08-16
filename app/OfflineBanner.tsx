"use client";

import { useSyncExternalStore } from "react";

// navigator.onLine er en ekte ekstern kilde (nettleseren) — useSyncExternalStore
// er Reacts egen anbefalte løsning for akkurat dette (abonnere på en ekstern
// mutable verdi), i stedet for useEffect+useState som krever en ekstra
// render-runde og trigget lint-regelen for setState-i-effekt.
function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true; // anta online ved SSR — korrigeres umiddelbart ved hydrering
}

export default function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (online) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 bg-status-warning text-center text-xs font-medium text-surface-0"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <p className="py-1.5">Frakoblet — viser sist lagrede data</p>
    </div>
  );
}
