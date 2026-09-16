"use client";

import { Download } from "lucide-react";
import type { RyggDailyLog, RyggSessionLog } from "@/lib/ryggLog";
import { formatDMY } from "@/lib/payday";

interface Props {
  dailyLogs: RyggDailyLog[];
  sessionLogs: RyggSessionLog[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}

export default function LogTab({ dailyLogs, sessionLogs, onChanged, onError }: Props) {
  const rows = [
    ...dailyLogs.map((d) => ({ kind: "daily" as const, date: d.date, data: d })),
    ...sessionLogs.map((s) => ({ kind: "session" as const, date: s.date, data: s })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  async function handleDeleteDaily(date: string) {
    try {
      const res = await fetch(`/api/rygg/daily/${date}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      await onChanged();
    } catch {
      onError("Kunne ikke slette loggen. Prøv igjen.");
    }
  }

  async function handleDeleteSession(id: string) {
    try {
      const res = await fetch(`/api/rygg/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      await onChanged();
    } catch {
      onError("Kunne ikke slette økten. Prøv igjen.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <a
        href="/api/rygg/export"
        download
        className="flex items-center gap-1.5 self-start rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-2xs font-semibold uppercase text-ink-2 transition hover:text-ink-1"
      >
        <Download className="h-3.5 w-3.5" />
        Eksporter CSV
      </a>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-4">Ingen logger ennå.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {rows.map((row) => (
            <div
              key={`${row.kind}-${row.kind === "daily" ? row.date : row.data.id}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="text-ink-1">{formatDMY(row.date)}</span>{" "}
                {row.kind === "daily" ? (
                  <span className="text-ink-3">
                    Smerte {row.data.pain}
                    {row.data.radiating ? " · utstråling" : ""}
                    {row.data.walked ? " · gikk" : ""}
                    {row.data.note ? ` · ${row.data.note}` : ""}
                  </span>
                ) : (
                  <span className="text-ink-3">
                    Uke {row.data.week} · økt {row.data.sessionNo}
                    {row.data.variant ? ` (${row.data.variant})` : ""} · RPE {row.data.rpe}
                    {row.data.aggravated ? " · etterreaksjon" : ""}
                    {row.data.completedExerciseIds ? ` · ${row.data.completedExerciseIds.length} øvelser krysset av` : ""}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => (row.kind === "daily" ? handleDeleteDaily(row.date) : handleDeleteSession(row.data.id))}
                className="shrink-0 text-2xs font-medium text-ink-4 hover:text-status-danger"
              >
                Slett
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
