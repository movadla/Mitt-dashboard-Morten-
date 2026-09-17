"use client";

import { useCallback, useEffect, useState } from "react";
import { CardHeader, SkeletonRows } from "../CardShell";
import type { NewsItem } from "@/lib/news";
import { timeAgo } from "@/lib/timeAgo";
import { Newspaper } from "lucide-react";

// Nyheter kan bli utdaterte gjennom en lang åpen dashboard-økt uten et
// periodisk refetch — 15 minutter er hyppig nok for nyhetsoppdateringer uten
// å tynge kildenes RSS-feeds unødig.
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

// Egen fargepalett per kategori — samme mønster som SPORT_COLOR i
// SportSection.tsx (dedikert konstant-map, ikke en gjenbruk av det
// reserverte semantiske paletten i globals.css).
const CATEGORY_COLOR: Record<string, string> = {
  Nyheter: "#64748b",
  Sport: "#2563eb",
  Underholdning: "#db2777",
  Økonomi: "#0e9e79",
  Utenriks: "#d97706",
  Annet: "#6b7280",
};

function timeLabel(pubDate?: string): string {
  if (!pubDate) return "";
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

// Avkorter en rå (ikke AI-tolket) description til en kort setning — samme
// rolle som oneLiner for saker uten AI-berikelse (feilet kall/mangler nøkkel).
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trimEnd()}…`;
}

// Samme regel som "I dag"-widgeten (TodaySummary.tsx sin isImportantNews) —
// krever kryss-kilde-dekning (minst to ulike medier om samme sak), ikke bare
// AI-ens isolerte per-artikkel-vurdering. Holdt som en liten, bevisst
// duplisert ett-linjer her fremfor en delt modul, siden lib/news.ts er
// server-only og ikke kan importeres av disse klient-komponentene.
function isImportantNews(item: NewsItem): boolean {
  return (item.sourceCount ?? 1) >= 2 && item.importance !== "lav";
}

function NewsRow({ item, expanded, showMore, enriching, onToggle, onToggleMore }: {
  item: NewsItem;
  expanded: boolean;
  showMore: boolean;
  enriching: boolean;
  onToggle: () => void;
  onToggleMore: () => void;
}) {
  const displayTitle = item.aiTitle ?? item.title;
  const shortSummary = item.oneLiner ?? (item.description ? truncate(item.description, 110) : null);
  const hasMoreDetail = (item.summaryBullets && item.summaryBullets.length > 0) || !!item.description;
  const categoryColor = item.category ? (CATEGORY_COLOR[item.category] ?? CATEGORY_COLOR.Annet) : undefined;
  return (
    <li className="rounded-xl border border-line bg-surface-2 px-3 py-2">
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-start gap-2.5 text-left">
        {item.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-ink-1">{displayTitle}</p>
            {isImportantNews(item) && (
              <span className="shrink-0 rounded-full bg-status-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-warning">
                Viktig for deg
              </span>
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-2xs text-ink-4">
            <span className="shrink-0 font-medium text-ink-3">{item.source}</span>
            {item.category && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  {categoryColor && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: categoryColor }} />}
                  {item.category}
                </span>
              </>
            )}
            {timeLabel(item.pubDate) && (
              <>
                <span>·</span>
                <span>{timeLabel(item.pubDate)}</span>
              </>
            )}
          </p>
        </div>
        <svg
          viewBox="0 0 16 16"
          className={`mt-1 h-3.5 w-3.5 shrink-0 text-ink-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {expanded && (
        <div className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
          {/* Kort versjon først (én setning) — "Mer" avslører det fulle
              punktvise sammendraget/beskrivelsen, i stedet for å dumpe alt
              med det samme man utvider saken. AI-tolkningen hentes først NÅ
              (se fetchEnrichment i NewsSection) — ikke på forhånd for alle
              saker, jf. tilbakemelding om at det kostet penger for saker
              ingen noensinne leste. */}
          {enriching ? (
            <p className="text-sm text-ink-4">Henter sammendrag…</p>
          ) : shortSummary ? (
            <p className="text-sm text-ink-2">{shortSummary}</p>
          ) : (
            <p className="text-sm text-ink-4">Ingen sammendrag tilgjengelig.</p>
          )}
          {showMore && (
            item.summaryBullets && item.summaryBullets.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {item.summaryBullets.map((bullet, i) => (
                  <li key={i} className="flex gap-1.5 text-sm text-ink-2">
                    <span className="text-ink-4">•</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            ) : item.description ? (
              <p className="text-sm text-ink-2">{item.description}</p>
            ) : null
          )}
          <div className="flex items-center gap-3">
            {hasMoreDetail && (
              <button
                type="button"
                onClick={onToggleMore}
                className="text-xs font-medium text-accent-privat hover:text-accent-privat/80"
              >
                {showMore ? "Mindre" : "Mer"}
              </button>
            )}
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-accent-privat hover:text-accent-privat/80"
            >
              Les hele saken →
            </a>
          </div>
        </div>
      )}
    </li>
  );
}

export default function NewsSection({ pinnedItem, onPinnedHandled }: { pinnedItem?: NewsItem | null; onPinnedHandled?: () => void }) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLink, setExpandedLink] = useState<string | null>(null);
  const [moreLink, setMoreLink] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [enrichingLink, setEnrichingLink] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/news")
      .then((r) => r.json())
      .then((d) => {
        setItems((d.items ?? []) as NewsItem[]);
        setFetchedAt(Date.now());
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Henter AI-tittel/sammendrag for ÉN sak, kun idet den faktisk åpnes — se
  // lib/news.ts sin enrichNewsItem for hvorfor dette er billig å gjøre her
  // (bakgrunnsoppfriskningen har allerede hentet artikkelteksten) og hvorfor
  // det fortsatt virker for en sak som har falt ut av topp-10-lista (raw
  // sendes med, klienten sin egen kopi er alt serveren trenger da).
  const enrichIfNeeded = useCallback((item: NewsItem) => {
    if (item.aiTitle) return;
    setEnrichingLink(item.link);
    fetch("/api/news/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((enriched: NewsItem | null) => {
        if (!enriched) return;
        setItems((current) => {
          const exists = current.some((i) => i.link === enriched.link);
          return exists ? current.map((i) => (i.link === enriched.link ? enriched : i)) : current;
        });
      })
      .finally(() => setEnrichingLink((v) => (v === item.link ? null : v)));
  }, []);

  // En sak sendt inn fra "I dag" — hektes inn øverst i lista (selv om den
  // ikke lenger finnes i den rullerende topp-10) og åpnes/berikes med det
  // samme, siden brukeren allerede har bedt om å se akkurat denne.
  useEffect(() => {
    if (!pinnedItem) return;
    setItems((current) => {
      const exists = current.some((i) => i.link === pinnedItem.link);
      return exists ? current : [pinnedItem, ...current];
    });
    setExpandedLink(pinnedItem.link);
    enrichIfNeeded(pinnedItem);
    onPinnedHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedItem]);

  return (
    <div className="border-t-2 border-t-orange-400/60 p-4">
      <CardHeader
        title="Nyheter"
        // Løftet fra subtitle til stat (systematisk sveip 2026-09-07) — men her
        // er det IKKE bare en mekanisk items.length-promotering: NewsItem har
        // ingen lest/ulest-tilstand (se lib/news.ts), så et antall er det eneste
        // tallet som finnes. Den forrige subtitle-teksten (siste overskrift) var
        // egentlig mer nyttig informasjon enn et rått antall, så den er ikke
        // fjernet — kun flyttet ned til en egen linje i kortkroppen (stat
        // fortrenger subtitle-plassen helt, jf. CardHeader/CardShell.tsx).
        stat={items.length > 0 ? { value: items.length, label: items.length === 1 ? "nyhet" : "nyheter" } : undefined}
        icon={Newspaper}
        iconColorClass="text-orange-400"
      />
        <div className="flex flex-col gap-2">
          {loading ? (
            <SkeletonRows count={3} />
          ) : items.length === 0 ? (
            <p className="text-sm text-ink-3">Fikk ikke hentet nyheter akkurat nå.</p>
          ) : (
            <>
              <p className="truncate text-sm text-ink-2">{items[0].aiTitle ?? items[0].title}</p>
              <ul className="flex flex-col gap-1.5">
              {items.map((item) => (
                <NewsRow
                  key={item.link}
                  item={item}
                  expanded={expandedLink === item.link}
                  showMore={moreLink === item.link}
                  enriching={enrichingLink === item.link}
                  onToggle={() => {
                    const opening = expandedLink !== item.link;
                    setExpandedLink((v) => (v === item.link ? null : item.link));
                    setMoreLink(null);
                    if (opening) enrichIfNeeded(item);
                  }}
                  onToggleMore={() => setMoreLink((v) => (v === item.link ? null : item.link))}
                />
              ))}
              </ul>
            </>
          )}
          {fetchedAt && <p className="mt-1 text-2xs text-ink-4">Oppdatert {timeAgo(fetchedAt)}</p>}
        </div>
    </div>
  );
}
