"use client";

import { useCallback, useEffect, useState } from "react";
import { CardHeader, CollapsibleBody, SkeletonRows, usePersistedCollapse } from "../CardShell";
import type { NewsItem } from "@/lib/news";
import { timeAgo } from "@/lib/timeAgo";
import { Newspaper } from "lucide-react";

// Nyheter kan bli utdaterte gjennom en lang åpen dashboard-økt uten et
// periodisk refetch — 15 minutter er hyppig nok for nyhetsoppdateringer uten
// å tynge VG sin RSS-feed unødig.
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

function timeLabel(pubDate?: string): string {
  if (!pubDate) return "";
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

function NewsRow({ item, expanded, onToggle }: { item: NewsItem; expanded: boolean; onToggle: () => void }) {
  return (
    <li className="rounded-xl border border-line bg-surface-2 px-3 py-2">
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-start gap-2 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-1">{item.title}</p>
          <p className="mt-0.5 text-2xs text-ink-4">
            {item.category ? `${item.category}` : ""}
            {item.category && timeLabel(item.pubDate) ? " · " : ""}
            {timeLabel(item.pubDate)}
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
          {item.description ? (
            <p className="text-sm text-ink-2">{item.description}</p>
          ) : (
            <p className="text-sm text-ink-4">Ingen sammendrag tilgjengelig.</p>
          )}
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start text-xs font-medium text-accent-privat hover:text-accent-privat/80"
          >
            Les hele saken →
          </a>
        </div>
      )}
    </li>
  );
}

export default function NewsSection({ defaultExpanded = false }: { defaultExpanded?: boolean } = {}) {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Nyheter", !defaultExpanded);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLink, setExpandedLink] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

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

  return (
    <div className="border-t-2 border-t-orange-400/60 p-4">
      <CardHeader
        title="Nyheter"
        subtitle={items.length > 0 ? items[0].title : "VG.no"}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={Newspaper}
        iconColorClass="text-orange-400"
      />
      <CollapsibleBody collapsed={collapsed}>
        <div className="flex flex-col gap-2">
          {loading ? (
            <SkeletonRows count={3} />
          ) : items.length === 0 ? (
            <p className="text-sm text-ink-3">Fikk ikke hentet nyheter akkurat nå.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {items.map((item) => (
                <NewsRow
                  key={item.link}
                  item={item}
                  expanded={expandedLink === item.link}
                  onToggle={() => setExpandedLink((v) => (v === item.link ? null : item.link))}
                />
              ))}
            </ul>
          )}
          {fetchedAt && <p className="mt-1 text-2xs text-ink-4">Oppdatert {timeAgo(fetchedAt)}</p>}
        </div>
      </CollapsibleBody>
    </div>
  );
}
