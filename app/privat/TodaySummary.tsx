"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import useSWR from "swr";
import { CheckIcon, MutationError, SkeletonRows, useMutationError } from "../CardShell";
import { jsonFetcher } from "@/lib/swrFetcher";
import { markJustToggled, useJustToggled } from "@/lib/justToggled";
import type { Reminder } from "@/lib/reminders";
import type { DiaryEntry } from "@/lib/diary";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { setAppBadgeCount } from "@/lib/appBadge";
import type { PrivatCalendarEvent } from "@/lib/privatCalendar";
import { LEAGUE_ROUND_CATEGORIES, LEAGUE_ROUND_LABELS } from "@/lib/sportsCategories";
import type { SportEvent } from "@/lib/sports";
import type { FplData } from "@/lib/fpl";
import type { HourlyForecast, WeatherData } from "@/lib/weather";
import type { LifeEvent } from "@/lib/payday";
import type { NewsItem } from "@/lib/news";
import { addDaysIso, isPaydayToday, localDateString, occursOnDate, toOsloDateString, weekdayDateLabel } from "@/lib/payday";
import type { AiUsageSummary } from "@/lib/aiUsage";
import { formatUsd } from "@/lib/widgets";
import { vibrate } from "@/lib/haptics";
import {
  Sun,
  Cloud,
  CloudSun,
  CloudRain,
  CloudDrizzle,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Bell,
  Calendar,
  CalendarClock,
  Trophy,
  Shirt,
  PartyPopper,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Bot,
  Moon,
  Newspaper,
  Info,
} from "lucide-react";

const MAX_OFFSET = 365;
const SWIPE_THRESHOLD = 60;

// Time på dagen i Oslo-tid (0-23), uavhengig av enhetens egen tidssone —
// styrer når kveldsloggen dukker opp (fra kl. 21:00). Intl med hourCycle
// "h23" i stedet for locale-string-parsing for å unngå tvetydig AM/PM/
// kl.-formatering på tvers av nettlesere.
function osloHour(): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
}

// Kategori-ikonet ligger til venstre for teksten, på linje med den (ikke som
// en egen rad over) — men beholder en skjult tekst for skjermlesere og en
// title-tooltip.
function CategoryRow({
  icon: Icon,
  colorClass,
  label,
  onJump,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  label: string;
  // Når satt: ikonet/etiketten blir en knapp som hopper til den fulle
  // seksjonen — en rad i "I dag" skal ikke være en blindvei.
  onJump?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2" title={onJump ? undefined : label}>
      {onJump ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={onJump}
                aria-label={`Gå til ${label}`}
                className="mt-0.5 grid h-6 w-6 shrink-0 -translate-x-1 place-items-center rounded-full transition hover:bg-surface-2"
              >
                <Icon className={`h-4 w-4 ${colorClass}`} />
              </button>
            }
          />
          <TooltipContent>Gå til {label}</TooltipContent>
        </Tooltip>
      ) : (
        <>
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${colorClass}`} />
          <span className="sr-only">{label}</span>
        </>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// Én påminnelseslinje i "I dag" — prikk foran teksten skiller radene fra
// hverandre når det er flere på samme dag, rød tekst for oversittede, og et
// lite kalenderikon lar deg endre fristen direkte uten å åpne Påminnelser-kortet.
function ReminderLine({
  reminder,
  overdue,
  editing,
  onStartEdit,
  onChangeDueDate,
  onCancelEdit,
  onToggleDone,
}: {
  reminder: Reminder;
  overdue: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onChangeDueDate: (date: string) => void;
  onCancelEdit: () => void;
  onToggleDone: () => void;
}) {
  return (
    <li className="flex items-start gap-1.5">
      <button
        type="button"
        onClick={onToggleDone}
        aria-pressed={reminder.done}
        aria-label={reminder.done ? "Merk som ikke fullført" : "Merk som fullført"}
        className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ring-1 ring-inset transition ${
          reminder.done ? "bg-emerald-500 ring-emerald-500" : "bg-transparent ring-line-strong hover:ring-ink-3"
        }`}
      >
        {reminder.done && <CheckIcon className="h-2.5 w-2.5 text-white" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`min-w-0 text-sm ${reminder.done ? "text-ink-4 line-through" : "font-medium text-ink-1"}`}>
            {reminder.text}
          </span>
          <button
            type="button"
            onClick={onStartEdit}
            aria-label={overdue ? "Oversittet frist — endre frist" : "Endre frist"}
            title={overdue ? "Oversittet frist — endre frist" : "Endre frist"}
            className={`shrink-0 transition ${overdue && !reminder.done ? "text-status-danger hover:text-status-danger/80" : "text-ink-4 hover:text-ink-2"}`}
          >
            <CalendarClock className="h-3 w-3" />
          </button>
        </div>
        {editing && (
          <input
            type="date"
            autoFocus
            defaultValue={reminder.dueDate ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancelEdit();
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            onBlur={(e) => {
              // Lagre kun når feltet faktisk inneholder en gyldig, komplett dato —
              // en input som fortsatt er delvis tastet inn gir "" her, og skal
              // ikke tolkes som "fjern fristen".
              if (e.target.value) onChangeDueDate(e.target.value);
              onCancelEdit();
            }}
            className="mt-1 rounded-lg border border-line bg-surface-1 px-2 py-1 text-xs text-ink-2 outline-none focus:border-line-strong"
          />
        )}
      </div>
    </li>
  );
}

// Samlelinje for en full liga-runde (Eliteserien/PL/FA Cup/Champions League)
// eller andre grupperte kamper — viser kun antall kamper, med drill-down på
// klikk i stedet for å liste alle enkeltvis og oversvømme "I dag". `label`
// er den FULLE synlige teksten (ikke bare turneringsnavnet) siden ikke alle
// bruksområder er en "X-runde" (se "Norske lag i Europa"-bruken).
function SportRoundLine({ label, matches }: { label: string; matches: SportEvent[] }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="text-sm text-ink-1">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1.5 text-left">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 text-2xs tabular-nums text-ink-4">{matches.length} kamper</span>
        <ChevronDown className={`h-3 w-3 shrink-0 text-ink-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="mt-1 flex flex-col gap-1 border-l border-line pl-2">
          {matches.map((m) => (
            <li key={m.id} className="flex items-baseline justify-between gap-2 text-xs text-ink-3">
              <span className="min-w-0 truncate">{m.name}</span>
              {m.time && <span className="shrink-0 tabular-nums">{m.time}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// Overskrift for den viste dagen — alltid samme format og rekkefølge
// (ukedag, så dato), uansett hvilken dag som vises, slik at teksten ikke
// bytter form/plassering når man blar mellom dager med pil-navigeringen.
// "Tilbake til i dag"-knappen dekker signalet om at man ser en annen dag.

function baseSymbol(s: string): string {
  return s.replace(/_day|_night|_polartwilight/, "");
}

// Fargekoding for raskere skanning av timeoversikten. Fire tydelig atskilte
// fargefamilier for de fire vanligste tilstandene — sol (gul), delvis skyet
// (oransje, skiller seg fra solens gul), overskyet (grå, ingen varme), regn
// (blå) — pluss snø/tåke/torden. Fargen kommer fra symbolet selv (ikke fra
// kalleren sin className), så alle bruksstedene får samme fargelogikk.
function weatherColorClass(s: string): string {
  if (s.includes("thunder")) return "text-violet-400";
  if (s === "heavyrain" || s === "rain") return "text-blue-500";
  if (s.includes("rain") || s.includes("shower") || s.includes("sleet")) return "text-blue-300";
  if (s.includes("snow")) return "text-sky-100";
  if (s === "fog") return "text-slate-400";
  if (s === "clearsky") return "text-yellow-300";
  if (s === "cloudy") return "text-slate-300";
  if (s === "fair" || s.includes("partly")) return "text-orange-300";
  return "text-slate-300";
}

function WeatherIcon({ symbol, className }: { symbol: string; className?: string }) {
  const s = baseSymbol(symbol);
  const cls = `${weatherColorClass(s)} ${className ?? ""}`.trim();
  if (s.includes("thunder")) return <CloudLightning className={cls} />;
  if (s === "heavyrain" || s === "rain") return <CloudRain className={cls} />;
  if (s.includes("rain") || s.includes("shower") || s.includes("sleet")) return <CloudDrizzle className={cls} />;
  if (s.includes("snow")) return <CloudSnow className={cls} />;
  if (s === "fog") return <CloudFog className={cls} />;
  if (s === "clearsky") return <Sun className={cls} />;
  if (s === "cloudy") return <Cloud className={cls} />;
  if (s === "fair" || s.includes("partly")) return <CloudSun className={cls} />;
  return <Cloud className={cls} />;
}

function hourLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

function weatherSymbolLabel(symbol: string): string {
  const s = baseSymbol(symbol);
  if (s.includes("thunder")) return "Tordenbyger";
  if (s === "heavyrain") return "Kraftig regn";
  if (s === "rain") return "Regn";
  if (s.includes("shower") || s.includes("rain")) return "Byger utover døgnet";
  if (s.includes("sleet")) return "Sludd";
  if (s.includes("snow")) return "Snø";
  if (s === "fog") return "Tåke";
  if (s === "clearsky") return "Klarvær";
  if (s === "cloudy") return "Skyet";
  if (s === "fair" || s.includes("partly")) return "Delvis skyet";
  return "Skiftende";
}

// Kort tekstbeskrivelse (ikke en graf) av værtypen for en dag — forklarende
// setning bak "info"-knappen, se WeatherInfo. Bevisst enkel prosa, ikke et
// forsøk på å visualisere time for time.
function weatherDescription(hours: HourlyForecast[], fallbackSymbol: string): string {
  if (hours.length === 0) return "";
  const high = Math.max(...hours.map((h) => h.temp));
  const low = Math.min(...hours.map((h) => h.temp));
  const precipMm = Math.round(hours.reduce((sum, h) => sum + h.precipitationMm, 0) * 10) / 10;
  const midSymbol = hours[Math.floor(hours.length / 2)]?.symbol ?? hours[0]?.symbol ?? fallbackSymbol;
  const precipPart = precipMm > 0 ? ` Nedbør ventet, opptil ${precipMm} mm.` : " Ingen nedbør ventet.";
  return `${weatherSymbolLabel(midSymbol)}. Høy ${high}°, lav ${low}°.${precipPart}`;
}

// Kort skriftlig værbeskrivelse bak en egen "info"-knapp — velger AUTOMATISK
// i dag vs. i morgen ut fra klokkeslettet (fra kl. 20 beskrives i morgen i
// stedet, siden resten av dagens vær ikke lenger er det interessante).
function WeatherInfo({ weather, nowHour }: { weather: WeatherData; nowHour: number }) {
  const firstDate = toOsloDateString(new Date(weather.hourly[0].time));
  const todayHours = weather.hourly.filter((h) => toOsloDateString(new Date(h.time)) === firstDate);
  const tomorrowHours = weather.hourly.filter((h) => toOsloDateString(new Date(h.time)) !== firstDate);
  const showTomorrow = nowHour >= 20 && tomorrowHours.length >= 2;
  const label = showTomorrow ? "I morgen" : "I dag";
  const description = weatherDescription(showTomorrow ? tomorrowHours : todayHours, weather.symbol);

  return (
    <div className="mb-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className="mt-0.5 text-sm text-ink-1">{description}</p>
    </div>
  );
}

// "Viktig" for "I dag"-widgeten betyr IKKE lenger bare AI-ens isolerte per-
// artikkel-vurdering — det krever at minst to ULIKE kilder melder samme sak
// (lib/news.ts sin sourceCount, satt av kryss-kilde-duplikatsjekken), OG at
// den ikke er vurdert som lav personlig relevans. Flere medier om samme sak
// ER selve viktighets-signalet her, jf. tilbakemelding — AI-relevansen
// brukes kun som et filter mot saker som åpenbart ikke er relevante for
// Morten spesifikt (f.eks. lav-vurdert kjendisstoff som likevel dekkes bredt).
function isImportantNews(item: NewsItem): boolean {
  return (item.sourceCount ?? 1) >= 2 && item.importance !== "lav";
}

function shortNewsTitle(item: NewsItem): string {
  const title = item.aiTitle ?? item.title;
  return title.length > 42 ? `${title.slice(0, 42).trimEnd()}…` : title;
}

// De 5 "viktigste" nyhetene — se isImportantNews. De vises direkte i "I dag"
// uten et eget klikk (med en "Viktig"-markør + miniatyrbilde), resten ligger
// bak en liten "flere nyheter"-knapp. Å trykke en sak hopper til hele
// Nyheter-seksjonen (samme onJump som resten av "I dag") i stedet for å åpne
// artikkelen direkte — "I dag" skal ikke være en blindvei ut av appen.
function NewsPreview({ items, onJump }: { items: NewsItem[]; onJump: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const ranked = [...items]
    .sort((a, b) => Number(isImportantNews(b)) - Number(isImportantNews(a)))
    .slice(0, 5);
  if (ranked.length === 0) return <p className="text-sm text-ink-3">Ingen nyheter tilgjengelig.</p>;
  const high = ranked.filter(isImportantNews);
  const rest = ranked.filter((i) => !isImportantNews(i));

  function NewsLine({ item, dimmed }: { item: NewsItem; dimmed?: boolean }) {
    return (
      <li>
        <button type="button" onClick={onJump} className="flex w-full items-center gap-2 text-left hover:text-accent-privat">
          {item.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
          )}
          <span className={`flex min-w-0 flex-1 items-baseline gap-1.5 text-sm ${dimmed ? "text-ink-2" : "text-ink-1"}`}>
            {isImportantNews(item) && (
              <span className="shrink-0 rounded-full bg-status-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-warning">
                Viktig
              </span>
            )}
            <span className="min-w-0 truncate">{shortNewsTitle(item)}</span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {high.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {high.map((item) => (
            <NewsLine key={item.link} item={item} />
          ))}
        </ul>
      )}
      {high.length === 0 && rest.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          <NewsLine item={rest[0]} dimmed />
        </ul>
      )}
      {(() => {
        const remaining = high.length > 0 ? rest : rest.slice(1);
        if (remaining.length === 0) return null;
        return (
          <>
            {showAll && (
              <ul className="flex flex-col gap-1.5">
                {remaining.map((item) => (
                  <NewsLine key={item.link} item={item} dimmed />
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="self-start text-xs font-medium text-accent-privat hover:text-accent-privat/80"
            >
              {showAll ? "Vis mindre" : `${remaining.length} flere ${remaining.length === 1 ? "nyhet" : "nyheter"}`}
            </button>
          </>
        );
      })()}
    </div>
  );
}

export default function TodaySummary({ onJump }: { onJump: (id: string) => void }) {
  // Delt SWR-cache (samme nøkkel/URL brukt av de fulle kortene, f.eks.
  // RemindersSection) — deduperer kallene istedenfor at "I dag"-boksen og
  // det fulle kortet henter akkurat det samme to ganger ved hver visning.
  const { data: remindersData, mutate: mutateReminders } = useSWR<{ reminders: Reminder[] }>("/api/reminders", jsonFetcher);
  const { data: calendarData } = useSWR<{ events: PrivatCalendarEvent[] }>("/api/privat-calendar", jsonFetcher);
  const { data: sportsData } = useSWR<{ events: SportEvent[] }>("/api/sports", jsonFetcher);
  const { data: fplRaw } = useSWR<FplData | { error: string }>("/api/fpl", jsonFetcher);
  const { data: weatherRaw } = useSWR<WeatherData | { error: string }>("/api/weather", jsonFetcher);
  const { data: eventsData } = useSWR<{ events: LifeEvent[] }>("/api/events", jsonFetcher);
  const { data: aiUsageRaw } = useSWR<AiUsageSummary | { error: string }>("/api/ai-usage", jsonFetcher);
  const { data: diaryData } = useSWR<{ entries: DiaryEntry[] }>("/api/diary", jsonFetcher);
  const { data: newsData } = useSWR<{ items: NewsItem[] }>("/api/news", jsonFetcher);

  const reminders = remindersData?.reminders ?? [];
  const events = calendarData?.events ?? [];
  const sports = sportsData?.events ?? [];
  const fpl = fplRaw && !("error" in fplRaw) ? fplRaw : null;
  const weather = weatherRaw && !("error" in weatherRaw) ? weatherRaw : null;
  const lifeEvents = eventsData?.events ?? [];
  const aiUsage = aiUsageRaw && !("error" in aiUsageRaw) ? aiUsageRaw : null;
  const diaryEntries = diaryData?.entries ?? [];
  const news = newsData?.items ?? [];
  const loading = [remindersData, calendarData, sportsData, fplRaw, weatherRaw, eventsData, aiUsageRaw].some(
    (d) => d === undefined,
  );

  // Kveldsloggen skal dukke opp live kl. 21:00 uten at man må laste siden på
  // nytt — et minutt-tick er nok presisjon for det, ingen sekund-oppdatering.
  const [nowHour, setNowHour] = useState(osloHour);
  useEffect(() => {
    const id = setInterval(() => setNowHour(osloHour()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [weatherExpanded, setWeatherExpanded] = useState(false);
  const [weatherInfoOpen, setWeatherInfoOpen] = useState(false);
  const [viewedOffset, setViewedOffset] = useState(0);
  const [slideDirection, setSlideDirection] = useState<"forward" | "backward" | null>(null);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [addingReminder, setAddingReminder] = useState(false);
  const [newReminderText, setNewReminderText] = useState("");
  const [newReminderTime, setNewReminderTime] = useState("");
  const [submittingReminder, setSubmittingReminder] = useState(false);
  // Delt med Påminnelser-kortet/JobbRemindersSection via lib/justToggled.ts
  // (se feedback_checkoff-visible-feedback-memory) — holder en nettopp
  // fullført påminnelse synlig ~700ms før den forsvinner fra "I dag".
  const justToggled = useJustToggled();
  const mutationError = useMutationError();

  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragAxis = useRef<"x" | "y" | null>(null);
  // Jevn høyde-overgang ved dagbytte — ulike dager har ulikt antall
  // påminnelser/hendelser, så innholdet hopper brått til ny høyde med det
  // samme uten dette. heightWrapRef omslutter det sveipende innholdet;
  // pendingOldHeightRef fanger høyden RETT FØR bytte (i klikk-/sveip-
  // handleren, ikke i effekten — da har DOM-en allerede det nye innholdet).
  const heightWrapRef = useRef<HTMLDivElement>(null);
  const pendingOldHeightRef = useRef<number | null>(null);

  function captureHeightBeforeChange() {
    const el = heightWrapRef.current;
    if (el) pendingOldHeightRef.current = el.getBoundingClientRect().height;
  }

  const realToday = localDateString();
  const viewedDate = addDaysIso(realToday, viewedOffset);
  const isToday = viewedOffset === 0;

  function goForward() {
    captureHeightBeforeChange();
    setViewedOffset((v) => Math.min(MAX_OFFSET, v + 1));
    setSlideDirection("forward");
  }
  function goBackward() {
    captureHeightBeforeChange();
    setViewedOffset((v) => Math.max(0, v - 1));
    setSlideDirection("backward");
  }
  function goToToday() {
    captureHeightBeforeChange();
    setViewedOffset(0);
    setSlideDirection("backward");
  }

  // Animerer heightWrap fra den fangede gamle høyden til det nye innholdets
  // naturlige høyde, samtidig som slideClass sin horisontale sveip spiller —
  // nullstilles til auto etterpå slik at senere innholdsendringer (utvidet
  // vær, ny påminnelse) ikke blir låst til en gammel fast høyde.
  useLayoutEffect(() => {
    const el = heightWrapRef.current;
    const oldHeight = pendingOldHeightRef.current;
    pendingOldHeightRef.current = null;
    if (!el || oldHeight === null) return;

    const newHeight = el.scrollHeight;
    if (Math.abs(oldHeight - newHeight) < 1) return;

    el.style.height = `${oldHeight}px`;
    el.style.overflow = "hidden";
    void el.offsetHeight; // tving reflow slik at starthøyden faktisk registreres før overgangen
    el.style.transition = "height 220ms ease";
    el.style.height = `${newHeight}px`;

    // setTimeout i stedet for transitionend — sistnevnte viste seg upålitelig
    // her (fyrte ikke konsekvent i test), en tidsstyrt reset er enklere og mer
    // forutsigbar siden overgangens varighet uansett er fast (220ms).
    const resetId = setTimeout(() => {
      el.style.transition = "";
      el.style.height = "auto";
      el.style.overflow = "";
    }, 250);
    return () => clearTimeout(resetId);
  }, [viewedOffset]);

  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragAxis.current = null;
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    const deltaX = e.clientX - dragStart.current.x;
    const deltaY = e.clientY - dragStart.current.y;
    if (!dragAxis.current && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
      dragAxis.current = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
    }
  }
  function handlePointerUp(e: React.PointerEvent) {
    if (dragAxis.current === "x" && dragStart.current) {
      const deltaX = e.clientX - dragStart.current.x;
      if (deltaX < -SWIPE_THRESHOLD) goForward();
      else if (deltaX > SWIPE_THRESHOLD) goBackward();
    }
    dragStart.current = null;
    dragAxis.current = null;
  }

  async function handleChangeDueDate(id: string, newDate: string) {
    try {
      const res = await fetch(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: newDate || null }),
      });
      if (!res.ok) throw new Error("change due date failed");
      const updated: Reminder = await res.json();
      mutateReminders(
        (current) => current && { reminders: current.reminders.map((r) => (r.id === id ? updated : r)) },
        { revalidate: false },
      );
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutationError.show("Kunne ikke endre fristen. Prøv igjen.");
    }
  }

  async function handleAddReminder() {
    const text = newReminderText.trim();
    if (!text || submittingReminder) return;
    setSubmittingReminder(true);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, dueDate: viewedDate, dueTime: newReminderTime || undefined }),
      });
      if (!res.ok) throw new Error("add reminder failed");
      const created: Reminder = await res.json();
      mutateReminders((current) => current && { reminders: [...current.reminders, created] }, { revalidate: false });
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
      setNewReminderText("");
      setNewReminderTime("");
      setAddingReminder(false);
    } catch {
      mutationError.show("Kunne ikke legge til påminnelsen. Prøv igjen.");
    } finally {
      setSubmittingReminder(false);
    }
  }

  async function handleToggleReminderDone(id: string) {
    const current = reminders.find((r) => r.id === id);
    if (!current) return;
    const optimisticDone = !current.done;
    let previous: Reminder[] = [];
    mutateReminders(
      (curr) => {
        previous = curr?.reminders ?? [];
        return curr && { reminders: curr.reminders.map((r) => (r.id === id ? { ...r, done: optimisticDone } : r)) };
      },
      { revalidate: false },
    );
    markJustToggled(id);
    vibrate(optimisticDone ? 15 : 8);
    try {
      const res = await fetch(`/api/reminders/${id}`, { method: "PATCH" });
      if (!res.ok) throw new Error("toggle failed");
      const updated: Reminder = await res.json();
      mutateReminders(
        (curr) => curr && { reminders: curr.reminders.map((r) => (r.id === id ? updated : r)) },
        { revalidate: false },
      );
      window.dispatchEvent(new Event("mitt-dashboard:privat-refresh"));
    } catch {
      mutateReminders({ reminders: previous }, { revalidate: false });
      mutationError.show("Kunne ikke oppdatere påminnelsen. Prøv igjen.");
    }
  }

  const activeReminders = reminders.filter(
    (r) => (!r.done || justToggled.has(r.id)) && (!r.dueDate || r.dueDate <= realToday),
  );
  const overdueReal = activeReminders.filter((r) => r.dueDate && r.dueDate < realToday);
  const dueTodayReal = activeReminders.filter((r) => !r.dueDate || r.dueDate === realToday);

  const dueOnViewed = reminders.filter(
    (r) => (!r.done || justToggled.has(r.id)) && (r.dueDate === viewedDate || (!r.dueDate && isToday)),
  );
  // Slår sammen oversittede (kun relevant på selve i dag-visningen) og de som
  // forfaller på den viste dagen i én liste, med et overdue-flagg per rad —
  // vises i samme boks, ikke to separate, jf. tilbakemelding.
  const reminderRows = isToday
    ? [
        ...overdueReal.map((r) => ({ reminder: r, overdue: true })),
        ...dueOnViewed.map((r) => ({ reminder: r, overdue: false })),
      ]
    : dueOnViewed.map((r) => ({ reminder: r, overdue: false }));
  const eventsOnViewed = events.filter((e) => e.date === viewedDate);
  // Egendefinerte kamper (category "personal") vises i "I dag" kun når de er
  // markert highlight, og fulle liga-runder (Eliteserien/PL/FA Cup/Champions
  // League) vises IKKE enkeltvis her — de samles i en klikkbar "X-runde"-linje
  // (se SportRoundLine) i stedet for å oversvømme "I dag" med alle kampene.
  // "Norsk lag i Europa" kan ha flere kamper samme dag (en hel Europa-/
  // Conference League-runde med flere norske lag) — samme "flom"-problem som
  // liga-rundene, løst likt: Viking vises alltid åpent (ellers den første),
  // resten samles i en egen drilldown-linje i stedet for å listes enkeltvis.
  const euroOnViewed = sports.filter((s) => s.date === viewedDate && s.category === "football_no_uefa");
  const euroPrimaryIdx = euroOnViewed.length > 0
    ? Math.max(0, euroOnViewed.findIndex((e) => e.name.toLowerCase().includes("viking")))
    : -1;
  const euroShown = euroPrimaryIdx >= 0 ? [euroOnViewed[euroPrimaryIdx]] : [];
  const euroDrilldownOnViewed = euroOnViewed.filter((_, i) => i !== euroPrimaryIdx);
  const sportsOnViewed = sports
    .filter(
      (s) =>
        s.date === viewedDate &&
        !LEAGUE_ROUND_CATEGORIES.has(s.category) &&
        s.category !== "football_no_uefa" &&
        (s.category !== "personal" || s.highlight),
    )
    .concat(euroShown);
  const sportRoundsOnViewed = [...LEAGUE_ROUND_CATEGORIES]
    .map((cat) => ({ cat, matches: sports.filter((s) => s.date === viewedDate && s.category === cat) }))
    .filter((g) => g.matches.length > 0);
  const fplDeadlineOnViewed =
    fpl?.active && fpl.gw?.deadline && toOsloDateString(new Date(fpl.gw.deadline)) === viewedDate ? fpl.gw.deadline : null;
  const lifeEventsOnViewed = lifeEvents.filter((e) => occursOnDate(e, viewedDate));
  const paydayOnViewed = isPaydayToday(viewedDate);
  // Kort nudge i stedet for embedded utfylling — selve utfyllingen skjer nå
  // kun inne i Dagbok-fanen (app/privat/DiarySection.tsx). Vises KUN når
  // gårsdagen mangler — ikke lenger et kl. 21-varsel for DAGENS dagbok, jf.
  // tilbakemelding om at den bare skal komme når man faktisk har glemt
  // forrige dag, ikke mase om dagen som fortsatt pågår.
  const yesterday = addDaysIso(realToday, -1);
  const yesterdayDiaryEntry = diaryEntries.find((e) => e.date === yesterday) ?? null;
  const showDiaryNudge = isToday && !yesterdayDiaryEntry;
  const diaryNudgeText = `Du fylte ikke ut dagboken i går (${weekdayDateLabel(yesterday)}).`;

  useEffect(() => {
    if (loading) return;
    setAppBadgeCount(overdueReal.length + dueTodayReal.length);
  }, [loading, overdueReal.length, dueTodayReal.length]);

  const slideClass = slideDirection === "forward" ? "day-slide-in-right" : slideDirection === "backward" ? "day-slide-in-left" : "";

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={goBackward}
            aria-label="Forrige dag"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-2 hover:text-ink-2"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="truncate text-sm font-semibold text-ink-1">{weekdayDateLabel(viewedDate)}</h2>
          <button
            type="button"
            onClick={goForward}
            aria-label="Neste dag"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-2 hover:text-ink-2"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isToday && (
            <button
              type="button"
              onClick={goToToday}
              className="flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-2 px-2 py-1 text-2xs font-medium text-accent-privat transition hover:bg-surface-3"
            >
              <ChevronLeft className="h-3 w-3" />
              Tilbake til i dag
            </button>
          )}
        </div>
        {weather && isToday && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setWeatherExpanded((v) => !v)}
              aria-expanded={weatherExpanded}
              aria-label="Vis vær time for time"
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-ink-2 transition hover:bg-surface-2"
            >
              <WeatherIcon symbol={weather.symbol} className="h-5 w-5" />
              <span className="tabular-nums">{weather.temp}°</span>
            </button>
            <button
              type="button"
              onClick={() => setWeatherInfoOpen((v) => !v)}
              aria-expanded={weatherInfoOpen}
              aria-label="Værbeskrivelse"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-2 hover:text-ink-2"
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {weather && weatherInfoOpen && isToday && <WeatherInfo weather={weather} nowHour={nowHour} />}

      {weather && weatherExpanded && isToday && (
        <div className="mb-3 overflow-x-auto rounded-xl border border-line bg-surface-2 p-2.5">
          <div className="flex w-max gap-4">
            {weather.hourly.map((h) => (
              <div key={h.time} className="flex flex-col items-center gap-1 text-center">
                <span className="text-2xs text-ink-4">{hourLabel(h.time)}</span>
                <WeatherIcon symbol={h.symbol} className="h-5 w-5" />
                <span className="text-xs tabular-nums text-ink-1">{h.temp}°</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonRows count={3} className="h-6" />
      ) : (
        <div
          ref={heightWrapRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            dragStart.current = null;
            dragAxis.current = null;
          }}
          style={{ touchAction: "pan-y" }}
        >
          <div key={viewedOffset} className={`flex flex-col gap-2 ${slideClass}`}>
            {isToday && aiUsage && (aiUsage.overDaily || aiUsage.overMonthly) && (
              <div className="rounded-lg border border-status-danger/40 bg-status-danger/8 px-3 py-1.5">
                <CategoryRow icon={Bot} colorClass="text-status-danger" label="AI-bruk">
                  <p className="text-sm text-ink-1">
                    {aiUsage.overDaily && `${formatUsd(aiUsage.last24hUsd)} siste 24t (over ${formatUsd(aiUsage.dailyAlertUsd)}/dag)`}
                    {aiUsage.overDaily && aiUsage.overMonthly && " · "}
                    {aiUsage.overMonthly &&
                      `${formatUsd(aiUsage.last30daysUsd)} siste 30 dager (over ${formatUsd(aiUsage.monthlyAlertUsd)})`}
                  </p>
                </CategoryRow>
              </div>
            )}

            {showDiaryNudge && (
              <div className="rounded-lg border border-status-warning/40 bg-status-warning/8 px-3 py-1.5">
                <CategoryRow icon={Moon} colorClass="text-status-warning" label="Dagbok" onJump={() => onJump("diary")}>
                  <p className="text-sm text-status-warning">{diaryNudgeText}</p>
                </CategoryRow>
              </div>
            )}

            {/* Kategoriene under deles av én flat liste med tynne skillelinjer
                (divide-y) i stedet for hver sin fargede ramme+tint-boks — ikonets
                farge (colorClass) er allerede signalet for hvilken kategori det
                er, en boks per kategori var et overflødig andre fargesignal for
                samme informasjon. Påminnelser og Kalender vises alltid, med egen
                tom-tekst — slik at Sport aldri kan "vinne" toppen bare fordi de to
                viktigste kategoriene er tomme. */}
            <div className="flex flex-col divide-y divide-line">
              {/* "Ny+" flyttet ut av CategoryRow sine children og inn som en
                  sidestilt knapp her — den lå tidligere ØVERST i children, som
                  skjøv selve påminnelse-teksten ned én linje og fikk bjelle-
                  ikonet (linjert mot FØRSTE linje) til å virke forskjøvet fra
                  teksten, i motsetning til Kalender-ikonet der children
                  starter rett på innholdet. */}
              <div className="flex items-start gap-2 pb-2 first:pt-0">
                <div className="min-w-0 flex-1">
                  <CategoryRow icon={Bell} colorClass="text-accent-privat" label="Påminnelser" onJump={() => onJump("reminders")}>
                    <MutationError message={mutationError.message} />
                    {reminderRows.length > 0 ? (
                      <ul className="flex flex-col gap-1">
                        {reminderRows.map(({ reminder, overdue }) => (
                          <ReminderLine
                            key={reminder.id}
                            reminder={reminder}
                            overdue={overdue}
                            editing={editingReminderId === reminder.id}
                            onStartEdit={() => setEditingReminderId(reminder.id)}
                            onChangeDueDate={(date) => handleChangeDueDate(reminder.id, date)}
                            onCancelEdit={() => setEditingReminderId(null)}
                            onToggleDone={() => handleToggleReminderDone(reminder.id)}
                          />
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-ink-3">{isToday ? "Ingen påminnelser i dag." : "Ingen påminnelser denne dagen."}</p>
                    )}
                    {addingReminder && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <input
                          type="text"
                          autoFocus
                          value={newReminderText}
                          onChange={(e) => setNewReminderText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddReminder();
                            if (e.key === "Escape") setAddingReminder(false);
                          }}
                          placeholder="Ny påminnelse..."
                          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
                        />
                        <input
                          type="time"
                          value={newReminderTime}
                          onChange={(e) => setNewReminderTime(e.target.value)}
                          className="w-24 shrink-0 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
                        />
                        <button
                          type="button"
                          onClick={handleAddReminder}
                          disabled={!newReminderText.trim() || submittingReminder}
                          className="rounded-lg bg-accent-privat px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent-privat/85 disabled:opacity-40"
                        >
                          Legg til
                        </button>
                      </div>
                    )}
                  </CategoryRow>
                </div>
                {!addingReminder && (
                  <button
                    type="button"
                    onClick={() => setAddingReminder(true)}
                    className="shrink-0 text-xs font-medium text-accent-privat hover:text-accent-privat/80"
                  >
                    Ny+
                  </button>
                )}
              </div>

              <div className="py-2">
                <CategoryRow icon={Calendar} colorClass="text-source-teams" label="Kalender" onJump={() => onJump("calendar")}>
                  {eventsOnViewed.length > 0 ? (
                    <ul className="flex flex-col gap-1">
                      {eventsOnViewed.map((e) => (
                        <li key={e.id} className="flex items-baseline justify-between gap-2 text-sm text-ink-1">
                          <span className="min-w-0 truncate">{e.title}</span>
                          {e.startTime && <span className="shrink-0 tabular-nums text-ink-3">{e.startTime}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-3">{isToday ? "Ingen hendelser i dag." : "Ingen hendelser denne dagen."}</p>
                  )}
                </CategoryRow>
              </div>

              {(sportsOnViewed.length > 0 || sportRoundsOnViewed.length > 0 || euroDrilldownOnViewed.length > 0) && (
                <div className="py-2 last:pb-0">
                  <CategoryRow icon={Trophy} colorClass="text-accent" label="Sport" onJump={() => onJump("sport")}>
                    <ul className="flex flex-col gap-1">
                      {sportsOnViewed.map((s) => (
                        <li key={s.id} className="flex items-baseline justify-between gap-2 text-sm text-ink-1">
                          <span className="min-w-0 truncate">{s.name}</span>
                          {s.time && <span className="shrink-0 tabular-nums text-ink-3">{s.time}</span>}
                        </li>
                      ))}
                      {sportRoundsOnViewed.map((g) => (
                        <SportRoundLine key={g.cat} label={`${LEAGUE_ROUND_LABELS[g.cat] ?? g.cat}-runde`} matches={g.matches} />
                      ))}
                      {euroDrilldownOnViewed.length > 0 && (
                        <SportRoundLine label="Flere norske lag i Europa" matches={euroDrilldownOnViewed} />
                      )}
                    </ul>
                  </CategoryRow>
                </div>
              )}

              {fplDeadlineOnViewed && (
                <div className="py-2 last:pb-0">
                  <CategoryRow icon={Shirt} colorClass="text-status-action" label="Fantasy Premier League" onJump={() => onJump("fpl")}>
                    <p className="text-sm text-ink-1">
                      Deadline kl.{" "}
                      <span className="tabular-nums">
                        {new Date(fplDeadlineOnViewed).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </p>
                  </CategoryRow>
                </div>
              )}

              {/* Fast del av "I dag" (ikke betinget av at det finnes noe å
                  vise, i motsetning til de andre kategoriene over) — kun på
                  selve i dag-visningen, siden "dagens nyheter" ikke gir
                  mening når man blar til en annen dag. */}
              {isToday && (
                <div className="py-2 last:pb-0">
                  <CategoryRow icon={Newspaper} colorClass="text-orange-400" label="Nyheter" onJump={() => onJump("news")}>
                    <NewsPreview items={news} onJump={() => onJump("news")} />
                  </CategoryRow>
                </div>
              )}

              {(paydayOnViewed || lifeEventsOnViewed.length > 0) && (
                <div className="py-2 last:pb-0">
                  <CategoryRow icon={PartyPopper} colorClass="text-status-warning" label="Hendelser" onJump={() => onJump("events")}>
                    <ul className="flex flex-col gap-1">
                      {paydayOnViewed && <li className="text-sm text-ink-1">Lønningsdag</li>}
                      {lifeEventsOnViewed.map((e) => (
                        <li key={e.id} className="text-sm text-ink-1">
                          {e.title}
                        </li>
                      ))}
                    </ul>
                  </CategoryRow>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
