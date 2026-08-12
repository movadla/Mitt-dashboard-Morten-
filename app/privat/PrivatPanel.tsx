"use client";

import { useEffect, useState } from "react";
import { FplBox, type FplData } from "./FplSection";
import { SportSection, WorldCupSection, type SportEvent } from "./SportSection";
import RemindersSection from "./RemindersSection";
import CalendarSection from "./CalendarSection";
import TodaySummary from "./TodaySummary";
import DartsBox from "./DartsBox";
import FinanceSection from "./FinanceSection";
import AlfredSection from "./AlfredSection";
import ShoppingListSection from "./ShoppingListSection";
import NewsSection from "./NewsSection";
import EventsSection from "./EventsSection";
import NotesSection from "./NotesSection";
import { CARD_SHELL, SkeletonRows, usePersistedOrder } from "../CardShell";
import { GripVertical } from "lucide-react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const SECTION_ORDER_KEY = "mitt-dashboard:privat-section-order:v1";
const DEFAULT_SECTION_ORDER = [
  "reminders",
  "calendar",
  "events",
  "notes",
  "finance",
  "sport",
  "worldcup",
  "alfred",
  "shopping",
  "news",
  "fpl",
  "darts",
];

// Grip-håndtak over hvert kort — trykk-og-dra for å flytte kortet i lista,
// f.eks. midlertidig flytte Sport høyere opp i en periode. Rekkefølgen lagres
// lokalt (usePersistedOrder), ikke i skyen.
function SortableSection({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex flex-col gap-1">
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label="Endre rekkefølge på kortet"
        className="mx-auto flex h-4 w-12 items-center justify-center rounded-full text-ink-4/60 transition hover:text-ink-2 active:cursor-grabbing"
        style={{ touchAction: "none", cursor: "grab" }}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {children}
    </div>
  );
}

export default function PrivatPanel() {
  const [fpl, setFpl] = useState<FplData | null>(null);
  const [fplLoading, setFplLoading] = useState(true);
  const [sports, setSports] = useState<SportEvent[]>([]);
  const [sportsLoading, setSportsLoading] = useState(true);
  const [sportsFetchedAt, setSportsFetchedAt] = useState<number | null>(null);
  const [worldCup, setWorldCup] = useState<SportEvent[]>([]);
  const [order, setOrder] = usePersistedOrder(SECTION_ORDER_KEY, DEFAULT_SECTION_ORDER);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    fetch("/api/fpl")
      .then(r => r.json())
      .then(setFpl)
      .finally(() => setFplLoading(false));
    fetch("/api/sports")
      .then(r => r.json())
      .then(d => {
        setSports(d.events ?? []);
        setSportsFetchedAt(d.fetchedAt ?? null);
      })
      .finally(() => setSportsLoading(false));
    fetch("/api/worldcup")
      .then(r => r.json())
      .then(d => setWorldCup(d.events ?? []))
      .catch(() => {});
  }, []);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id as string);
    const newIndex = order.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    setOrder(arrayMove(order, oldIndex, newIndex));
  }

  // null her betyr "ingen kort å vise akkurat nå" (f.eks. tomt VM-program,
  // FPL inaktiv) — da hopper vi over grip-håndtaket også, ikke bare kortet.
  const sectionNodes: Record<string, React.ReactNode> = {
    reminders: <RemindersSection />,
    calendar: <CalendarSection />,
    events: <EventsSection />,
    notes: <NotesSection />,
    finance: <FinanceSection />,
    sport: <SportSection events={sports} loading={sportsLoading} fetchedAt={sportsFetchedAt} />,
    worldcup: worldCup.length > 0 ? <WorldCupSection events={worldCup} /> : null,
    alfred: <AlfredSection />,
    shopping: <ShoppingListSection />,
    news: <NewsSection />,
    fpl: fplLoading ? (
      <div className={`${CARD_SHELL} p-4`}>
        <SkeletonRows count={1} className="h-5" />
      </div>
    ) : fpl && fpl.active && fpl.gw?.deadline ? (
      <FplBox fpl={fpl} />
    ) : null,
    darts: <DartsBox />,
  };

  return (
    <div className="flex flex-col gap-3">
      <TodaySummary />
      {/* Én seksjon per linje, full bredde — en kollapset seksjon er én rad, en
          utvidet seksjon vokser nedover på samme plass. Ingen grid-reflow av
          naboseksjoner (samme mønster som Jobb-fanen bruker). Rekkefølgen kan
          dras om via grip-håndtaket over hvert kort. */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-3">
            {order.map((id) => {
              const node = sectionNodes[id];
              if (!node) return null;
              return (
                <SortableSection key={id} id={id}>
                  {node}
                </SortableSection>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
