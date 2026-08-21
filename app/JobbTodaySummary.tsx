"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { SkeletonRows } from "./CardShell";
import type { JobbReminder } from "@/lib/jobbReminders";
import type { JobbEvent } from "@/lib/jobbEvents";
import type { Task } from "@/lib/tasks";
import type { NewsItem } from "@/lib/companyNews";
import { localDateString } from "@/lib/payday";
import { CALENDAR_EVENTS, CONTRACTS, formatKr } from "@/lib/widgets";
import { timeAgo } from "@/lib/timeAgo";
import { AlertTriangle, Bell, Calendar, ClipboardList, Mail, Newspaper, PartyPopper } from "lucide-react";

function CategoryLabel({
  icon: Icon,
  colorClass,
  label,
  count,
}: {
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  label: string;
  count?: number;
}) {
  return (
    <div className="mb-1 flex items-center gap-1.5" title={label}>
      <Icon className={`h-4 w-4 ${colorClass}`} />
      <span className="sr-only">{label}</span>
      {count !== undefined && <span className={`text-2xs font-semibold tabular-nums ${colorClass}`}>{count}</span>}
    </div>
  );
}

interface OppfolgingItem {
  key: string;
  text: string;
  onClick?: () => void;
}

export default function JobbTodaySummary({
  tasks,
  onJumpToAsana,
  onJumpToTask,
  onJumpToNews,
  onJumpToContracts,
}: {
  tasks: Task[];
  onJumpToAsana: () => void;
  onJumpToTask: (id: string) => void;
  onJumpToNews: () => void;
  onJumpToContracts: () => void;
}) {
  const [reminders, setReminders] = useState<JobbReminder[]>([]);
  const [events, setEvents] = useState<JobbEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { data: newsData } = useSWR<{ news: NewsItem[] }>("/api/company-news", jsonFetcher);
  // Jobb-fanen henter fra fire eksterne systemer (Salesforce/Asana/Outlook/
  // Teams) uten noe ferskhet-signal noe sted — i motsetning til Sport, som
  // viser "oppdatert Xm siden" for data som er langt mindre kritisk om den
  // er noen timer gammel. Gjenbruker samme /api/data-sources-tidsstempler
  // som Datakilder-siden allerede viser, men her: den ELDSTE (mest utdaterte)
  // kilden, siden det er den som faktisk representerer risikoen.
  const { data: dataSourcesData } = useSWR<{ sources: { id: string; label: string; lastModified: string | null }[] }>(
    "/api/data-sources",
    jsonFetcher,
  );
  const oldestSource = [...(dataSourcesData?.sources ?? [])]
    .filter((s) => s.lastModified)
    .sort((a, b) => Date.parse(a.lastModified!) - Date.parse(b.lastModified!))[0];
  // "I dag"-forhåndsvisningen skal kun vise viktig/relevant og fersk nyheter
  // (ikke "lav" viktighet, ikke eldre enn en uke) — selve Mustad-nyheter-fanen
  // viser fortsatt ALT, uendret (se JobbCompanyNewsSection.tsx).
  const oneWeekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const allNews = newsData?.news ?? [];
  const relevantNews = allNews
    .filter((n) => n.importance !== "lav" && Date.parse(n.date) >= oneWeekAgoMs)
    .slice(0, 3);

  const load = useCallback(() => {
    Promise.allSettled([
      fetch("/api/jobb-reminders").then((r) => r.json()),
      fetch("/api/jobb-events").then((r) => r.json()),
    ]).then(([r, e]) => {
      setReminders(r.status === "fulfilled" ? ((r.value.reminders ?? []) as JobbReminder[]) : []);
      setEvents(e.status === "fulfilled" ? ((e.value.events ?? []) as JobbEvent[]) : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("mitt-dashboard:jobb-refresh", load);
    return () => window.removeEventListener("mitt-dashboard:jobb-refresh", load);
  }, [load]);

  const today = localDateString();

  const todaysMeetings = CALENDAR_EVENTS.filter((e) => e.dato === today);
  const dueReminders = reminders.filter((r) => !r.done && (!r.dueDate || r.dueDate <= today));
  const todaysEvents = events.filter((e) => e.date === today);

  const asanaWithDueDate = tasks.filter((t) => t.source === "asana" && t.dueAt);
  const viktigsteMailene = tasks.filter(
    (t) => t.source === "outlook" && t.outlookCategory === "trenger-oppfolging" && !t.cc,
  );

  const oppfolging: OppfolgingItem[] = [];
  for (const c of CONTRACTS) {
    if (c.signeringsdato === today) {
      oppfolging.push({
        key: `contract-${c.id}`,
        text: `Ny kontrakt signert i dag: ${c.kunde} (${formatKr(c.arsbelop)}/år)`,
        onClick: onJumpToContracts,
      });
    }
  }
  for (const t of tasks) {
    if (t.priority === "high" && t.dueAt && t.dueAt <= today) {
      oppfolging.push({ key: `task-${t.id}`, text: t.title, onClick: () => onJumpToTask(t.id) });
    }
  }

  return (
    <div className="p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink-1">I dag</h2>
      {loading ? (
        <SkeletonRows count={3} className="h-6" />
      ) : (
        <div className="flex flex-col gap-2">
          {/* Kategoriene under deles av én flat liste med tynne skillelinjer
              (divide-y) i stedet for hver sin fargede ramme+tint-boks — ikonets
              farge (colorClass) er allerede signalet for hvilken kategori det er. */}
          <div className="flex flex-col divide-y divide-line">
            <div className="pb-2 first:pt-0">
              <CategoryLabel icon={Calendar} colorClass="text-source-teams" label="Kalender" />
              {todaysMeetings.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {todaysMeetings.map((m) => (
                    <li key={m.id} className="text-sm text-ink-1">
                      <span className="tabular-nums text-ink-3">{m.start} </span>
                      {m.mote}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-3">Ingen møter i dag.</p>
              )}
            </div>

            <div className="py-2 last:pb-0">
              <CategoryLabel icon={Bell} colorClass="text-accent" label="Påminnelser" />
              {dueReminders.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {dueReminders.map((r) => (
                    <li key={r.id} className="text-sm text-ink-1">
                      {r.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-3">Ingen påminnelser i dag.</p>
              )}
            </div>

            {todaysEvents.length > 0 && (
              <div className="py-2 last:pb-0">
                <CategoryLabel icon={PartyPopper} colorClass="text-status-warning" label="Hendelser" />
                <ul className="flex flex-col gap-1">
                  {todaysEvents.map((e) => (
                    <li key={e.id} className="text-sm text-ink-1">
                      {e.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {oppfolging.length > 0 && (
              <div className="py-2 last:pb-0">
                <CategoryLabel icon={AlertTriangle} colorClass="text-status-danger" label="Krever oppfølging" count={oppfolging.length} />
                <ul className="flex flex-col gap-1">
                  {oppfolging.map((item) =>
                    item.onClick ? (
                      <li key={item.key}>
                        <button type="button" onClick={item.onClick} className="text-left text-sm text-ink-1 hover:underline">
                          {item.text}
                        </button>
                      </li>
                    ) : (
                      <li key={item.key} className="text-sm text-ink-1">
                        {item.text}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}

            <div className="py-2 last:pb-0">
              <CategoryLabel icon={Mail} colorClass="text-source-outlook" label="Viktigste mailene" count={viktigsteMailene.length || undefined} />
              {viktigsteMailene.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {viktigsteMailene.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => onJumpToTask(t.id)}
                        className="text-left text-sm text-ink-1 hover:underline"
                      >
                        {t.title}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-3">Ingen mailer som krever svar akkurat nå.</p>
              )}
            </div>

            <div className="py-2 last:pb-0">
              <div className="flex items-center justify-between">
                <CategoryLabel icon={Newspaper} colorClass="text-cyan-400" label="Mustad-nyheter" />
                <button type="button" onClick={onJumpToNews} className="text-2xs font-medium text-ink-3 hover:text-ink-1">
                  Se alle →
                </button>
              </div>
              {relevantNews.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {relevantNews.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={onJumpToNews}
                        className="w-full truncate text-left text-sm text-ink-1 hover:underline"
                      >
                        {n.title}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-3">
                  {allNews.length > 0 ? "Ingen viktige nyheter siste uken." : "Ingen nyheter registrert ennå."}
                </p>
              )}
            </div>
          </div>

          {oldestSource && (
            <p className="text-2xs text-ink-4">
              Eldste datakilde: {oldestSource.label} — oppdatert {timeAgo(Date.parse(oldestSource.lastModified!))}
            </p>
          )}

          <button
            type="button"
            onClick={onJumpToAsana}
            className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2 text-left transition hover:bg-surface-3"
          >
            <span className="flex items-center gap-1.5 text-sm text-ink-1">
              <ClipboardList className="h-4 w-4 text-ink-3" />
              Oppgaver i Asana med frist
            </span>
            <span className="text-sm font-semibold tabular-nums text-ink-1">{asanaWithDueDate.length}</span>
          </button>
        </div>
      )}
    </div>
  );
}
