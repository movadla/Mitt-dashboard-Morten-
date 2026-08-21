"use client";

import { useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { Search, X } from "lucide-react";
import type { Reminder } from "@/lib/reminders";
import type { Note } from "@/lib/notes";
import type { ShoppingItem } from "@/lib/shoppingList";
import type { PrivatCalendarEvent } from "@/lib/privatCalendar";
import type { LifeEvent } from "@/lib/payday";
import { NAV_META } from "./PrivatPanel";

interface SearchResult {
  id: string;
  navId: string;
  text: string;
}

// Gjenbruker samme SWR-nøkler som de fulle seksjonene (RemindersSection,
// NotesSection, osv.) — dedupert av SWR, altså ingen ekstra nettverkskall,
// bare gjenbruk av det de allerede henter.
export default function PrivatSearch({ onJump }: { onJump: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const { data: remindersData } = useSWR<{ reminders: Reminder[] }>("/api/reminders", jsonFetcher);
  const { data: notesData } = useSWR<{ notes: Note[] }>("/api/notes", jsonFetcher);
  const { data: shoppingData } = useSWR<{ items: ShoppingItem[] }>("/api/shopping", jsonFetcher);
  const { data: calendarData } = useSWR<{ events: PrivatCalendarEvent[] }>("/api/privat-calendar", jsonFetcher);
  const { data: eventsData } = useSWR<{ events: LifeEvent[] }>("/api/events", jsonFetcher);

  const q = query.trim().toLowerCase();
  const results: SearchResult[] =
    q.length < 2
      ? []
      : [
          ...(remindersData?.reminders ?? [])
            .filter((r) => r.text.toLowerCase().includes(q))
            .map((r) => ({ id: `reminders-${r.id}`, navId: "reminders", text: r.text })),
          ...(notesData?.notes ?? [])
            .filter((n) => n.text.toLowerCase().includes(q))
            .map((n) => ({ id: `notes-${n.id}`, navId: "notes", text: n.text })),
          ...(shoppingData?.items ?? [])
            .filter((s) => s.name.toLowerCase().includes(q))
            .map((s) => ({ id: `shopping-${s.id}`, navId: "shopping", text: s.name })),
          ...(calendarData?.events ?? [])
            .filter((e) => e.title.toLowerCase().includes(q))
            .map((e) => ({ id: `calendar-${e.id}`, navId: "calendar", text: e.title })),
          ...(eventsData?.events ?? [])
            .filter((e) => e.title.toLowerCase().includes(q))
            .map((e) => ({ id: `events-${e.id}`, navId: "events", text: e.title })),
        ].slice(0, 8);

  function selectResult(navId: string) {
    onJump(navId);
    setQuery("");
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-ink-4" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
          }}
          placeholder="Søk i påminnelser, notater, handleliste..."
          className="min-w-0 flex-1 bg-transparent text-sm text-ink-1 placeholder-ink-4 outline-none"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Tøm søk" className="shrink-0 text-ink-4 hover:text-ink-2">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {q.length >= 2 && (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-line bg-surface-1 p-1.5 shadow-lg shadow-black/30">
          {results.length === 0 ? (
            <p className="px-2 py-2 text-sm text-ink-3">Ingen treff.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {results.map((r) => {
                const meta = NAV_META[r.navId];
                const Icon = meta?.icon;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => selectResult(r.navId)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-2"
                    >
                      {Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.iconColorClass}`} />}
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-1">{r.text}</span>
                      <span className="shrink-0 text-2xs text-ink-4">{meta?.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
