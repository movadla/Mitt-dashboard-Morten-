"use client";

import { useRef, useState } from "react";
import { GripVertical, MoreHorizontal } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColorClass: string;
  // Antall utestående ting i denne fanen (ugjorte oppgaver/påminnelser) —
  // vises som en liten rød varselboble oppå ikonet, samme mønster som
  // app-badges på iOS. 0/undefined viser ingen boble.
  badge?: number;
}

// iOS-stil: viser eksakt tall opp til 99, ellers "99+".
function BadgeDot({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 z-10 grid h-4 min-w-4 place-items-center rounded-full bg-status-danger px-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-surface-0">
      {count > 99 ? "99+" : count}
    </span>
  );
}

// Delt av desktop-rail og mobil-stripen under — samme avledning som CardHeader
// bruker (iconColorClass "text-X" -> ikon-chip-bakgrunn "bg-X/10").
function iconChipClass(iconColorClass: string) {
  return `${iconColorClass.replace("text-", "bg-")}/10`;
}

function NavButton({
  item,
  active,
  tabIndex,
  onSelect,
  onKeyDown,
  buttonRef,
  dense = false,
}: {
  item: NavItem;
  active: boolean;
  tabIndex: 0 | -1;
  onSelect: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  buttonRef?: (el: HTMLButtonElement | null) => void;
  // dense = mobil-gridets 4-per-rad-celler: mindre ikon/tekst/padding enn
  // desktop-railens knapper, som har mer bredde å boltre seg på.
  dense?: boolean;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      role="tab"
      ref={buttonRef}
      aria-selected={active}
      tabIndex={tabIndex}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={`flex w-full min-w-0 items-center rounded-xl font-medium transition ${
        dense ? "min-h-14 flex-col justify-center gap-1 px-1 py-1.5 text-center text-2xs" : "min-h-11 gap-2 px-3 text-sm"
      } ${
        // .nav-tile / .nav-tile-active (globals.css): halvgjennomsiktig glass
        // som slipper bakgrunnsgradienten gjennom, slik at navigasjonen trer
        // tilbake og bare den valgte flisen er en tett, opplyst flate.
        active ? "nav-tile-active font-semibold text-accent-privat" : "nav-tile text-ink-3 hover:text-ink-1"
      }`}
    >
      <span
        className={`relative grid shrink-0 place-items-center rounded-full ${iconChipClass(item.iconColorClass)} ${
          dense ? "h-5 w-5" : "h-6 w-6"
        }`}
      >
        <Icon className={`${dense ? "h-3 w-3" : "h-3.5 w-3.5"} ${item.iconColorClass}`} />
        <BadgeDot count={item.badge ?? 0} />
      </span>
      <span className="w-full truncate leading-tight">{item.label}</span>
    </button>
  );
}

function SortableNavButton({
  item,
  active,
  tabIndex,
  onSelect,
  onKeyDown,
  buttonRef,
}: {
  item: NavItem;
  active: boolean;
  tabIndex: 0 | -1;
  onSelect: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  buttonRef?: (el: HTMLButtonElement | null) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-1">
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Endre rekkefølge på ${item.label}`}
        className="grid w-5 shrink-0 place-items-center rounded-lg text-ink-4/60 transition hover:text-ink-2 active:cursor-grabbing"
        style={{ touchAction: "none", cursor: "grab" }}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1">
        <NavButton
          item={item}
          active={active}
          tabIndex={tabIndex}
          onSelect={onSelect}
          onKeyDown={onKeyDown}
          buttonRef={buttonRef}
        />
      </div>
    </div>
  );
}

// Delt, generisk navigasjonskomponent — brukes i dag av Privat-fanen, bygget
// for at Jobb-fanen skal kunne gjenbruke den uendret i en senere runde.
// Renderer samme items/activeId/onSelect-state på to måter: en vertikal rail
// til venstre på md:+ (med valgfri dra-og-slipp-omorganisering), og et
// wrappet grid av chips på mobil (fast rekkefølge, ingen dra — hele poenget
// er at ALLE kategorier skal være synlige samtidig uten skjult skroll, en
// horisontal stripe skjulte for mange av dem bak kanten).
export function SidebarNav({
  items,
  activeId,
  onSelect,
  ariaLabel,
  reorderMode = false,
  onReorder,
  secondaryIds,
}: {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string, opts?: { keepFocus?: boolean }) => void;
  ariaLabel: string;
  reorderMode?: boolean;
  onReorder?: (order: string[]) => void;
  // Seksjoner som skal ligge bak "Mer"-flisen nederst til høyre på mobil, i
  // stedet for å ta plass i det faste rutenettet. Kun mobil — desktop-railen
  // har vertikal plass til alle og viser dem alltid.
  secondaryIds?: string[];
}) {
  const railRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const stripRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [showSecondary, setShowSecondary] = useState(false);

  const secondarySet = new Set(secondaryIds ?? []);
  const primaryItems = items.filter((i) => !secondarySet.has(i.id));
  const secondaryItems = items.filter((i) => secondarySet.has(i.id));
  const hasSecondary = secondaryItems.length > 0;
  // Er en skjult seksjon valgt (f.eks. via søk eller en hopp-lenke), må raden
  // åpnes — ellers står den aktive fanen usynlig og navigasjonen ser ut til å
  // ikke ha noen markering i det hele tatt.
  const activeInSecondary = secondarySet.has(activeId);
  const secondaryOpen = showSecondary || activeInSecondary;
  // Piltast-navigasjon på mobil skal bare treffe fliser som faktisk er synlige.
  const stripItems = secondaryOpen ? [...primaryItems, ...secondaryItems] : primaryItems;

  // Piltast-navigasjon velger elementet umiddelbart (samme "automatic
  // activation"-mønster som ARIA-tabs anbefaler), men skal IKKE flytte fokus
  // inn i panelet slik et klikk gjør — det ville revet fokus bort fra
  // tablisten etter første piltrykk og gjort det umulig å fortsette å bla.
  function moveFocus(refs: Record<string, HTMLButtonElement | null>, delta: number, list: NavItem[] = items) {
    const ids = list.map((i) => i.id);
    if (ids.length === 0) return;
    const currentIndex = ids.indexOf(activeId);
    const nextIndex = (currentIndex + delta + ids.length) % ids.length;
    const nextId = ids[nextIndex];
    onSelect(nextId, { keepFocus: true });
    refs[nextId]?.focus({ preventScroll: true });
  }

  function handleRailKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(railRefs.current, 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(railRefs.current, -1);
    } else if (e.key === "Home") {
      e.preventDefault();
      onSelect(items[0].id, { keepFocus: true });
      railRefs.current[items[0].id]?.focus({ preventScroll: true });
    } else if (e.key === "End") {
      e.preventDefault();
      const last = items[items.length - 1].id;
      onSelect(last, { keepFocus: true });
      railRefs.current[last]?.focus({ preventScroll: true });
    }
  }

  function handleStripKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      moveFocus(stripRefs.current, 1, stripItems);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveFocus(stripRefs.current, -1, stripItems);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;
    const ids = items.map((i) => i.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  }

  return (
    <>
      {/* Desktop/nettbrett: vertikal rail til venstre. */}
      <nav
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation="vertical"
        className="hidden shrink-0 flex-col gap-1 md:flex md:w-56"
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((item) => {
              const active = item.id === activeId;
              const tabIndex: 0 | -1 = active ? 0 : -1;
              const onSelectItem = () => onSelect(item.id);
              const buttonRef = (el: HTMLButtonElement | null) => {
                railRefs.current[item.id] = el;
              };
              return reorderMode ? (
                <SortableNavButton
                  key={item.id}
                  item={item}
                  active={active}
                  tabIndex={tabIndex}
                  onSelect={onSelectItem}
                  onKeyDown={handleRailKeyDown}
                  buttonRef={buttonRef}
                />
              ) : (
                <NavButton
                  key={item.id}
                  item={item}
                  active={active}
                  tabIndex={tabIndex}
                  onSelect={onSelectItem}
                  onKeyDown={handleRailKeyDown}
                  buttonRef={buttonRef}
                />
              );
            })}
          </SortableContext>
        </DndContext>
      </nav>

      {/* Mobil: ekte grid (like brede kolonner) i stedet for flex-wrap — chips
          med tekst-bred bredde ga urolige, uinnrettede rader. 4 kolonner med
          "dense" ikon-over-tekst-knapper. Fast rekkefølge (samme som railen
          sist lagret), ingen dra — se komponent-kommentaren over.

          De tre sjeldnest brukte seksjonene ligger bak "Mer"-flisen nederst
          til høyre, slik at rutenettet normalt er tre rader og ikke fire. */}
      <nav
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        className="grid grid-cols-4 gap-1.5 md:hidden"
      >
        {primaryItems.map((item) => {
          const active = item.id === activeId;
          return (
            <NavButton
              key={item.id}
              item={item}
              active={active}
              tabIndex={active ? 0 : -1}
              onSelect={() => onSelect(item.id)}
              onKeyDown={handleStripKeyDown}
              buttonRef={(el) => {
                stripRefs.current[item.id] = el;
              }}
              dense
            />
          );
        })}

        {hasSecondary && (
          // Ikke role="tab": dette velger ingen seksjon, den bare viser flere
          // fliser. En tab uten tilhørende panel ville løyet til skjermlesere.
          <button
            type="button"
            onClick={() => setShowSecondary((v) => !v)}
            aria-expanded={secondaryOpen}
            aria-label={secondaryOpen ? "Skjul flere seksjoner" : "Vis flere seksjoner"}
            className={`flex min-h-14 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center text-2xs font-medium transition ${
              secondaryOpen ? "nav-tile-active text-accent-privat" : "nav-tile text-ink-3 hover:text-ink-1"
            }`}
          >
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink-3/10">
              <MoreHorizontal className="h-3 w-3 text-ink-3" />
            </span>
            <span className="w-full truncate leading-tight">Mer</span>
          </button>
        )}

        {secondaryOpen &&
          secondaryItems.map((item) => {
            const active = item.id === activeId;
            return (
              <NavButton
                key={item.id}
                item={item}
                active={active}
                tabIndex={active ? 0 : -1}
                onSelect={() => onSelect(item.id)}
                onKeyDown={handleStripKeyDown}
                buttonRef={(el) => {
                  stripRefs.current[item.id] = el;
                }}
                dense
              />
            );
          })}
      </nav>
    </>
  );
}
