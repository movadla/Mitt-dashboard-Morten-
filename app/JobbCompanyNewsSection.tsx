"use client";

import { Fragment, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { CardHeader, ConfirmDialog, MutationError, SkeletonRows, useConfirmDelete, useMutationError } from "./CardShell";
import type { NewsCategory, NewsImportance, NewsItem, NewsSourceType } from "@/lib/companyNews";
import { localDateString, relativeDayLabel } from "@/lib/payday";
import { formatDateDMY } from "@/lib/widgets";
import { Cloud, FileText, Globe, Mail, MessageSquare, Newspaper, X } from "lucide-react";

const CATEGORY_LABEL: Record<NewsCategory, string> = {
  regulering: "Regulering",
  "oppkjop-salg": "Oppkjøp/salg",
  kontrakter: "Kontrakter",
  personal: "Personal",
  styremote: "Styremøte",
  "omsetning-cc": "Omsetning CC",
  okonomi: "Økonomi",
  drift: "Drift",
  utleie: "Utleie",
  marked: "Marked",
  ledelse: "Ledelse",
  hr: "HR",
  annet: "Annet",
};

const SOURCE_LABEL: Record<NewsSourceType, string> = {
  teams: "Teams",
  email: "E-post",
  sharepoint: "SharePoint",
  salesforce: "Salesforce",
  web: "Nett",
  annet: "Annet",
};

const SOURCE_ICON: Record<NewsSourceType, typeof Mail> = {
  teams: MessageSquare,
  email: Mail,
  sharepoint: FileText,
  salesforce: Cloud,
  web: Globe,
  annet: FileText,
};

// Kun "høy" viser et fargesignal (status-warning) — "middels"/"lav" er
// visuelt nøytrale, samme lærdom som Trening-redesignet: ikke bruk farge til
// mer enn ett signal om gangen (her: "dette bør du faktisk lese").
function ImportanceDot({ importance }: { importance: NewsImportance }) {
  if (importance !== "hoy") return null;
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-warning" aria-hidden="true" title="Høy relevans" />;
}

function NewsRow({
  item,
  expanded,
  onToggle,
  onRemove,
}: {
  item: NewsItem;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const SourceIcon = SOURCE_ICON[item.sourceType];
  return (
    <li className="rounded-xl border border-line bg-surface-2 px-3 py-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          <ImportanceDot importance={item.importance} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-1">{item.title}</span>
          <span className="shrink-0 text-2xs tabular-nums text-ink-4">{formatDateDMY(item.date)}</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Fjern nyhet"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-status-danger"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-line pt-2">
          <div className="flex items-center gap-1.5 text-2xs text-ink-4">
            <span className="rounded-full bg-surface-3 px-1.5 py-0.5">{CATEGORY_LABEL[item.category]}</span>
            <span className="inline-flex items-center gap-1">
              <SourceIcon className="h-3 w-3" />
              {SOURCE_LABEL[item.sourceType]}
            </span>
          </div>
          <p className="whitespace-pre-line text-sm text-ink-2">{item.fullText || item.summary}</p>
          {item.sourceRef && (
            <p className="text-2xs text-ink-4">
              Kilde:{" "}
              {/^https?:\/\//.test(item.sourceRef) ? (
                <a href={item.sourceRef} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                  {item.sourceRef}
                </a>
              ) : (
                item.sourceRef
              )}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export default function JobbCompanyNewsSection() {
  const { data, isLoading: loading, mutate: mutateNews } = useSWR<{ news: NewsItem[] }>("/api/company-news", jsonFetcher);
  const news = data?.news ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(15);
  const [categoryFilter, setCategoryFilter] = useState<NewsCategory | null>(null);
  const confirmDelete = useConfirmDelete<NewsItem>();
  const mutationError = useMutationError();

  const today = localDateString();
  const filtered = categoryFilter ? news.filter((n) => n.category === categoryFilter) : news;
  const visible = filtered.slice(0, visibleCount);
  const usedCategories = [...new Set(news.map((n) => n.category))];

  async function handleRemove(item: NewsItem) {
    let previous: NewsItem[] = [];
    mutateNews(
      (current) => {
        previous = current?.news ?? [];
        return current && { news: current.news.filter((n) => n.id !== item.id) };
      },
      { revalidate: false },
    );
    try {
      const res = await fetch(`/api/company-news/${item.date}/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
    } catch {
      mutateNews({ news: previous }, { revalidate: false });
      mutationError.show("Kunne ikke fjerne nyheten. Prøv igjen.");
    }
  }

  return (
    <div className="border-t-2 border-t-cyan-400/60 p-4">
      <CardHeader
        title="Mustad-nyheter"
        subtitle={news.length > 0 ? `${news.length} oppføringer` : "Ingen ennå"}
        icon={Newspaper}
        iconColorClass="text-cyan-400"
      />
      <div className="flex flex-col gap-2">
        <MutationError message={mutationError.message} />
        {usedCategories.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategoryFilter(null)}
              className={`rounded-full border px-2.5 py-1 text-2xs font-medium transition ${
                categoryFilter === null
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line bg-surface-2 text-ink-3 hover:border-line-strong hover:text-ink-1"
              }`}
            >
              Alle
            </button>
            {usedCategories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryFilter((v) => (v === c ? null : c))}
                className={`rounded-full border px-2.5 py-1 text-2xs font-medium transition ${
                  categoryFilter === c
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line bg-surface-2 text-ink-3 hover:border-line-strong hover:text-ink-1"
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <SkeletonRows count={3} />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-ink-3">
            {news.length === 0 ? "Ingen nyheter registrert ennå — be Claude oppdatere Mustad-nyheter." : "Ingen treff i denne kategorien."}
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-1.5">
              {visible.map((item, i) => {
                const prevDate = i > 0 ? visible[i - 1].date : null;
                const showHeader = item.date !== prevDate;
                return (
                  <Fragment key={item.id}>
                    {showHeader && (
                      <li className="mt-2 first:mt-0">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">
                          {relativeDayLabel(item.date, today)}
                        </p>
                      </li>
                    )}
                    <NewsRow
                      item={item}
                      expanded={expandedId === item.id}
                      onToggle={() => setExpandedId((v) => (v === item.id ? null : item.id))}
                      onRemove={() => confirmDelete.request(item)}
                    />
                  </Fragment>
                );
              })}
            </ul>
            {filtered.length > visibleCount && (
              <button
                type="button"
                onClick={() => setVisibleCount((v) => v + 15)}
                className="self-start text-xs font-medium text-ink-3 hover:text-ink-1"
              >
                {`Mer (${filtered.length - visibleCount})`}
              </button>
            )}
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={confirmDelete.pending ? `Fjerne nyheten «${confirmDelete.pending.title}»?` : ""}
        onCancel={confirmDelete.cancel}
        onConfirm={() => {
          if (confirmDelete.pending) handleRemove(confirmDelete.pending);
          confirmDelete.cancel();
        }}
      />
    </div>
  );
}
