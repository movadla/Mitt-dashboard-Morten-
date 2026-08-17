"use client";

import { useSyncExternalStore } from "react";

// Delt "nettopp avhuket"-tilstand for påminnelser — holder en id synlig i
// f.eks. "Nylig fullført" et lite øyeblikk etter avkrysning, slik at man
// rekker se haken fylles inn før raden forsvinner/flytter seg. Delt på tvers
// av TodaySummary, RemindersSection og JobbRemindersSection (som alle leser
// samme underliggende påminnelse-liste) i stedet for at hver komponent har
// sin egen lokale kopi — uten dette gir en avkrysning i én komponent ingen
// synlig fade-effekt i de andre, selv om de viser den samme påminnelsen.
let toggled: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function markJustToggled(id: string, durationMs = 700) {
  toggled = new Set(toggled).add(id);
  notify();
  setTimeout(() => {
    const next = new Set(toggled);
    next.delete(id);
    toggled = next;
    notify();
  }, durationMs);
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): ReadonlySet<string> {
  return toggled;
}

function getServerSnapshot(): ReadonlySet<string> {
  return toggled;
}

export function useJustToggled(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
