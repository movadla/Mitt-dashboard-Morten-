"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/swrFetcher";
import { CardHeader, SkeletonRows } from "./CardShell";
import { timeAgo } from "@/lib/timeAgo";
import { Database } from "lucide-react";

interface DataSource {
  id: string;
  label: string;
  lastModified: string | null;
}

const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // 30 dager

export default function JobbDataSourcesCard() {
  const { data, isLoading: loading } = useSWR<{ sources: DataSource[] }>("/api/data-sources", jsonFetcher);
  const sources = data?.sources ?? [];
  // Eldst/mest utdatert øverst — det er det man faktisk trenger å legge merke til.
  const sorted = [...sources].sort((a, b) => {
    if (a.lastModified === null) return -1;
    if (b.lastModified === null) return 1;
    return Date.parse(a.lastModified) - Date.parse(b.lastModified);
  });

  return (
    <div className="border-t-2 border-t-slate-400/60 p-4">
      <CardHeader
        title="Datakilder"
        subtitle="Når hver manuelt oppdaterte kilde sist ble oppdatert"
        icon={Database}
        iconColorClass="text-slate-400"
      />
      <div className="flex flex-col gap-2">
        <p className="text-sm text-ink-3">
          Disse dataene oppdateres manuelt av Claude i egne research-runder (ikke live-integrert) — denne listen viser
          hvor lenge det er siden hver kilde faktisk ble oppdatert, så du vet om noe er ferskt eller bør oppdateres.
        </p>
        {loading ? (
          <SkeletonRows count={5} className="h-10" />
        ) : (
          <div className="flex flex-col gap-1.5">
            {sorted.map((s) => {
              const isStale = s.lastModified !== null && Date.now() - Date.parse(s.lastModified) > STALE_AFTER_MS;
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-ink-1">{s.label}</span>
                  <span
                    className={`shrink-0 text-2xs font-medium tabular-nums ${isStale ? "text-status-warning" : "text-ink-4"}`}
                    title={s.lastModified ? new Date(s.lastModified).toLocaleString("nb-NO") : "Ikke tilgjengelig"}
                  >
                    {s.lastModified ? timeAgo(Date.parse(s.lastModified)) : "Ikke tilgjengelig"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
