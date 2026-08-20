"use client";

import { Component, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Plus, GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// .card-shell (globals.css) gir en lagvis "glass"-skygge (indre høylys + myk
// ytre glød, samme teknikk som Sport/FPL sin .section) — hover:border/shadow
// gir i tillegg en synlig affordance på kort som kan utvides (collapse-header)
// eller drilles ned i (klikkbare rader inni), som dekker praktisk talt alle
// kort i Jobb/Privat siden nesten alle har en av delene.
//
// Hover-kanten er bevisst begrenset til høyre/bunn/venstre (ikke toppen) —
// kort med en aksentfarget topplinje (border-t-2 border-t-X, satt av det
// enkelte kortet) skal beholde den fargen uendret ved hover i stedet for at
// den blir overskrevet av border-line-strong. Dette gjør det også unødvendig
// å bruke !important noe sted for å vinne over border-line: siden CARD_SHELL
// aldri selv setter en border-top-farge, er det ingen kant å konkurrere med.
export const CARD_SHELL =
  "card-shell rounded-2xl border border-line bg-surface-1 transition-shadow duration-150 hover:border-r-line-strong hover:border-b-line-strong hover:border-l-line-strong";

// Fanger opp en kastet feil i ETT kort slik at resten av Jobb-/Privat-
// visningen fortsetter å virke i stedet for at hele siden blankes ut — må
// være en klassekomponent siden React (ennå) ikke har en hooks-variant av
// componentDidCatch/getDerivedStateFromError. "Prøv igjen" nullstiller kun
// denne boundary-en; hvis den underliggende feilen er varig (f.eks. en
// datafeil), vil kortet kaste på nytt til dataen/koden er fikset.
interface CardErrorBoundaryState {
  hasError: boolean;
}

export class CardErrorBoundary extends Component<{ children: ReactNode }, CardErrorBoundaryState> {
  state: CardErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Kort krasjet:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={`${CARD_SHELL} p-4`}>
          <p className="text-sm text-ink-3">Noe gikk galt med dette kortet.</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="mt-2 text-xs font-medium text-ink-2 underline hover:text-ink-1"
          >
            Prøv igjen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Navnet er historisk — tilstanden persisteres bevisst IKKE lenger på tvers av
// sideoppdateringer (jf. tilbakemelding: alle kort skal starte kollapset ved
// hver refresh), kun vanlig useState som toggles innenfor økten.
export function usePersistedCollapse(key: string, defaultCollapsed = false): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return [collapsed, () => setCollapsed((v) => !v)];
}

// Jevn høyde-overgang for kort-innhold som vises/skjules med usePersistedCollapse
// — samme 220ms max-height-teknikk som TodaySummary sin dag-sveip, gjort
// generisk for kollaps/utvid-mønsteret. Erstatter `{!collapsed && (<div>...)}`
// med `<CollapsibleBody collapsed={collapsed}><div>...</div></CollapsibleBody>`.
// Innholdet monteres først når kortet utvides FØRSTE gang (samme lat oppførsel
// som før — ingen ekstra arbeid for skjulte kort), men blir værende montert
// etterpå slik at senere kollaps/utvid-bytter kan animeres (måler faktisk
// scrollHeight istedenfor å hoppe rett fra 0 til full høyde).
export function CollapsibleBody({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  const [everExpanded, setEverExpanded] = useState(!collapsed);
  const ref = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number | "none">(collapsed ? 0 : "none");

  // Justeres direkte i render (ikke i en effekt) — det anbefalte React-mønsteret
  // for å avlede state fra en prop-endring: React fanger opp setState-kallet
  // og gjør om renderen umiddelbart før noe males på skjermen, uten en ekstra
  // effekt-runde.
  if (!collapsed && !everExpanded) {
    setEverExpanded(true);
  }

  useLayoutEffect(() => {
    if (!everExpanded) return;
    const el = ref.current;
    if (!el) return;
    if (collapsed) {
      setMaxHeight(el.scrollHeight);
      const raf = requestAnimationFrame(() => setMaxHeight(0));
      return () => cancelAnimationFrame(raf);
    }
    setMaxHeight(el.scrollHeight);
    const resetId = setTimeout(() => setMaxHeight("none"), 250);
    return () => clearTimeout(resetId);
  }, [collapsed, everExpanded]);

  if (!everExpanded) return null;

  return (
    <div
      ref={ref}
      style={{
        maxHeight: maxHeight === "none" ? "none" : `${maxHeight}px`,
        overflow: maxHeight === "none" ? "visible" : "hidden",
        transition: "max-height 220ms ease",
      }}
    >
      {children}
    </div>
  );
}

// Lar brukeren dra kort til egen rekkefølge (f.eks. flytte Sport-kortet opp en
// periode) — rent lokalt UI-preferanse, samme localStorage-mønster som
// usePersistedCollapse. Ukjente/fjernede id-er luket bort ved lasting, nye
// id-er (f.eks. et nytt kort lagt til i en senere versjon) legges til på slutten
// i stedet for å forsvinne, slik at rekkefølgen aldri mister et kort.
export function usePersistedOrder(storageKey: string, defaultOrder: string[]): [string[], (order: string[]) => void] {
  const [order, setOrder] = useState<string[]>(defaultOrder);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        const known = new Set(defaultOrder);
        const kept = parsed.filter((id) => known.has(id));
        const missing = defaultOrder.filter((id) => !kept.includes(id));
        // localStorage kan ikke leses under SSR/første render uten hydrerings-
        // avvik — dette MÅ skje i en effekt, ikke avledes i render.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOrder([...kept, ...missing]);
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
    // defaultOrder er stabil per kalleside (definert utenfor komponenten) — kun storageKey skal trigge re-lasting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(order));
    } catch {
      /* ignore quota errors */
    }
  }, [order, hydrated, storageKey]);

  return [order, setOrder];
}

// Grip-håndtak ved siden av hvert kort — trykk-og-dra for å flytte kortet i
// lista. Delt mellom Privat- og Jobb-fanen (begge bruker usePersistedOrder
// over). Vises kun i reorderMode (styrt av en "Endre rekkefølge"/"Lagre"-knapp
// over lista) — ellers rendres kortet uten håndtak, siden useSortable sin
// setNodeRef/drag-lytting uansett må festes til noe for at reordering skal
// virke DEN dagen man faktisk går inn i reorderMode.
export function SortableSection({ id, reorderMode, children }: { id: string; reorderMode: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  if (!reorderMode) {
    return (
      <div ref={setNodeRef} style={style}>
        <CardErrorBoundary>{children}</CardErrorBoundary>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-1">
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label="Endre rekkefølge på kortet"
        className="grid w-5 shrink-0 place-items-center rounded-xl text-ink-4/60 transition hover:text-ink-2 active:cursor-grabbing"
        style={{ touchAction: "none", cursor: "grab" }}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <CardErrorBoundary>{children}</CardErrorBoundary>
      </div>
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  collapsed,
  onToggleCollapse,
  onAdd,
  addLabel,
  icon: Icon,
  iconColorClass = "text-ink-3",
  alwaysShowSubtitle = false,
}: {
  title: string;
  subtitle?: React.ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onAdd?: () => void;
  addLabel?: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconColorClass?: string;
  // Kollapset kort viser normalt KUN tittelen — ingen forhåndsvisningstekst
  // (tall, status osv.). Sett denne når subtitle er en aktiv frist/nedtelling
  // (f.eks. FPL-deadline) som er nyttig å se selv når kortet er lukket.
  alwaysShowSubtitle?: boolean;
}) {
  const showSubtitle = subtitle && (alwaysShowSubtitle || !collapsed);
  // Avledet fra iconColorClass ("text-X" -> "bg-X/10") — gir ikonet en rund
  // fargechip-bakgrunn i samme aksentfarge i stedet for å flyte fritt, uten at
  // hvert kall-sted må sette to separate farge-props som uansett alltid skal
  // matche hverandre.
  const iconBgClass = `${iconColorClass.replace("text-", "bg-")}/10`;

  const inner = (
    <>
      <div className="flex min-w-0 items-center gap-2">
        {Icon && (
          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${iconBgClass}`}>
            <Icon className={`h-3.5 w-3.5 ${iconColorClass}`} />
          </span>
        )}
        <h3 className="truncate text-sm font-semibold text-ink-1">{title}</h3>
      </div>
      <div className="flex shrink-0 items-baseline gap-2">
        {showSubtitle && <span className="text-xs tabular-nums text-ink-3">{subtitle}</span>}
        {onToggleCollapse && (
          <svg
            viewBox="0 0 16 16"
            className={`h-3.5 w-3.5 text-ink-3 transition-transform ${collapsed ? "-rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        )}
      </div>
    </>
  );

  // Egen knapp ved siden av (ikke inni) collapse-toggle-knappen — en <button>
  // inni en <button> er ugyldig HTML og ville uansett trigget begge handlingene.
  const addButton = onAdd && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onAdd();
      }}
      aria-label={addLabel ?? `Legg til i ${title}`}
      title={addLabel ?? `Legg til i ${title}`}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-surface-2 hover:text-ink-1"
    >
      <Plus className="h-4 w-4" />
    </button>
  );

  if (!onToggleCollapse) {
    return (
      <div className="mb-2 flex items-center justify-between gap-2">
        {inner}
        {addButton}
      </div>
    );
  }

  if (!onAdd) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={collapsed ? `Vis ${title}` : `Skjul ${title}`}
        aria-expanded={!collapsed}
        className="-mx-1 mb-2 flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left transition hover:bg-surface-2/60 active:opacity-80"
      >
        {inner}
      </button>
    );
  }

  return (
    <div className="-mx-1 mb-2 flex items-center gap-1">
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={collapsed ? `Vis ${title}` : `Skjul ${title}`}
        aria-expanded={!collapsed}
        className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left transition hover:bg-surface-2/60 active:opacity-80"
      >
        {inner}
      </button>
      {addButton}
    </div>
  );
}

// Delt bekreftelsesdialog foran destruktive handlinger (sletting) — brukes IKKE
// foran avhuking/toggle, kun der data faktisk forsvinner permanent.
export function ConfirmDialog({
  open,
  title = "Er du sikker?",
  message,
  confirmLabel = "Slett",
  confirmVariant = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Husker hva som hadde fokus FØR dialogen åpnet (typisk slett-knappen som
  // trigget den) slik at et tastatur-drevet besøk ikke mister stedet sitt i
  // siden når dialogen lukkes igjen.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key === "Tab") {
        // Enkel fokusfelle mellom de to knappene i dialogen.
        e.preventDefault();
        const focusOnCancel = document.activeElement !== cancelRef.current;
        (focusOnCancel ? cancelRef.current : confirmRef.current)?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocusedRef.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line-strong bg-surface-1 p-4 shadow-xl shadow-black/30"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <h3 className="text-sm font-semibold text-ink-1">{title}</h3>
        <p className="mt-1.5 text-sm text-ink-3">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-3 transition hover:text-ink-1"
          >
            Avbryt
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-surface-0 transition ${
              confirmVariant === "danger"
                ? "bg-status-danger hover:bg-status-danger/85"
                : "bg-accent hover:bg-accent/85"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Liten hjelper for "trykk slett -> vis bekreftelse -> slett for ekte": holder
// hvilket element (id eller annen nøkkel) som venter på bekreftelse.
export function useConfirmDelete<T = string>() {
  const [pending, setPending] = useState<T | null>(null);
  return {
    pending,
    isOpen: pending !== null,
    request: (item: T) => setPending(item),
    cancel: () => setPending(null),
  };
}

// Enkel, ikke-blokkerende feilmelding for mislykkede lagringer/slettinger —
// vises kort ved siden av handlingen i stedet for at feilen forsvinner
// stille. Tidligere kastet praktisk talt alle mutasjoner i appen bort
// nettverks-/serverfeil uten noe synlig tegn til brukeren.
export function useMutationError(autoClearMs = 4000) {
  const [message, setMessage] = useState<string | null>(null);
  function show(msg: string) {
    setMessage(msg);
    setTimeout(() => {
      setMessage((current) => (current === msg ? null : current));
    }, autoClearMs);
  }
  return { message, show, clear: () => setMessage(null) };
}

export function MutationError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-xs text-status-danger">{message}</p>;
}

// Delt hakemerke-ikon for "ferdig"-tilstand — tidligere reimplementert med
// litt ulik viewBox/strekbredde tre separate steder (Reminders-rad,
// underoppgave-rad, TodaySummary sin ReminderLine).
export function CheckIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5L6.5 12 13 5" />
    </svg>
  );
}

export function SkeletonRows({ count = 2, className = "h-12" }: { count?: number; className?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />
      ))}
    </div>
  );
}

// Delt "forslag"-liste — Claude legger inn forslag til påminnelser/hendelser/
// kalendernotater under en research-runde (lib/jobbSuggestions.ts), og
// Morten godkjenner eller avslår hvert enkelt her, i toppen av seksjonen de
// gjelder. Samme visuelle mønster (gul/varsel-aksent) brukt i alle tre
// seksjoner (Påminnelser, Hendelser, Kalender) for gjenkjennelighet.
export function SuggestionList<T extends { id: string; title: string; date?: string; sourceRef: string }>({
  suggestions,
  onAccept,
  onDecline,
}: {
  suggestions: T[];
  onAccept: (s: T) => void;
  onDecline: (s: T) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-status-warning/30 bg-status-warning/[0.06] p-2.5">
      <p className="text-2xs font-semibold uppercase tracking-wide text-status-warning">
        {suggestions.length === 1 ? "1 forslag" : `${suggestions.length} forslag`}
      </p>
      {suggestions.map((s) => (
        <div key={s.id} className="rounded-lg bg-surface-1 p-2">
          <p className="text-sm text-ink-1">{s.title}</p>
          <p className="mt-0.5 text-2xs text-ink-4">{s.sourceRef}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAccept(s)}
              className="rounded-md bg-status-positive/15 px-2 py-1 text-2xs font-semibold text-status-positive transition hover:bg-status-positive/25"
            >
              Godta
            </button>
            <button
              type="button"
              onClick={() => onDecline(s)}
              className="rounded-md px-2 py-1 text-2xs font-medium text-ink-4 transition hover:text-ink-2"
            >
              Avslå
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
