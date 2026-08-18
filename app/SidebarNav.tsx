"use client";

import { useRef } from "react";
import { GripVertical } from "lucide-react";
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
  compact = false,
}: {
  item: NavItem;
  active: boolean;
  tabIndex: 0 | -1;
  onSelect: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  buttonRef?: (el: HTMLButtonElement | null) => void;
  compact?: boolean;
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
      className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium transition ${
        compact ? "" : "w-full"
      } ${
        active
          ? "bg-accent-privat/15 text-accent-privat ring-1 ring-accent-privat/40"
          : "text-ink-3 hover:bg-surface-2/60 hover:text-ink-1"
      }`}
    >
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${iconChipClass(item.iconColorClass)}`}>
        <Icon className={`h-3.5 w-3.5 ${item.iconColorClass}`} />
      </span>
      <span className={compact ? "whitespace-nowrap" : "truncate"}>{item.label}</span>
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
}: {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string, opts?: { keepFocus?: boolean }) => void;
  ariaLabel: string;
  reorderMode?: boolean;
  onReorder?: (order: string[]) => void;
}) {
  const railRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const stripRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Piltast-navigasjon velger elementet umiddelbart (samme "automatic
  // activation"-mønster som ARIA-tabs anbefaler), men skal IKKE flytte fokus
  // inn i panelet slik et klikk gjør — det ville revet fokus bort fra
  // tablisten etter første piltrykk og gjort det umulig å fortsette å bla.
  function moveFocus(refs: Record<string, HTMLButtonElement | null>, delta: number) {
    const ids = items.map((i) => i.id);
    const currentIndex = ids.indexOf(activeId);
    const nextIndex = (currentIndex + delta + ids.length) % ids.length;
    const nextId = ids[nextIndex];
    onSelect(nextId, { keepFocus: true });
    refs[nextId]?.focus();
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
      railRefs.current[items[0].id]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      const last = items[items.length - 1].id;
      onSelect(last, { keepFocus: true });
      railRefs.current[last]?.focus();
    }
  }

  function handleStripKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      moveFocus(stripRefs.current, 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveFocus(stripRefs.current, -1);
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

      {/* Mobil: wrappet grid av chips, fast rekkefølge (samme som railen sist
          lagret), ingen dra — se komponent-kommentaren over. */}
      <nav
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        className="flex flex-wrap gap-2 md:hidden"
      >
        {items.map((item) => {
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
              compact
            />
          );
        })}
      </nav>
    </>
  );
}
