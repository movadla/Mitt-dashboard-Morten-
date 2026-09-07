"use client";

import { useState } from "react";
import { CardHeader, ConfirmDialog } from "./CardShell";
import { RatioBar } from "./privat/DataStrips";
import { CommentBadge, CommentThreadBody } from "./CommentsCell";
import { commentKey, useComments } from "./useComments";
import type { Comment } from "@/lib/comments";
import {
  GUARANTEES,
  GUARANTEE_TOTAL,
  type Guarantee,
  type GuaranteeStatus,
  formatDateDMY,
  formatKr,
} from "@/lib/widgets";
import { ArrowUpRight, ShieldCheck } from "lucide-react";

const GUARANTEE_STATUS_STYLE: Record<GuaranteeStatus, string> = {
  Mangler: "bg-status-danger/12 text-status-danger",
  Forespurt: "bg-status-warning/12 text-status-warning",
  Kommer: "bg-status-positive/12 text-status-positive",
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

function GuaranteeRow({
  guarantee: g,
  comments,
  onAdd,
  onRequestDelete,
  onToggleRelevance,
  onJumpToOppslag,
}: {
  guarantee: Guarantee;
  comments: Comment[];
  onAdd: (tekst: string) => Promise<boolean>;
  onRequestDelete: (commentId: string, preview: string) => void;
  onToggleRelevance: (commentId: string, ikkeRelevant: boolean) => void;
  onJumpToOppslag: (name: string) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  return (
    <>
      <tr className="border-t border-line transition-colors hover:bg-surface-2/50">
        <td className="whitespace-nowrap px-3 py-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-medium ${GUARANTEE_STATUS_STYLE[g.status]}`}>
            {g.status}
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-ink-2">
          <div className="flex items-center gap-1">
            <span className="truncate">{g.leietaker}</span>
            <OppslagLink name={g.leietaker} onJump={onJumpToOppslag} />
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-3">{g.belop === null ? "—" : formatKr(g.belop)}</td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-3">{formatDateDMY(g.frist)}</td>
        <td className="whitespace-nowrap px-3 py-2">
          <CommentBadge count={comments.length} open={notesOpen} onClick={() => setNotesOpen((v) => !v)} />
        </td>
      </tr>
      {notesOpen && (
        <tr className="border-t border-line bg-surface-2/40">
          <td colSpan={5} className="px-3 py-2 pl-9">
            <CommentThreadBody comments={comments} onAdd={onAdd} onDelete={onRequestDelete} onToggleRelevance={onToggleRelevance} />
          </td>
        </tr>
      )}
    </>
  );
}

export default function JobbGuaranteesSection({ onJumpToOppslag }: { onJumpToOppslag: (name: string) => void }) {
  const { comments, addComment, removeComment, toggleRelevance, confirmDelete } = useComments();
  // GUARANTEES sporer KUN innflyttinger Asana har flagget for garanti-oppfølging
  // (ikke porteføljens totale antall leieforhold — det tallet finnes ikke i denne
  // datakilden), så "totalt" under må nødvendigvis være denne oppfølgingslista
  // selv, ikke alle leieforhold hos Mustad. "Med garanti" = status "Kommer"
  // (garantien er sikret/på vei), altså den delen av oppfølgingssakene som ikke
  // lenger er et åpent problem — det ærlige komplementet til GUARANTEE_TOTAL
  // som faktisk kan utledes av dataene vi har.
  const sikret = GUARANTEES.filter((g) => g.status === "Kommer").length;
  return (
    <div className="border-t-2 border-t-teal-400/60 p-4">
      <CardHeader
        title="Garantioversikt"
        stat={{ value: GUARANTEE_TOTAL, label: "mangler garanti" }}
        icon={ShieldCheck}
        iconColorClass="text-teal-400"
      />
        <div className="mb-3">
          <RatioBar
            done={sikret}
            total={GUARANTEES.length}
            colorClass="text-teal-400"
            label={`${sikret} av ${GUARANTEES.length} oppfølgingssaker har sikret garanti`}
          />
        </div>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="text-left text-ink-4">
                <th className="px-3 py-2 text-2xs font-medium">Status</th>
                <th className="px-3 py-2 text-2xs font-medium">Leietaker</th>
                <th className="px-3 py-2 text-2xs font-medium text-right">Beløp</th>
                <th className="px-3 py-2 text-2xs font-medium text-right">Frist</th>
                <th className="px-3 py-2 text-2xs font-medium">Notat</th>
              </tr>
            </thead>
            <tbody>
              {GUARANTEES.map((g) => (
                <GuaranteeRow
                  key={g.id}
                  guarantee={g}
                  comments={comments[commentKey("guarantee", g.id)] ?? []}
                  onAdd={(tekst) => addComment("guarantee", g.id, tekst)}
                  onRequestDelete={(commentId, preview) => confirmDelete.request({ targetType: "guarantee", targetId: g.id, commentId, preview })}
                  onToggleRelevance={(commentId, ikkeRelevant) => toggleRelevance("guarantee", g.id, commentId, ikkeRelevant)}
                  onJumpToOppslag={onJumpToOppslag}
                />
              ))}
            </tbody>
          </table>
        </div>
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
