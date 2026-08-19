"use client";

import { useEffect, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { FplBox, type FplData } from "./FplSection";
import { SportSection, WorldCupSection, type SportEvent } from "./SportSection";
import RemindersSection from "./RemindersSection";
import CalendarSection from "./CalendarSection";
import TodaySummary from "./TodaySummary";
import FinanceSection from "./FinanceSection";
import AlfredSection from "./AlfredSection";
import ShoppingListSection from "./ShoppingListSection";
import NewsSection from "./NewsSection";
import EventsSection from "./EventsSection";
import NotesSection from "./NotesSection";
import TreningSection from "./TreningSection";
import { CARD_SHELL, CardErrorBoundary, SkeletonRows, usePersistedOrder } from "../CardShell";
import { SidebarNav, type NavItem } from "../SidebarNav";
import {
  Home,
  Bell,
  Calendar,
  PartyPopper,
  StickyNote,
  Wallet,
  Trophy,
  Dumbbell,
  Bot,
  ShoppingCart,
  Newspaper,
  Shirt,
} from "lucide-react";

const NAV_ORDER_KEY = "mitt-dashboard:privat-nav-order:v1";
const DEFAULT_NAV_ORDER = [
  "today",
  "reminders",
  "calendar",
  "events",
  "notes",
  "finance",
  "sport",
  "worldcup",
  "trening",
  "alfred",
  "shopping",
  "news",
  "fpl",
];

// Ikon/farge per kategori — samme verdier som hver seksjon selv sender til
// CardHeader internt, gjenbrukt her uendret slik at nav-elementet matcher
// seksjonens egen identitet.
const NAV_META: Record<string, { label: string; icon: NavItem["icon"]; iconColorClass: string }> = {
  today: { label: "I dag", icon: Home, iconColorClass: "text-accent-privat" },
  reminders: { label: "Påminnelser", icon: Bell, iconColorClass: "text-accent-privat" },
  calendar: { label: "Kalender", icon: Calendar, iconColorClass: "text-source-teams" },
  events: { label: "Hendelser", icon: PartyPopper, iconColorClass: "text-accent-privat" },
  notes: { label: "Notater", icon: StickyNote, iconColorClass: "text-amber-400" },
  finance: { label: "Økonomi", icon: Wallet, iconColorClass: "text-source-outlook" },
  sport: { label: "Sport", icon: Trophy, iconColorClass: "text-accent" },
  worldcup: { label: "VM", icon: Trophy, iconColorClass: "text-accent" },
  trening: { label: "Trening", icon: Dumbbell, iconColorClass: "text-emerald-400" },
  alfred: { label: "Alfred", icon: Bot, iconColorClass: "text-status-action" },
  shopping: { label: "Handleliste", icon: ShoppingCart, iconColorClass: "text-cyan-400" },
  news: { label: "Nyheter", icon: Newspaper, iconColorClass: "text-white" },
  fpl: { label: "FPL", icon: Shirt, iconColorClass: "text-lime-400" },
};

export default function PrivatPanel() {
  const { data: fplData, isLoading: fplLoading } = useSWR<FplData>("/api/fpl", jsonFetcher);
  const { data: sportsData, isLoading: sportsLoading } = useSWR<{ events: SportEvent[]; fetchedAt?: number }>(
    "/api/sports",
    jsonFetcher,
  );
  const { data: worldCupData, isLoading: worldCupLoading } = useSWR<{ events: SportEvent[] }>("/api/worldcup", jsonFetcher);
  const fpl = fplData ?? null;
  const sports = sportsData?.events ?? [];
  const sportsFetchedAt = sportsData?.fetchedAt ?? null;
  const worldCup = worldCupData?.events ?? [];
  const [order, setOrder] = usePersistedOrder(NAV_ORDER_KEY, DEFAULT_NAV_ORDER);
  const [reorderMode, setReorderMode] = useState(false);
  const [activeId, setActiveId] = useState("today");
  const paneRef = useRef<HTMLDivElement>(null);
  const hasNavigatedRef = useRef(false);
  const skipFocusMoveRef = useRef(false);

  // Éncentralisert lytter for det gamle "privat-refresh"-eventet (fortsatt
  // dispatchet av alle mutasjons-handlere i de fulle kortene) — reveraliderer
  // ALLE SWR-nøkler på tvers av appen (reminders, calendar, sports, fpl,
  // events osv.) istedenfor at hvert migrert kort trenger sin egen lytter.
  useEffect(() => {
    function handler() {
      mutate(() => true);
    }
    window.addEventListener("mitt-dashboard:privat-refresh", handler);
    return () => window.removeEventListener("mitt-dashboard:privat-refresh", handler);
  }, []);

  // Flytter fokus til det nye panelet ved seksjonsbytte (museklikk), slik at
  // skjermleser-brukere havner i det nye innholdet i stedet for å bli
  // stående på en nav-knapp uten synlig kobling til endringen. Hoppes over
  // ved første montering (åpning av fanen skal ikke rive fokus bort fra
  // resten av siden) OG ved piltast-navigasjon (SidebarNav sender
  // keepFocus: true der) — å flytte fokus bort fra tablisten etter hvert
  // piltrykk ville gjort det umulig å fortsette å bla gjennom listen.
  useEffect(() => {
    if (!hasNavigatedRef.current) {
      hasNavigatedRef.current = true;
      return;
    }
    if (skipFocusMoveRef.current) {
      skipFocusMoveRef.current = false;
      return;
    }
    paneRef.current?.focus();
  }, [activeId]);

  function handleSelect(id: string, opts?: { keepFocus?: boolean }) {
    skipFocusMoveRef.current = !!opts?.keepFocus;
    setActiveId(id);
  }

  // null her betyr "ingen kort å vise akkurat nå" (f.eks. tomt VM-program,
  // FPL inaktiv) — da hopper vi over navigasjonselementet også, ikke bare
  // kortet (se navItems under, som skiller "skjult av forretningslogikk"
  // fra "fortsatt under lasting").
  const sectionNodes: Record<string, React.ReactNode> = {
    today: <TodaySummary />,
    reminders: <RemindersSection defaultExpanded={activeId === "reminders"} />,
    calendar: <CalendarSection defaultExpanded={activeId === "calendar"} />,
    events: <EventsSection defaultExpanded={activeId === "events"} />,
    notes: <NotesSection defaultExpanded={activeId === "notes"} />,
    finance: <FinanceSection defaultExpanded={activeId === "finance"} />,
    sport: (
      <SportSection
        events={sports}
        loading={sportsLoading}
        fetchedAt={sportsFetchedAt}
        defaultExpanded={activeId === "sport"}
      />
    ),
    worldcup:
      worldCup.length > 0 || worldCupLoading ? (
        <WorldCupSection events={worldCup} defaultExpanded={activeId === "worldcup"} />
      ) : null,
    trening: <TreningSection defaultExpanded={activeId === "trening"} />,
    alfred: <AlfredSection defaultExpanded={activeId === "alfred"} />,
    shopping: <ShoppingListSection defaultExpanded={activeId === "shopping"} />,
    news: <NewsSection defaultExpanded={activeId === "news"} />,
    fpl: fplLoading ? (
      <div className={`${CARD_SHELL} p-4`}>
        <SkeletonRows count={1} className="h-5" />
      </div>
    ) : fpl && fpl.active && fpl.gw?.deadline ? (
      <FplBox fpl={fpl} defaultExpanded={activeId === "fpl"} />
    ) : null,
  };

  // "Skjult av forretningslogikk" (VM utenfor sesong, FPL inaktiv sesong) vs.
  // "fortsatt under lasting" er to ulike ting — begge slått sammen til én
  // sectionNodes-nullsjekk over ville fått nav-elementet til å blinke inn/ut
  // mens dataen hentes. Her regnes kun det første som "skjul fra nav".
  const worldcupVisible = worldCup.length > 0 || worldCupLoading;
  const fplVisible = fplLoading || (!!fpl && fpl.active && !!fpl.gw?.deadline);
  const navItems: NavItem[] = order
    .filter((id) => {
      if (id === "worldcup") return worldcupVisible;
      if (id === "fpl") return fplVisible;
      return NAV_META[id] != null;
    })
    .map((id) => ({ id, ...NAV_META[id] }));

  // Sikkerhetsnett: hvis den aktive kategorien forsvinner midt i økten (VM-
  // vinduet stenger, FPL-sesongen blir inaktiv), faller visningen tilbake
  // til "I dag" i stedet for å vise et tomt panel. Justert direkte i render
  // (ikke i en effekt) — samme anbefalte mønster som CollapsibleBody bruker
  // for avledet state fra en prop-/data-endring.
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
          ariaLabel="Privat-seksjoner"
          reorderMode={reorderMode}
          onReorder={setOrder}
        />
        {/* Dra-håndtak for å endre rekkefølge er kun tilgjengelig på desktop-
            railen — drag-og-slipp av en horisontalt skrollet mobil-stripe
            kolliderer med skroll-gesten, så mobil arver bare sist lagrede
            rekkefølge uten egen dra-affordance. */}
        <button
          type="button"
          onClick={() => setReorderMode((v) => !v)}
          className="hidden self-start rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-2xs font-semibold uppercase text-ink-3 transition hover:border-line-strong hover:text-ink-1 md:block"
        >
          {reorderMode ? "Lagre" : "Endre rekkefølge"}
        </button>
      </div>
      <div key={activeId} ref={paneRef} tabIndex={-1} className="tab-fade min-w-0 flex-1 outline-none">
        <CardErrorBoundary>{sectionNodes[activeId]}</CardErrorBoundary>
      </div>
    </div>
  );
}
