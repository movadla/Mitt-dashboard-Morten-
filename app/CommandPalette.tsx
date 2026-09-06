"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Search, X } from "lucide-react";
import { jsonFetcher } from "@/lib/swrFetcher";
import { navigateTo, type AppMode } from "@/lib/appNavigation";
import { CONTRACTS, EXPIRIES, GUARANTEES, RECEIVABLES, formatKr } from "@/lib/widgets";
import { TENANTS } from "@/lib/tenants";
import type { Reminder } from "@/lib/reminders";
import type { Note } from "@/lib/notes";
import type { ShoppingItem } from "@/lib/shoppingList";
import type { PrivatCalendarEvent } from "@/lib/privatCalendar";
import type { LifeEvent } from "@/lib/payday";

interface Hit {
  key: string;
  mode: AppMode;
  sectionId: string;
  // Hvilken seksjon treffet hører hjemme i, vist som en liten etikett.
  where: string;
  text: string;
  meta?: string;
}

const MAX_PER_GROUP = 4;
const MAX_TOTAL = 12;

function matches(haystack: string, q: string) {
  return haystack.toLowerCase().includes(q);
}

/** Søk på tvers av BEGGE faner. PrivatSearch dekker kun Privat, og Oppslag
 *  kun leietakere — men det man leter etter vet sjelden hvilken fane det bor
 *  i. Åpnes med Ctrl/Cmd+K, eller søkeknappen i toppen på mobil.
 *
 *  Komponenten lastes lazy (se app/dashboard.tsx): den importerer hele
 *  widget- og leietakerdatasettet, som ikke skal ligge i oppstartsbunten. */
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Samme SWR-nøkler som seksjonene selv bruker — dedupert av SWR, så dette
  // koster ingen ekstra nettverkskall når panelet allerede har hentet dem.
  const { data: remindersData } = useSWR<{ reminders: Reminder[] }>("/api/reminders", jsonFetcher);
  const { data: notesData } = useSWR<{ notes: Note[] }>("/api/notes", jsonFetcher);
  const { data: shoppingData } = useSWR<{ items: ShoppingItem[] }>("/api/shopping", jsonFetcher);
  const { data: calendarData } = useSWR<{ events: PrivatCalendarEvent[] }>("/api/privat-calendar", jsonFetcher);
  const { data: lifeEventsData } = useSWR<{ events: LifeEvent[] }>("/api/events", jsonFetcher);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  let hits: Hit[] = [];

  if (q.length >= 2) {
    const groups: Hit[][] = [
      (remindersData?.reminders ?? [])
        .filter((r) => matches(r.text, q))
        .map((r) => ({ key: `r-${r.id}`, mode: "privat" as const, sectionId: "reminders", where: "Påminnelser", text: r.text, meta: r.dueDate })),
      (calendarData?.events ?? [])
        .filter((e) => matches(e.title, q))
        .map((e) => ({ key: `c-${e.id}`, mode: "privat" as const, sectionId: "calendar", where: "Kalender", text: e.title, meta: e.date })),
      (notesData?.notes ?? [])
        .filter((n) => matches(n.text, q))
        .map((n) => ({ key: `n-${n.id}`, mode: "privat" as const, sectionId: "notes", where: "Notater", text: n.text })),
      (shoppingData?.items ?? [])
        .filter((s) => matches(s.name, q))
        .map((s) => ({ key: `s-${s.id}`, mode: "privat" as const, sectionId: "shopping", where: "Handleliste", text: s.name })),
      (lifeEventsData?.events ?? [])
        .filter((e) => matches(e.title, q))
        .map((e) => ({ key: `le-${e.id}`, mode: "privat" as const, sectionId: "events", where: "Hendelser", text: e.title, meta: e.date })),
      TENANTS.filter((t) => matches(t.kontonavn, q)).map((t) => ({
        key: `t-${t.id}`,
        mode: "jobb" as const,
        sectionId: "oppslag",
        where: "Oppslag",
        text: t.kontonavn,
        meta: t.bygg,
      })),
      RECEIVABLES.filter((r) => matches(r.leietaker, q)).map((r) => ({
        key: `rec-${r.id}`,
        mode: "jobb" as const,
        sectionId: "receivables",
        where: "Kundefordringer",
        text: r.leietaker,
        meta: formatKr(r.utestaende),
      })),
      CONTRACTS.filter((c) => matches(c.kunde, q)).map((c) => ({
        key: `co-${c.id}`,
        mode: "jobb" as const,
        sectionId: "contracts",
        where: "Kontrakter",
        text: c.kunde,
        meta: formatKr(c.arsbelop),
      })),
      EXPIRIES.filter((e) => matches(e.leietaker, q)).map((e) => ({
        key: `ex-${e.customerId}`,
        mode: "jobb" as const,
        sectionId: "expiry",
        where: "Utløp",
        text: e.leietaker,
        meta: formatKr(e.totalArsleie),
      })),
      GUARANTEES.filter((g) => matches(g.leietaker, q)).map((g) => ({
        key: `g-${g.id}`,
        mode: "jobb" as const,
        sectionId: "guarantees",
        where: "Garantier",
        text: g.leietaker,
      })),
    ];
    // Tak per gruppe før totaltaket: ellers kunne én stor gruppe (typisk
    // Kundefordringer med 200+ leietakere) fylle hele lista og skjule at det
    // finnes treff i de andre seksjonene i det hele tatt.
    hits = groups.flatMap((g) => g.slice(0, MAX_PER_GROUP)).slice(0, MAX_TOTAL);
  }

  // Holder markøren innenfor lista når treffene endrer seg mens man skriver.
  // Justert i render, ikke i en effekt — samme anbefalte mønster som
  // CollapsibleBody bruker for avledet tilstand.
  if (activeIndex > 0 && activeIndex >= hits.length) {
    setActiveIndex(0);
  }

  function choose(hit: Hit) {
    navigateTo({ mode: hit.mode, sectionId: hit.sectionId });
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (hits.length === 0 ? 0 : (i + 1) % hits.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (hits.length === 0 ? 0 : (i - 1 + hits.length) % hits.length));
    } else if (e.key === "Enter" && hits[activeIndex]) {
      e.preventDefault();
      choose(hits[activeIndex]);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-line-strong bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Søk i hele dashboardet"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-ink-4" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Søk i påminnelser, kalender, leietakere, kontrakter…"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink-1 placeholder-ink-4 outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk søk"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-2 hover:text-ink-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {q.length < 2 ? (
            <p className="px-2 py-4 text-center text-xs text-ink-4">Skriv minst to tegn for å søke i begge faner.</p>
          ) : hits.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-ink-4">Ingen treff på «{query.trim()}».</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {hits.map((hit, i) => (
                <li key={hit.key}>
                  <button
                    type="button"
                    onClick={() => choose(hit)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                      i === activeIndex ? "bg-surface-2" : "hover:bg-surface-2/60"
                    }`}
                  >
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${
                        hit.mode === "jobb" ? "bg-accent/12 text-accent" : "bg-accent-privat/12 text-accent-privat"
                      }`}
                    >
                      {hit.where}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-1">{hit.text}</span>
                    {hit.meta && <span className="shrink-0 text-2xs tabular-nums text-ink-4">{hit.meta}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
