"use client";

import { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

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
