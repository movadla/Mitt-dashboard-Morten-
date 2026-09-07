"use client";

import { useState } from "react";
import { CardHeader, ConfirmDialog } from "./CardShell";
import { CommentBadge, CommentThreadBody } from "./CommentsCell";
import { commentKey, useComments } from "./useComments";
import type { Comment } from "@/lib/comments";
import {
  EXPIRIES,
  EXPIRIES_REELL_EKSPONERING,
  EXPIRIES_TOTAL_ARSLEIE,
  EXPIRIES_WINDOW,
  type ExpiringTenant,
  type ExpiryStatus,
  formatDateDMY,
  formatKr,
} from "@/lib/widgets";
import { ArrowUpRight, CalendarClock } from "lucide-react";

const EXPIRY_STATUS_STYLE: Record<ExpiryStatus, string> = {
  Reforhandlet: "bg-status-positive/12 text-status-positive",
  Terminert: "bg-status-danger/12 text-status-danger",
  "Mulig endring": "bg-status-warning/12 text-status-warning",
  "Reforhandling pågår": "bg-accent/15 text-accent",
  "Ingen varsel": "text-ink-4",
};

// Delt hoppeknapp brukt i Kontrakter/Utløp/Garantier/Kundefordringer for å
// hoppe til Oppslag med leietakernavnet forhåndsutfylt i søket der — det
// finnes ingen felles ID mellom Fazile/NXT/Asana/Salesforce å slå opp mot,
// så navnesøk er den ærlige (og eneste praktiske) koblingen.
function OppslagLink({ name, onJump }: { name: string; onJump: (name: string) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onJump(name);
      }}
      aria-label={`Søk «${name}» i Oppslag`}
      title="Søk i Oppslag"
      className="shrink-0 rounded p-0.5 text-ink-4 transition hover:text-accent"
    >
      <ArrowUpRight className="h-3 w-3" />
    </button>
  );
}

// Hastegrad-histogram: grupperer leietakerne etter NÆRMESTE linjes dagerTilUtlop
// (samme utledning som `nearestLine` i ExpiryTenantRow under) i tre bøtter —
// 0–7/8–14/15–30 dager. Lista sin egentlige jobb er å rangere uro, ikke bare
// telle opp, så en enkelt sum i toppen (EXPIRIES.length) sier ingenting om
// HVOR HASTER det er. Ikke `RatioBar` (den uttrykker kun ferdig/totalt), men
// samme visuelle språk: tynn stolpe i seksjonsfargen, tegnet med bg-current,
// ingen ny avhengighet — kun tre segmenter i stedet for to.
function ExpiryUrgencyBar({ tenants, colorClass }: { tenants: ExpiringTenant[]; colorClass: string }) {
  const total = tenants.length;
  if (total === 0) return null;
  const buckets = [0, 0, 0]; // 0–7, 8–14, 15–30 dager
  for (const t of tenants) {
    const nearestDager = Math.min(...t.lines.map((l) => l.dagerTilUtlop));
    buckets[nearestDager <= 7 ? 0 : nearestDager <= 14 ? 1 : 2] += 1;
  }
  const OPACITY = ["", "opacity-60", "opacity-30"]; // mest prekært = full styrke, avtar med god tid igjen
  const LABELS = ["0–7 d", "8–14 d", "15–30 d"];
  return (
    <div className={colorClass}>
      <div
        className="flex h-1 overflow-hidden rounded-full bg-ink-4/25"
        role="img"
        aria-label={`Utløp etter hastegrad: ${buckets[0]} innen 7 dager, ${buckets[1]} om 8 til 14 dager, ${buckets[2]} om 15 til 30 dager`}
      >
        {buckets.map((count, i) => (
          <span
            key={LABELS[i]}
            className={`block h-full bg-current ${OPACITY[i]}`}
            style={{ width: `${(count / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex" aria-hidden>
        {buckets.map((count, i) => (
          <span key={LABELS[i]} className="flex-1 text-center text-[8.5px] tabular-nums text-ink-4">
            {count} · {LABELS[i]}
          </span>
        ))}
      </div>
    </div>
  );
}

function ExpiryTenantRow({
  tenant,
  comments,
  onAdd,
  onRequestDelete,
  onToggleRelevance,
  onJumpToOppslag,
}: {
  tenant: ExpiringTenant;
  comments: Comment[];
  onAdd: (tekst: string) => Promise<boolean>;
  onRequestDelete: (commentId: string, preview: string) => void;
  onToggleRelevance: (commentId: string, ikkeRelevant: boolean) => void;
  onJumpToOppslag: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const nearestLine = tenant.lines.reduce((a, b) => (a.dagerTilUtlop <= b.dagerTilUtlop ? a : b));
  const utlopUrgent = nearestLine.dagerTilUtlop < 10;

  return (
    <>
      <tr className="border-t border-line transition-colors hover:bg-surface-2/50">
        <td className="p-0">
          <div className="flex min-w-0 items-center">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
          >
            <svg
              viewBox="0 0 16 16"
              className={`h-3.5 w-3.5 shrink-0 text-ink-4 transition-transform ${open ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
            <span className="truncate text-ink-2">{tenant.leietaker}</span>
          </button>
          <OppslagLink name={tenant.leietaker} onJump={onJumpToOppslag} />
          </div>
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-2xs text-ink-4">{tenant.bygg}</td>
        <td className="whitespace-nowrap px-2 py-2 tabular-nums text-ink-3">{tenant.lines.length}</td>
        <td className="whitespace-nowrap px-2 py-2 tabular-nums font-medium text-ink-1">{formatKr(tenant.totalArsleie)}</td>
        <td className={`whitespace-nowrap px-2 py-2 tabular-nums ${utlopUrgent ? "font-medium text-status-danger" : "text-ink-3"}`}>
          {formatDateDMY(nearestLine.slutt)}
        </td>
        <td className="whitespace-nowrap px-2 py-2">
          <span
            title={tenant.statusKilde}
            className={`inline-flex items-center rounded-full px-2 py-1 text-2xs font-medium ${EXPIRY_STATUS_STYLE[tenant.status]}`}
          >
            {tenant.status}
          </span>
        </td>
        <td className="whitespace-nowrap px-2 py-2">
          <CommentBadge count={comments.length} open={notesOpen} onClick={() => setNotesOpen((v) => !v)} />
        </td>
      </tr>
      {notesOpen && (
        <tr className="border-t border-line bg-surface-2/40">
          <td colSpan={7} className="px-2 py-2 pl-9">
            <CommentThreadBody comments={comments} onAdd={onAdd} onDelete={onRequestDelete} onToggleRelevance={onToggleRelevance} />
          </td>
        </tr>
      )}
      {open &&
        tenant.lines.map((l) => (
          <tr key={l.linjeId} className="border-t border-line border-l-2 border-l-line-strong bg-surface-3/50">
            <td colSpan={7} className="px-2 py-2 pl-8">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-baseline gap-x-4 gap-y-1 text-sm">
                <span className="min-w-0 truncate text-ink-2">
                  {l.beskrivelse}
                  {l.bygg !== "(ukjent bygg)" && l.bygg !== tenant.bygg && (
                    <span className="ml-1.5 text-2xs text-ink-4">· {l.bygg}</span>
                  )}
                </span>
                <span className="whitespace-nowrap text-2xs text-ink-4">{l.arealtype}</span>
                <span className="whitespace-nowrap text-2xs text-ink-4">{l.leietype}</span>
                <span className="whitespace-nowrap tabular-nums font-medium text-ink-2">{formatKr(l.totalArsleie)}</span>
                <span
                  className={`whitespace-nowrap tabular-nums text-2xs ${l.dagerTilUtlop < 10 ? "font-medium text-status-danger" : "text-ink-4"}`}
                >
                  {formatDateDMY(l.slutt)}
                </span>
              </div>
              {l.reforhandlet && l.nyKontraktsnokkel && (
                <p className="mt-1 text-2xs text-status-positive">
                  → Reforhandlet: {l.nyKontraktsnokkel}, ny start {formatDateDMY(l.nyKontraktStart!)}
                  {l.gapDager !== undefined && l.gapDager > 0 ? ` (${l.gapDager}d opphold)` : ""}
                </p>
              )}
            </td>
          </tr>
        ))}
    </>
  );
}

export default function JobbExpirySection({ onJumpToOppslag }: { onJumpToOppslag: (name: string) => void }) {
  const { comments, addComment, removeComment, toggleRelevance, confirmDelete } = useComments();
  return (
    <div className="border-t-2 border-t-orange-400/60 p-4">
      <CardHeader
        title="Utløpsliste"
        stat={{ value: EXPIRIES.length, label: "neste 30 dager" }}
        icon={CalendarClock}
        iconColorClass="text-orange-400"
      />
        <>
          <div className="mb-3">
            <ExpiryUrgencyBar tenants={EXPIRIES} colorClass="text-orange-400" />
          </div>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="text-left text-ink-4">
                  <th className="px-2 py-2 text-2xs font-medium">Leietaker</th>
                  <th className="px-2 py-2 text-2xs font-medium">Bygg</th>
                  <th className="px-2 py-2 text-2xs font-medium">Lin.</th>
                  <th className="px-2 py-2 text-2xs font-medium">Årsleie</th>
                  <th className="px-2 py-2 text-2xs font-medium">Utløp</th>
                  <th className="px-2 py-2 text-2xs font-medium">Status</th>
                  <th className="px-2 py-2 text-2xs font-medium">Notat</th>
                </tr>
              </thead>
              <tbody>
                {EXPIRIES.map((t) => {
                  const targetId = String(t.customerId);
                  return (
                    <ExpiryTenantRow
                      key={t.customerId}
                      tenant={t}
                      comments={comments[commentKey("expiry-tenant", targetId)] ?? []}
                      onAdd={(tekst) => addComment("expiry-tenant", targetId, tekst)}
                      onRequestDelete={(commentId, preview) =>
                        confirmDelete.request({ targetType: "expiry-tenant", targetId, commentId, preview })
                      }
                      onToggleRelevance={(commentId, ikkeRelevant) => toggleRelevance("expiry-tenant", targetId, commentId, ikkeRelevant)}
                      onJumpToOppslag={onJumpToOppslag}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-2xs text-ink-4">
            {formatDateDMY(EXPIRIES_WINDOW.fraDato)}–{formatDateDMY(EXPIRIES_WINDOW.tilDato)} · Total eksponering{" "}
            {formatKr(EXPIRIES_TOTAL_ARSLEIE)} · Reell eksponering (ekskl. reforhandlet) {formatKr(EXPIRIES_REELL_EKSPONERING)}
          </p>
        </>
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={confirmDelete.pending ? `Slette kommentaren «${confirmDelete.pending.preview}»?` : ""}
        onCancel={confirmDelete.cancel}
        onConfirm={() => {
          const pending = confirmDelete.pending;
          if (!pending) return;
          removeComment(pending.targetType, pending.targetId, pending.commentId);
          confirmDelete.cancel();
        }}
      />
    </div>
  );
}
