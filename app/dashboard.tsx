"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Task } from "@/lib/tasks";
import ChatWidget from "./ChatWidget";
import { SkeletonRows } from "./CardShell";

type Mode = "jobb" | "privat";

const MODE_STORAGE_KEY = "mitt-dashboard:mode:v1";

// Begge fanene lastes lazy — hver er en tung bunt (Privat: 13 seksjons-
// komponenter + @dnd-kit; Jobb: JobbView.tsx alene er svært stor). Før var
// KUN Privat lazy, mens Jobb ble importert statisk øverst i filen — det
// betydde at JobbView sin kode ble bundlet og lastet ned uansett, selv for
// en økt som aldri forlater Privat-fanen (som er default-fanen), jf.
// tilbakemelding om treg oppstart.
const PrivatPanel = dynamic(() => import("./privat/PrivatPanel"), {
  loading: () => <div className="mt-6 mb-6"><SkeletonRows count={4} /></div>,
});
const JobbView = dynamic(() => import("./JobbView"), {
  loading: () => <div className="mt-6"><SkeletonRows count={4} /></div>,
});

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Jobb eller privat"
      className="inline-flex shrink-0 rounded-full border border-line-strong bg-surface-2 p-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "jobb"}
        onClick={() => onChange("jobb")}
        className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
          mode === "jobb"
            ? "bg-accent/20 text-accent ring-1 ring-accent/40"
            : "text-ink-3 hover:text-ink-1"
        }`}
      >
        Jobb
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "privat"}
        onClick={() => onChange("privat")}
        className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
          mode === "privat"
            ? "bg-accent-privat/20 text-accent-privat ring-1 ring-accent-privat/40"
            : "text-ink-3 hover:text-ink-1"
        }`}
      >
        Privat
      </button>
    </div>
  );
}

export default function Dashboard({
  tasks,
  today,
  now,
}: {
  tasks: Task[];
  today: string;
  now: string;
}) {
  // Starter som "ukjent" (ikke default "jobb") slik at vi aldri rekker å montere
  // PrivatPanel før vi har lest den lagrede fanen fra localStorage — ellers ville
  // lazy-loadingen over ikke gitt noen reell gevinst for Jobb-brukere, siden
  // PrivatPanel uansett ville blitt lastet på aller første rendering.
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
      // localStorage kan ikke leses under SSR/første render uten hydrerings-
      // avvik — dette MÅ skje i en effekt, ikke avledes i render. Privat er
      // standard ved tom localStorage (Morten sin primære fane).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode(stored === "jobb" ? "jobb" : "privat");
    } catch {
      setMode("privat");
    }
  }, []);

  useEffect(() => {
    if (!mode) return;
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      /* ignore quota errors */
    }
  }, [mode]);

  return (
    <>
      <div className="mx-auto w-full max-w-2xl px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] md:max-w-[1440px] md:px-8">
        <div className="sticky top-0 z-40 pb-3 pt-[calc(env(safe-area-inset-top)+1.5rem)] sm:pt-[calc(env(safe-area-inset-top)+2.5rem)]">
          <div className="flex items-center justify-end gap-3">
            {mode && <ModeToggle mode={mode} onChange={setMode} />}
          </div>
        </div>

        {mode === null ? (
          <div className="mt-6"><SkeletonRows count={4} /></div>
        ) : mode === "jobb" ? (
          <div key="jobb" className="tab-fade mt-6">
            <JobbView tasks={tasks} today={today} now={now} />
          </div>
        ) : (
          <div key="privat" className="tab-fade mt-6 mb-6 flex flex-col gap-3">
            <PrivatPanel />
          </div>
        )}
      </div>
      <ChatWidget />
    </>
  );
}
