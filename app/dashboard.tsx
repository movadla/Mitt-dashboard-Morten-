"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Task } from "@/lib/tasks";
import ChatWidget from "./ChatWidget";
import JobbView from "./JobbView";
import { SkeletonRows } from "./CardShell";

type Mode = "jobb" | "privat";

const MODE_STORAGE_KEY = "mitt-dashboard:mode:v1";

// Privat-visningen (13 seksjonskomponenter + @dnd-kit for kort-reordering) er
// den tyngste bunten, og lastes derfor kun når den faktisk trengs, slik at
// Jobb-fanen ikke må laste ned all den koden først.
const PrivatPanel = dynamic(() => import("./privat/PrivatPanel"), {
  loading: () => <div className="mt-7 mb-6"><SkeletonRows count={4} /></div>,
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
            ? "bg-orange-500/20 text-orange-200 ring-1 ring-orange-400/40"
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
            ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40"
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
      setMode(stored === "privat" ? "privat" : "jobb");
    } catch {
      setMode("jobb");
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
      <div className="mx-auto w-full max-w-2xl px-4 pb-24 md:max-w-5xl md:px-8">
        <div
          className="sticky top-0 z-40 -mx-4 bg-surface-0/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1.5rem)] backdrop-blur supports-[backdrop-filter]:bg-surface-0/80 sm:pt-[calc(env(safe-area-inset-top)+2.5rem)] md:-mx-8 md:px-8"
        >
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-ink-1">
              I dag
            </h1>
            {mode && <ModeToggle mode={mode} onChange={setMode} />}
          </div>
        </div>

        {mode === null ? (
          <div className="mt-6"><SkeletonRows count={4} /></div>
        ) : mode === "jobb" ? (
          <div key="jobb" className="tab-fade">
            <JobbView tasks={tasks} today={today} now={now} />
          </div>
        ) : (
          <div key="privat" className="tab-fade mt-7 mb-6 flex flex-col gap-3">
            <PrivatPanel />
          </div>
        )}
      </div>
      <ChatWidget />
    </>
  );
}
