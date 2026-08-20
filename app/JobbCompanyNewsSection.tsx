"use client";

import { Fragment, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { CardHeader, ConfirmDialog, MutationError, SkeletonRows, useConfirmDelete, useMutationError } from "./CardShell";
import type { NewNewsItemInput, NewsCategory, NewsImportance, NewsItem, NewsSourceType } from "@/lib/companyNews";
import { localDateString, relativeDayLabel } from "@/lib/payday";
import { formatDateDMY } from "@/lib/widgets";
import { timeAgo } from "@/lib/timeAgo";
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
          <div className="flex flex-wrap items-center gap-1.5 text-2xs text-ink-4">
            <span className="rounded-full bg-surface-3 px-1.5 py-0.5">{CATEGORY_LABEL[item.category]}</span>
            <span className="inline-flex items-center gap-1">
              <SourceIcon className="h-3 w-3" />
              {SOURCE_LABEL[item.sourceType]}
            </span>
            <span title={new Date(item.createdAt).toLocaleString("nb-NO")}>
              · lagt inn i dashboardet {timeAgo(Date.parse(item.createdAt))}
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

function NewsForm({ onCancel, onSave }: { onCancel: () => void; onSave: (input: NewNewsItemInput) => Promise<boolean> }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState<NewsCategory>("annet");
  const [sourceType, setSourceType] = useState<NewsSourceType>("annet");
  const [sourceRef, setSourceRef] = useState("");
  const [date, setDate] = useState(localDateString());
  const [importance, setImportance] = useState<NewsImportance>("middels");
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    const ok = await onSave({
      title: title.trim(),
      summary: summary.trim() || title.trim(),
      category,
      sourceType,
      sourceRef: sourceRef.trim() || undefined,
      date,
      importance,
    });
    setSubmitting(false);
    if (ok) {
      setTitle("");
      setSummary("");
      setSourceRef("");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Tittel (den ene linjen som vises)"
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Mer detaljer (valgfritt — vises når man trykker på nyheten)"
        rows={2}
        className="resize-none rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as NewsCategory)}
          className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        >
          {(Object.keys(CATEGORY_LABEL) as NewsCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as NewsSourceType)}
          className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        >
          {(Object.keys(SOURCE_LABEL) as NewsSourceType[]).map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={importance}
          onChange={(e) => setImportance(e.target.value as NewsImportance)}
          className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        >
          <option value="hoy">Høy viktighet</option>
          <option value="middels">Middels viktighet</option>
          <option value="lav">Lav viktighet</option>
        </select>
      </div>
      <input
        type="text"
        value={sourceRef}
        onChange={(e) => setSourceRef(e.target.value)}
        placeholder="Kilde (valgfritt, f.eks. «Hørt fra Christian i møte»)"
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!title.trim() || submitting}
          className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </div>
  );
}

export default function JobbCompanyNewsSection() {
  const { data, isLoading: loading, mutate: mutateNews } = useSWR<{ news: NewsItem[] }>("/api/company-news", jsonFetcher);
  const news = data?.news ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(15);
  const [categoryFilter, setCategoryFilter] = useState<NewsCategory | null>(null);
  const [showForm, setShowForm] = useState(false);
  const confirmDelete = useConfirmDelete<NewsItem>();
  const mutationError = useMutationError();

  const today = localDateString();
  const filtered = categoryFilter ? news.filter((n) => n.category === categoryFilter) : news;
  const visible = filtered.slice(0, visibleCount);
  const usedCategories = [...new Set(news.map((n) => n.category))];
  // "Sist research-runde" = nyeste createdAt (når Claude faktisk la inn noe),
  // IKKE nyeste "date" (som kan være en gammel hendelse funnet nylig, eller
  // motsatt en fersk hendelse lagt inn for lenge siden) — dette er hva som
  // faktisk svarer på "hvor fersk er denne oversikten totalt sett".
  const lastResearchAt = news.length > 0 ? Math.max(...news.map((n) => Date.parse(n.createdAt))) : null;

  async function handleAdd(input: NewNewsItemInput): Promise<boolean> {
    try {
      const res = await fetch("/api/company-news", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [input] }) });
      if (!res.ok) {
        mutationError.show("Kunne ikke legge til nyheten. Prøv igjen.");
        return false;
      }
      const { created } = await res.json();
      mutateNews((current) => current && { news: [...current.news, ...created] }, { revalidate: false });
      setShowForm(false);
      return true;
    } catch {
      mutationError.show("Kunne ikke legge til nyheten. Prøv igjen.");
      return false;
    }
  }

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
        subtitle={
          news.length > 0 && lastResearchAt !== null
            ? `${news.length} oppføringer · sist research-runde ${timeAgo(lastResearchAt)}`
            : "Ingen ennå"
        }
        icon={Newspaper}
        iconColorClass="text-cyan-400"
        onAdd={() => setShowForm(true)}
        addLabel="Ny nyhet"
      />
      <div className="flex flex-col gap-2">
        <MutationError message={mutationError.message} />
        {showForm && <NewsForm onCancel={() => setShowForm(false)} onSave={handleAdd} />}
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
