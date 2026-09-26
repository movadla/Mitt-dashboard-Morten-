"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { Task } from "@/lib/tasks";
import type { TaskFilter } from "@/lib/taskTypes";
import {
  CALENDAR_EVENTS,
  EXPIRIES,
  MANGLER_GARANTI,
  RECEIVABLES,
  formatDateDMY,
} from "@/lib/widgets";
import { computeAutoRisk } from "@/lib/receivablesAging";
import {
  Bell,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  Database,
  FileSignature,
  Home,
  Newspaper,
  ClipboardCheck,
  Receipt,
  ShieldCheck,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { CARD_SHELL, CardErrorBoundary, CardHeader, ConfirmDialog, SuggestionList, useConfirmDelete, usePersistedOrder } from "./CardShell";
import StaleSourceBanner, { MAX_AGE_DAYS, sourceAgeDays } from "./StaleSourceBanner";
import { APP_NAVIGATE_EVENT, consumePendingNavigation, peekPendingNavigation, type NavigationTarget } from "@/lib/appNavigation";
import { SidebarNav, type NavItem } from "./SidebarNav";
import type { Suggestion } from "@/lib/jobbSuggestions";
import { jsonFetcher } from "@/lib/swrFetcher";
import { setAppBadgeCount } from "@/lib/appBadge";
import { daysBetween, relativeDayLabel, weekdayDateLabel } from "@/lib/payday";
import useSWR, { mutate } from "swr";
import IncomeForecastSection from "./IncomeForecastSection";
import FazilesjekkSection from "./FazilesjekkSection";
import JobbTodaySummary from "./JobbTodaySummary";
import JobbRemindersSection from "./JobbRemindersSection";
import JobbEventsSection from "./JobbEventsSection";
import JobbLookupCard from "./JobbLookupCard";
import JobbCompanyNewsSection from "./JobbCompanyNewsSection";
import JobbDataSourcesCard from "./JobbDataSourcesCard";
import JobbContractsSection from "./JobbContractsSection";
import JobbExpirySection from "./JobbExpirySection";
import JobbGuaranteesSection from "./JobbGuaranteesSection";
import JobbReceivablesSection from "./JobbReceivablesSection";
import JobbOppgaverPanel, {
  useOpenTaskCounts,
  type OppgaverFocus,
} from "./JobbOppgaverSection";

const CALENDAR_NOTES_KEY = "mitt-dashboard:calendar-notes:v1";

function useCalendarNotes(): [Record<string, string[]>, (id: string, value: string) => void, (id: string, index: number) => void] {
  const [notes, setNotes] = useState<Record<string, string[]>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CALENDAR_NOTES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, string | string[]>;
        const normalized: Record<string, string[]> = {};
        for (const [id, value] of Object.entries(parsed)) {
          normalized[id] = Array.isArray(value) ? value : [value];
        }
        // localStorage kan ikke leses under SSR/første render uten hydrerings-
        // avvik — dette MÅ skje i en effekt, ikke avledes i render.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setNotes(normalized);
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(CALENDAR_NOTES_KEY, JSON.stringify(notes));
    } catch {
      /* ignore quota errors */
    }
  }, [notes, hydrated]);

  function addNote(id: string, value: string) {
    if (!value.trim()) return;
    setNotes((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), value] }));
  }

  function removeNote(id: string, index: number) {
    setNotes((prev) => ({ ...prev, [id]: (prev[id] ?? []).filter((_, i) => i !== index) }));
  }

  return [notes, addNote, removeNote];
}

function calendarDateBadge(dato: string, today: string): string {
  const diffDays = Math.round((Date.parse(dato) - Date.parse(today)) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "bg-status-positive/12 text-status-positive";
  if (diffDays > 0 && diffDays <= 7) return "bg-status-warning/12 text-status-warning";
  return "bg-surface-2 text-ink-3";
}

function addDaysISO(dateIso: string, days: number): string {
  const d = new Date(dateIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function CalendarCard({ today }: { today: string }) {
  const [visibleCount, setVisibleCount] = useState(6);
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, addNote, removeNote] = useCalendarNotes();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const confirmDeleteNote = useConfirmDelete<{ meetingId: string; index: number; preview: string }>();
  const [showHistory, setShowHistory] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = siste hele uke før inneværende uke

  // Møter som allerede har skjedd skal ikke ligge åpent øverst i listen —
  // kun kommende (inkl. i dag) vises som default. Historikk nås via egen
  // "Vis tidligere hendelser"-knapp, bla uke for uke, i stedet.
  const upcoming = CALENDAR_EVENTS.filter((m) => m.dato >= today);
  const visible = upcoming.slice(0, visibleCount);

  // Rullerende 7-dagers vinduer bakover fra i går (IKKE kalenderuker/mandag-
  // justert) — det unngår et hull der de siste dagene av inneværende uke
  // (som allerede er passert, men før "i dag") ellers ville falt mellom
  // "kommende" (som starter nøyaktig på "i dag") og "forrige hele uke".
  const historyWeekEnd = addDaysISO(today, -1 - 7 * weekOffset);
  const historyWeekStart = addDaysISO(historyWeekEnd, -6);
  const historyEvents = CALENDAR_EVENTS.filter((m) => m.dato >= historyWeekStart && m.dato <= historyWeekEnd);

  // "calendar-note"-forslag fra Claude (research-runder) — et notat foreslått
  // knyttet til et konkret møte i CALENDAR_EVENTS (meetingId).
  const { data: suggestionData, mutate: mutateSuggestions } = useSWR<{ suggestions: Suggestion[] }>(
    "/api/jobb-suggestions",
    jsonFetcher,
  );
  const calendarSuggestions = (suggestionData?.suggestions ?? [])
    .filter((s) => s.target === "calendar-note")
    .map((s) => {
      const meeting = CALENDAR_EVENTS.find((e) => e.id === s.meetingId);
      const meetingLabel = meeting ? `${meeting.mote} (${formatDateDMY(meeting.dato)})` : "et møte";
      return { ...s, sourceRef: `${s.sourceRef} · Gjelder ${meetingLabel}` };
    });

  async function handleAcceptCalendarSuggestion(s: Suggestion) {
    mutateSuggestions(
      (current) => current && { suggestions: current.suggestions.filter((x) => x.id !== s.id) },
      { revalidate: false },
    );
    if (s.meetingId) addNote(s.meetingId, s.title);
    await fetch(`/api/jobb-suggestions/${s.id}`, { method: "DELETE" });
  }

  async function handleDeclineCalendarSuggestion(s: Suggestion) {
    mutateSuggestions(
      (current) => current && { suggestions: current.suggestions.filter((x) => x.id !== s.id) },
      { revalidate: false },
    );
    await fetch(`/api/jobb-suggestions/${s.id}`, { method: "DELETE" });
  }

  function renderRows(meetings: typeof CALENDAR_EVENTS) {
    return meetings.map((m, i) => {
      const isOpen = selected === m.id;
      const prevDate = i > 0 ? meetings[i - 1].dato : null;
      const showHeader = m.dato !== prevDate;
      return (
        <Fragment key={m.id}>
          {/* Datopillen sto tidligere på HVER rad, og gjentok dermed datoen
              gruppeoverskriften rett over allerede oppgir — «I DAG» fulgt av to rader
              som begge sa «08.09.2026». Fargesignalet (i dag / innen 7 dager) er flyttet
              hit opp, hvor det gjelder hele gruppen, og Dato-kolonnen er borte.
              Overskriften får datoen med når etiketten er «I dag»/«I morgen» og ellers
              ikke, siden «Tirsdag 15.09» inneholder den fra før. (2026-09-08) */}
          {showHeader && (
            <tr className="border-t border-line">
              <td colSpan={5} className="px-3 pb-1 pt-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide ${calendarDateBadge(m.dato, today)}`}
                >
                  {relativeDayLabel(m.dato, today)}
                  {(m.dato === today || m.dato === addDaysISO(today, 1)) && ` · ${weekdayDateLabel(m.dato, today)}`}
                </span>
              </td>
            </tr>
          )}
          <tr
            onClick={() => setSelected(isOpen ? null : m.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSelected(isOpen ? null : m.id);
              }
            }}
            role="button"
            tabIndex={0}
            aria-expanded={isOpen}
            className="cursor-pointer border-t border-line transition-colors hover:bg-surface-2/50"
          >
            <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">{m.start}</td>
            <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">{m.slutt}</td>
            <td className="whitespace-nowrap px-3 py-2 text-ink-1">{m.mote}</td>
            <td className="whitespace-nowrap px-3 py-2 text-ink-2">{m.beskrivelse}</td>
            <td className="whitespace-nowrap px-3 py-2 text-ink-2">{m.sted}</td>
          </tr>
          {isOpen && (
            <tr className="border-t border-line bg-surface-2">
              <td colSpan={5} className="px-3 py-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-2xs font-medium text-ink-4">Info fra Outlook</p>
                    <p className="whitespace-pre-line text-xs leading-relaxed text-ink-2">
                      {m.merknad ?? "Ingen tilleggsinfo hentet fra Outlook."}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-2xs font-medium text-ink-4">Mine notater</p>
                    <textarea
                      value={drafts[m.id] ?? ""}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") e.currentTarget.blur();
                      }}
                      placeholder="Skriv et nytt notat om møtet …"
                      rows={2}
                      className="w-full resize-none rounded-lg border border-transparent bg-surface-1 p-2 text-xs text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        addNote(m.id, drafts[m.id] ?? "");
                        setDrafts((prev) => ({ ...prev, [m.id]: "" }));
                      }}
                      className="mt-1.5 rounded-md bg-surface-3 px-2.5 py-1 text-2xs font-medium text-ink-2 hover:text-ink-1"
                    >
                      Lagre
                    </button>
                    {(notes[m.id]?.length ?? 0) > 0 && (
                      <ul className="mt-2 space-y-1.5">
                        {notes[m.id].map((note, i) => (
                          <li
                            key={i}
                            className="flex items-start justify-between gap-2 whitespace-pre-line rounded-lg bg-surface-1 p-2 text-xs leading-relaxed text-ink-2"
                          >
                            <span>{note}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDeleteNote.request({ meetingId: m.id, index: i, preview: note });
                              }}
                              className="shrink-0 text-ink-4 hover:text-rose-400"
                              aria-label="Slett notat"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </td>
            </tr>
          )}
        </Fragment>
      );
    });
  }

  return (
    <div className="border-t-2 border-t-indigo-400/60 p-4">
      <CardHeader
        title="Kalender"
        subtitle={<><span className="font-medium tabular-nums text-ink-2">{upcoming.length}</span> kommende</>}
        icon={CalendarDays}
        iconColorClass="text-indigo-400"
      />
        <SuggestionList
          suggestions={calendarSuggestions}
          onAccept={handleAcceptCalendarSuggestion}
          onDecline={handleDeclineCalendarSuggestion}
        />
        {upcoming.length === 0 ? (
          <p className="text-sm text-ink-3">Ingen kommende møter.</p>
        ) : (
          <>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-ink-4">
                    <th className="px-3 py-2 text-2xs font-medium text-right">Start</th>
                    <th className="px-3 py-2 text-2xs font-medium text-right">Slutt</th>
                    <th className="px-3 py-2 text-2xs font-medium">Møte</th>
                    {/* Het «Beskrivelse», men feltet inneholder Innkaller/Deltaker/Fravær —
                        altså din egen rolle i møtet, ikke en beskrivelse av det. */}
                    <th className="px-3 py-2 text-2xs font-medium">Min rolle</th>
                    <th className="px-3 py-2 text-2xs font-medium">Sted</th>
                  </tr>
                </thead>
                <tbody>{renderRows(visible)}</tbody>
              </table>
            </div>
            {upcoming.length > visibleCount && (
              <button
                type="button"
                onClick={() => setVisibleCount((v) => v + 10)}
                className="mt-3 text-xs font-medium text-ink-3 hover:text-ink-1"
              >
                {`Mer (${upcoming.length - visibleCount})`}
              </button>
            )}
          </>
        )}

      <div className="mt-4 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="text-xs font-medium text-ink-3 hover:text-ink-1"
        >
          {showHistory ? "Skjul tidligere hendelser" : "Vis tidligere hendelser"}
        </button>
        {showHistory && (
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setWeekOffset((v) => v + 1)}
                className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-2xs font-medium text-ink-3 transition hover:border-line-strong hover:text-ink-1"
              >
                ← Forrige uke
              </button>
              <span className="text-2xs font-medium tabular-nums text-ink-3">
                {formatDateDMY(historyWeekStart)}–{formatDateDMY(historyWeekEnd)}
              </span>
              <button
                type="button"
                onClick={() => setWeekOffset((v) => Math.max(0, v - 1))}
                disabled={weekOffset === 0}
                className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-2xs font-medium text-ink-3 transition hover:border-line-strong hover:text-ink-1 disabled:opacity-40"
              >
                Neste uke →
              </button>
            </div>
            {historyEvents.length === 0 ? (
              <p className="text-sm text-ink-3">Ingen møter denne uken.</p>
            ) : (
              <div className="-mx-1 overflow-x-auto">
                {/* Samme kolonner som tabellen over — begge bruker renderRows, så
                    overskriftene MÅ følge den. */}
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-left text-ink-4">
                      <th className="px-3 py-2 text-2xs font-medium text-right">Start</th>
                      <th className="px-3 py-2 text-2xs font-medium text-right">Slutt</th>
                      <th className="px-3 py-2 text-2xs font-medium">Møte</th>
                      <th className="px-3 py-2 text-2xs font-medium">Min rolle</th>
                      <th className="px-3 py-2 text-2xs font-medium">Sted</th>
                    </tr>
                  </thead>
                  <tbody>{renderRows(historyEvents)}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteNote.isOpen}
        message={confirmDeleteNote.pending ? `Slette notatet «${confirmDeleteNote.pending.preview}»?` : ""}
        onCancel={confirmDeleteNote.cancel}
        onConfirm={() => {
          const pending = confirmDeleteNote.pending;
          if (pending) removeNote(pending.meetingId, pending.index);
          confirmDeleteNote.cancel();
        }}
      />
    </div>
  );
}

// v4: ny standardrekkefølge (Påminnelser/Kalender flyttet til plass 1-2 for å
// matche Privat, Inntektsprognose til plass 3). usePersistedOrder beholder en
// lagret rekkefølge og legger kun NYE id-er til på slutten — uten en bump
// hadde den gamle v3-rekkefølgen fra localStorage overstyrt hele endringen.
const JOBB_SECTION_ORDER_KEY = "mitt-dashboard:jobb-section-order:v4";
// Påminnelser og Kalender ligger bevisst på plass 1 og 2, nøyaktig som i
// Privat-fanen — de to seksjonene som finnes i begge faner skal sitte samme
// sted uansett hvilken fane man er i, slik at muskelminnet virker på tvers.
// (Dataene er fortsatt helt adskilte; det er kun plasseringen som er felles.)
// Inntektsprognose står på plass 3 = øverste rad, høyre hjørne i mobilrutenettet.
const DEFAULT_JOBB_SECTION_ORDER = [
  "today",
  "reminders",
  "calendar",
  "income-forecast",
  "oppgaver",
  "contracts",
  "expiry",
  "guarantees",
  "receivables",
  "events",
  "fazilesjekk",
  "oppslag",
  "mustad-nyheter",
  "data-sources",
];

// Bak "Mer"-flisen nederst til høyre. Med kun Datakilder og Mustad-nyheter
// skjult ble det 13 fliser, altså fire rader, og "Mer" havnet alene på rad
// fire i stedet for nederst til høyre. Oppslag ligger derfor også her: den
// globale søkepaletten (Ctrl/Cmd+K) dekker det meste av samme behov.
const JOBB_SECONDARY_NAV_IDS = ["oppslag", "mustad-nyheter", "data-sources"];

// Hvilken manuelt oppdaterte datakilde hver seksjon faktisk viser tall fra —
// id-ene matcher FILE_SOURCES i app/api/data-sources/route.ts. Brukes til
// ferskhetsvarselet over kortet. Seksjoner uten oppføring (Påminnelser,
// Kalender, Hendelser) har egne, live data i Redis og kan ikke bli
// "utdaterte" på samme måte. Fazilesjekk er derimot IKKE live — den er,
// akkurat som Oppgaver/Leietakersøk/Inntektsprognose, en manuelt oppdatert
// fazilesjekk.local.ts-fil (se lib/fazilesjekk.ts), og spores derfor her.
const SECTION_DATA_SOURCE: Record<string, string> = {
  today: "tasks",
  oppgaver: "tasks",
  // v77 (2026-09-26, presentasjonsrevisjon): egen kilde-id, atskilt fra "widgets" - Kontrakter
  // har nå sin egen CONTRACTS_SIST_OPPDATERT (se app/api/data-sources/route.ts), presis for
  // akkurat dette datasettet i stedet for widgets.local.ts sin delte fil-mtid.
  contracts: "contracts",
  expiry: "widgets",
  guarantees: "widgets",
  receivables: "widgets",
  "income-forecast": "incomeForecast",
  fazilesjekk: "fazilesjekk",
  oppslag: "tenants",
  "mustad-nyheter": "companyNews",
};

// Den omvendte koblingen: kilde-id → seksjonen den mater, men BARE der bare én
// seksjon bruker kilden. «widgets» mater fire seksjoner og «tasks» to, og for dem
// finnes det ikke ett riktig sted å hoppe — de utelates i stedet for at Datakilder
// skal gjette. Utledes av SECTION_DATA_SOURCE over, ikke skrevet opp på nytt, så
// de to ikke kan drifte fra hverandre. (2026-09-08)
const SOURCE_TO_SECTION: Record<string, string> = (() => {
  const perKilde = new Map<string, string[]>();
  for (const [seksjon, kilde] of Object.entries(SECTION_DATA_SOURCE)) {
    perKilde.set(kilde, [...(perKilde.get(kilde) ?? []), seksjon]);
  }
  return Object.fromEntries(
    [...perKilde.entries()].filter(([, seksjoner]) => seksjoner.length === 1).map(([kilde, seksjoner]) => [kilde, seksjoner[0]]),
  );
})();

// Ikon/farge per kategori — samme verdier som hvert kort allerede sender til
// sin egen CardHeader, gjenbrukt her uendret slik at nav-elementet matcher
// seksjonens egen identitet (se app/privat/PrivatPanel.tsx for samme mønster).
const NAV_META: Record<string, { label: string; icon: NavItem["icon"]; iconColorClass: string }> = {
  today: { label: "I dag", icon: Home, iconColorClass: "text-accent" },
  oppgaver: { label: "Oppgaver", icon: ClipboardList, iconColorClass: "text-accent" },
  calendar: { label: "Kalender", icon: CalendarDays, iconColorClass: "text-indigo-400" },
  contracts: { label: "Kontrakter", icon: FileSignature, iconColorClass: "text-rose-400" },
  expiry: { label: "Utløp", icon: CalendarClock, iconColorClass: "text-orange-400" },
  guarantees: { label: "Garantier", icon: ShieldCheck, iconColorClass: "text-teal-400" },
  receivables: { label: "Kundefordringer", icon: Receipt, iconColorClass: "text-fuchsia-400" },
  reminders: { label: "Påminnelser", icon: Bell, iconColorClass: "text-accent" },
  events: { label: "Hendelser", icon: CalendarPlus, iconColorClass: "text-emerald-400" },
  oppslag: { label: "Oppslag", icon: Users, iconColorClass: "text-violet-400" },
  "income-forecast": { label: "Inntektsprognose", icon: TrendingUp, iconColorClass: "text-yellow-400" },
  fazilesjekk: { label: "Fazilesjekk", icon: ClipboardCheck, iconColorClass: "text-sky-400" },
  "mustad-nyheter": { label: "Mustad-nyheter", icon: Newspaper, iconColorClass: "text-cyan-400" },
  "data-sources": { label: "Datakilder", icon: Database, iconColorClass: "text-slate-400" },
};

// Rekkefølgen på fanene kan dras om (usePersistedOrder, samme mønster som Privat-fanen) —
// derfor er dette en id → node-oppslagstabell istedenfor en hardkodet JSX-rekkefølge.
// "today", "oppgaver" og "mustad-nyheter" bygges direkte i sectionNodes (de trenger
// tilgang til lokal state/handlers i JobbView), det samme gjelder nå "contracts",
// "expiry", "guarantees", "receivables" og "oppslag" (de trenger onJumpToOppslag/
// initialQuery) — se sectionNodes-objektet. Resten er enkle, uavhengige kort.
const JOBB_SECTION_NODES: Record<string, (today: string) => React.ReactNode> = {
  calendar: (today) => <CalendarCard today={today} />,
  reminders: () => <JobbRemindersSection />,
  events: () => <JobbEventsSection />,
  "income-forecast": () => <IncomeForecastSection />,
  fazilesjekk: () => <FazilesjekkSection />,
};

export default function JobbView({
  tasks,
  today,
  now,
}: {
  tasks: Task[];
  today: string;
  now: string;
}) {
  const nowMs = Date.parse(now);
  const [order, setOrder] = usePersistedOrder(JOBB_SECTION_ORDER_KEY, DEFAULT_JOBB_SECTION_ORDER);
  const [reorderMode, setReorderMode] = useState(false);
  // Et hopp som kom FRA Privat-fanen ligger allerede klart før første render, så
  // startseksjonen leses her i stedet for å settes i en effekt: visningen males
  // én gang på riktig seksjon i stedet for å blinke innom "today" først. peek,
  // ikke consume — nullstillingen hører hjemme i effekten under.
  const [activeId, setActiveId] = useState(() => peekPendingNavigation("jobb") ?? "today");
  // Hoppønske som JobbOppgaverPanel plukker opp når det monteres (se
  // handleSelect/jumpToCase under) — panelet eier selv all Oppgaver-tilstand.
  const [oppgaverFocus, setOppgaverFocus] = useState<OppgaverFocus | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const hasNavigatedRef = useRef(false);
  const skipFocusMoveRef = useRef(false);

  // Samme SWR-nøkkel som StaleSourceBanner/JobbDataSourcesCard bruker - ett delt nettverkskall.
  // Brukes KUN til å varsle på selve "Mer"-flisen når en av de skjulte seksjonene bak den
  // (Oppslag/Mustad-nyheter) har utdaterte data, siden StaleSourceBanner-varselet for den
  // seksjonen ellers ville vært usynlig helt til man faktisk åpnet "Mer".
  const { data: dataSourcesData } = useSWR<{ sources: { id: string; lastModified: string | null }[] }>(
    "/api/data-sources",
    jsonFetcher,
  );
  const secondaryStale = JOBB_SECONDARY_NAV_IDS.some((id) => {
    const sourceId = SECTION_DATA_SOURCE[id];
    if (!sourceId) return false;
    const source = dataSourcesData?.sources.find((s) => s.id === sourceId);
    if (!source) return false;
    const ageDays = sourceAgeDays(source.lastModified);
    const limit = MAX_AGE_DAYS[sourceId];
    return ageDays !== null && limit !== undefined && ageDays > limit;
  });

  // Søketreff fra kommandopaletten — se samme mønster i
  // app/privat/PrivatPanel.tsx og begrunnelsen i lib/appNavigation.ts.
  useEffect(() => {
    // Nullstiller målet useState-initializeren allerede leste, slik at et senere
    // fanebytte ikke hopper tilbake hit igjen.
    consumePendingNavigation("jobb");

    function handler(e: Event) {
      const target = (e as CustomEvent<NavigationTarget>).detail;
      if (target?.mode === "jobb") {
        consumePendingNavigation("jobb");
        setActiveId(target.sectionId);
      }
    }
    window.addEventListener(APP_NAVIGATE_EVENT, handler);
    return () => window.removeEventListener(APP_NAVIGATE_EVENT, handler);
  }, []);

  // Kun for varselboblen på "Påminnelser" i sidebaren — selve kortet
  // (JobbRemindersSection) henter og eier sin egen fulle liste uavhengig.
  const { data: reminderBadgeData } = useSWR<{ reminders: { done: boolean; dueDate?: string }[] }>(
    "/api/jobb-reminders",
    jsonFetcher,
  );
  const dueRemindersCount = (reminderBadgeData?.reminders ?? []).filter(
    (r) => !r.done && (!r.dueDate || r.dueDate <= today),
  ).length;

  // Kun for varselboblene på "Påminnelser"/"Hendelser"/"Kalender" i
  // sidebaren — hver seksjon henter og eier selv sin fulle forslagsliste
  // (samme SWR-nøkkel, så dette dobbeltbestiller ikke noe nettverkskall).
  const { data: suggestionBadgeData } = useSWR<{ suggestions: Suggestion[] }>("/api/jobb-suggestions", jsonFetcher);
  const suggestionCounts = { reminder: 0, event: 0, "calendar-note": 0, employee: 0 };
  for (const s of suggestionBadgeData?.suggestions ?? []) {
    suggestionCounts[s.target] = (suggestionCounts[s.target] ?? 0) + 1;
  }

  // Sentral lytter for "jobb-refresh" (dispatchet av mutasjons-handlere i de
  // fulle kortene) — reveraliderer alle SWR-nøkler, samme mønster som
  // PrivatPanel.tsx bruker for "privat-refresh".
  useEffect(() => {
    function handler() {
      mutate(() => true);
    }
    window.addEventListener("mitt-dashboard:jobb-refresh", handler);
    return () => window.removeEventListener("mitt-dashboard:jobb-refresh", handler);
  }, []);

  // Samme fokus-flytting ved fanebytte som Privat-fanen (se PrivatPanel.tsx) —
  // hoppes over ved første montering og ved piltast-navigasjon.
  useEffect(() => {
    if (!hasNavigatedRef.current) {
      hasNavigatedRef.current = true;
      return;
    }
    if (skipFocusMoveRef.current) {
      skipFocusMoveRef.current = false;
      return;
    }
    paneRef.current?.focus({ preventScroll: true });
  }, [activeId]);

  function handleSelect(id: string, opts?: { keepFocus?: boolean }) {
    skipFocusMoveRef.current = !!opts?.keepFocus;
    // Et hoppønske gjelder kun selve fanebyttet det ble bestilt sammen med —
    // nullstilles her slik at neste manuelle bytte tilbake til Oppgaver ikke
    // scroller/markerer en gammel sak om igjen. jumpToCase/jumpToOppgaver
    // setter derfor fokus ETTER at de har kalt handleSelect. (2026-09-07)
    setOppgaverFocus(null);
    setActiveId(id);
  }

  const [oppslagQuery, setOppslagQuery] = useState("");

  // Antall åpne oppgaver til nav-boblen. Samme hook (og samme SWR-nøkkel for
  // den server-lagrede "ferdig"-listen) som selve panelet bruker, slik at
  // tellingen finnes ett sted og boblen oppdateres i samme øyeblikk som man
  // huker av en oppgave — også mens Oppgaver-panelet er avmontert. (2026-09-07)
  const openTaskCounts = useOpenTaskCounts(tasks);

  function jumpToOppslag(name: string) {
    setOppslagQuery(name);
    handleSelect("oppslag");
  }

  // "Oppgaver" er nå en egen fane (ikke lenger et anker på en lang side) —
  // hopp dit betyr fanebytte, og selve markeringen/scrollingen gjøres av
  // JobbOppgaverPanel når det monteres (se OppgaverFocus). Fokus settes ETTER
  // handleSelect, som nullstiller et eventuelt tidligere hoppønske.
  function jumpToCase(id: string) {
    handleSelect("oppgaver");
    setOppgaverFocus({ taskId: id });
  }

  function jumpToOppgaver(sourceFilter?: TaskFilter) {
    handleSelect("oppgaver");
    if (sourceFilter) setOppgaverFocus({ filter: sourceFilter });
  }

  // Samme "krever oppfølging"-kriterier som JobbTodaySummary sin oppfolging-
  // liste bruker (utløp <10d ekskl. reforhandlet, garanti-frist ≤10d), pluss
  // auto-risiko "høy" for kundefordringer (samme computeAutoRisk som
  // JobbReceivablesSection selv viser — manuelle overstyringer telles ikke med her,
  // badgen er en tilnærming, selve kortet er alltid det presise).
  // dagerTilUtlop er frosset i datafilen fra uttrekksdatoen og blir feil så snart fila er
  // noen dager gammel — badgen viste 2 «innen 10 dager» der begge i realiteten hadde gått
  // ut over tre uker tidligere. Regnes nå fra `slutt` mot dagens dato. (2026-09-08)
  // Leietakere der ALLE linjer erstattes automatisk i samme kontrakt telles heller ikke som
  // urgent (2026-09-25) — samme prinsipp som "Reforhandlet", se JobbExpirySection.tsx.
  const expiryUrgentCount = EXPIRIES.filter((t) => {
    const nearest = Math.min(...t.lines.map((l) => daysBetween(today, l.slutt)));
    return nearest < 10 && t.status !== "Reforhandlet" && !t.lines.every((l) => l.erstattet);
  }).length;
  // "Mangler garanti"-lista har ikke lenger en ren frist-dato på alle rader (2026-09-26 full
  // research-runde, mange kilder mangler en klar dato) - urgent telles derfor som bekreftet
  // FERSKE (ikke usikker) åpne saker, ikke en datosortering.
  const guaranteeUrgentCount = MANGLER_GARANTI.filter((g) => !g.usikker).length;
  const receivableHighRiskCount = RECEIVABLES.filter((r) => computeAutoRisk(r, today) === "hoy").length;

  // iOS-appens badge-tall speilet kun påminnelser fra Privat uansett hvilken
  // fane man faktisk stod i — nå setter Jobb sitt eget "krever oppfølging"-
  // tall når Jobb er den aktive/monterte fanen (samme delte helper som
  // Privat sin TodaySummary bruker, se lib/appBadge.ts).
  useEffect(() => {
    setAppBadgeCount(expiryUrgentCount + guaranteeUrgentCount + receivableHighRiskCount);
  }, [expiryUrgentCount, guaranteeUrgentCount, receivableHighRiskCount]);

  const navBadges: Partial<Record<string, number>> = {
    oppgaver: openTaskCounts.all,
    reminders: dueRemindersCount + suggestionCounts.reminder,
    events: suggestionCounts.event,
    calendar: suggestionCounts["calendar-note"],
    expiry: expiryUrgentCount,
    guarantees: guaranteeUrgentCount,
    receivables: receivableHighRiskCount,
    oppslag: suggestionCounts.employee,
  };
  const navItems: NavItem[] = order
    .filter((id) => NAV_META[id] != null)
    .map((id) => ({ id, ...NAV_META[id], badge: navBadges[id] }));

  const sectionNodes: Record<string, React.ReactNode> = {
    today: (
      <JobbTodaySummary
        tasks={tasks}
        onJumpToAsana={() => jumpToOppgaver("asana")}
        onJumpToTask={(id) => jumpToCase(id)}
        onJumpToNews={() => handleSelect("mustad-nyheter")}
        onJumpToContracts={() => handleSelect("contracts")}
      />
    ),
    oppgaver: (
      <JobbOppgaverPanel tasks={tasks} today={today} nowMs={nowMs} focus={oppgaverFocus} />
    ),
    "mustad-nyheter": <JobbCompanyNewsSection />,
    "data-sources": <JobbDataSourcesCard sourceToSection={SOURCE_TO_SECTION} onJumpToSection={handleSelect} />,
    calendar: JOBB_SECTION_NODES.calendar(today),
    contracts: <JobbContractsSection today={today} onJumpToOppslag={jumpToOppslag} />,
    expiry: <JobbExpirySection today={today} onJumpToOppslag={jumpToOppslag} />,
    guarantees: <JobbGuaranteesSection today={today} onJumpToOppslag={jumpToOppslag} />,
    receivables: <JobbReceivablesSection today={today} onJumpToOppslag={jumpToOppslag} />,
    reminders: JOBB_SECTION_NODES.reminders(today),
    events: JOBB_SECTION_NODES.events(today),
    oppslag: <JobbLookupCard initialQuery={oppslagQuery} />,
    "income-forecast": JOBB_SECTION_NODES["income-forecast"](today),
    // Manglet her (funnet 2026-09-08): id-en sto i DEFAULT_JOBB_SECTION_ORDER og i
    // NAV_META, og noden fantes i JOBB_SECTION_NODES — men den ble aldri hentet inn
    // hit. Oppslaget ga bare undefined, så Fazilesjekk rendret et helt tomt kort
    // uten noen feilmelding. Se fallback-en under render for hvorfor det ikke lenger
    // kan skje i stillhet.
    fazilesjekk: JOBB_SECTION_NODES.fazilesjekk(today),
  };

  // Sikkerhetsnett hvis lagret aktiv fane av en eller annen grunn ikke finnes
  // lenger (samme mønster som PrivatPanel.tsx) — faller tilbake til "I dag".
  if (activeId !== "today" && !navItems.some((item) => item.id === activeId)) {
    setActiveId("today");
  }

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
      <div className="flex flex-col gap-2 md:w-56 md:shrink-0">
        <SidebarNav
          items={navItems}
          activeId={activeId}
          onSelect={handleSelect}
          ariaLabel="Jobb-seksjoner"
          reorderMode={reorderMode}
          onReorder={setOrder}
          secondaryIds={JOBB_SECONDARY_NAV_IDS}
          activeAccentClass="text-accent"
          secondaryStale={secondaryStale}
        />
        <button
          type="button"
          onClick={() => setReorderMode((v) => !v)}
          className="hidden self-start rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-2xs font-semibold uppercase text-ink-3 transition hover:border-line-strong hover:text-ink-1 md:block"
        >
          {reorderMode ? "Lagre" : "Endre rekkefølge"}
        </button>
      </div>
      {/* Samme kortramme som Privat-panelet — se kommentaren i
          app/privat/PrivatPanel.tsx. Seksjonene her er bygget likt (en
          `border-t-2 border-t-X/60 p-4`-rot ment for en kortkant), og uten
          rammen ligger de løst på bakgrunnen i dagmodus. */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* Ferskhetsvarsel FØR kortet, ikke inni: alle Jobb-seksjonene henter
            tallene sine fra en manuelt oppdatert kilde, og et tall du tror er
            dagens når det er tre uker gammelt er verre enn ingen tall. Én
            kobling her dekker alle seksjoner i stedet for et innslag i hver. */}
        <StaleSourceBanner sourceId={SECTION_DATA_SOURCE[activeId]} />
        {/* brand-mustad på selve kortflaten, ikke på et innerlag: bakgrunnen og
            skyggen kommer fra CARD_SHELL her, så et wrapper-div lenger inn hadde
            gitt merkefarger på innholdet oppå et kort fra grunntemaet. Klassen
            overstyrer bare --t-*-variablene i sitt eget subtre (se globals.css),
            så Inntektsprognosen brandes uten at komponenten er rørt — og hele
            fanen kan brandes senere ved å flytte klassen ut hit uten betingelse.
            (2026-09-08) */}
        <div
          key={activeId}
          ref={paneRef}
          tabIndex={-1}
          className={`${CARD_SHELL} tab-fade min-w-0 overflow-hidden outline-none ${
            activeId === "income-forecast" ? "brand-mustad" : ""
          }`}
        >
          {/* Fallback + synlig varsel i stedet for stille tomhet (2026-09-08):
              Fazilesjekk sto i nav-lista uten en oppføring i sectionNodes, og et
              manglende oppslag ga bare undefined — kortet ble tomt, uten feil i
              konsollen og uten at feilboundary-en over slo inn. Nå plukkes noden
              opp fra JOBB_SECTION_NODES hvis den finnes der, og mangler den
              begge steder sier kortet det høyt. */}
          <CardErrorBoundary>
            {sectionNodes[activeId] ?? JOBB_SECTION_NODES[activeId]?.(today) ?? (
              <p className="p-4 text-sm text-status-danger">
                Seksjonen «{NAV_META[activeId]?.label ?? activeId}» har ingen visning koblet til seg.
              </p>
            )}
          </CardErrorBoundary>
        </div>
      </div>
    </div>
  );
}
