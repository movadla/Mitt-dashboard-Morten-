"use client";

import { useMemo, useState } from "react";
import {
  CardHeader,
  ConfirmDialog,
  MutationError,
  useMutationError,
} from "./CardShell";
import { CommentBadge, CommentThreadBody } from "./CommentsCell";
import { commentKey, useComments } from "./useComments";
import type { Comment } from "@/lib/comments";
import { CONTRACTS, type Contract, formatDateDMY, formatKr } from "@/lib/widgets";
import { ArrowUpRight, FileSignature } from "lucide-react";

function ContractRow({
  contract: c,
  comments,
  onAdd,
  onRequestDelete,
  onToggleRelevance,
  onJumpToOppslag,
}: {
  contract: Contract;
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
        <td className="whitespace-nowrap px-3 py-2 text-ink-2">
          <div className="flex items-center gap-1">
            <span className="truncate">{c.kunde}</span>
            <OppslagLink name={c.kunde} onJump={onJumpToOppslag} />
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">{formatDateDMY(c.signeringsdato)}</td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">{formatDateDMY(c.startdato)}</td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">{formatKr(c.arsbelop)}</td>
        <td className="whitespace-nowrap px-3 py-2 text-ink-2">{c.bygg}</td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">{c.kvm}</td>
        <td className="whitespace-nowrap px-3 py-2 text-ink-2">{c.leietype}</td>
        <td className="whitespace-nowrap px-3 py-2">
          {c.sfUrl ? (
            <a
              href={c.sfUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Åpne ${c.kunde} i Salesforce`}
              className="text-accent hover:underline"
            >
              Link
            </a>
          ) : (
            <span className="text-ink-4">—</span>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <CommentBadge count={comments.length} open={notesOpen} onClick={() => setNotesOpen((v) => !v)} />
        </td>
      </tr>
      {notesOpen && (
        <tr className="border-t border-line bg-surface-2/40">
          <td colSpan={9} className="px-3 py-2 pl-9">
            <CommentThreadBody comments={comments} onAdd={onAdd} onDelete={onRequestDelete} onToggleRelevance={onToggleRelevance} />
          </td>
        </tr>
      )}
    </>
  );
}

// Cutoff for "siden årsstart": de tre første månedene av et nytt år faller tilbake til
// forrige årsstart i stedet (unngår en nesten tom "siden 2027"-visning i januar-mars —
// utvider først til inneværende års 1. januar fra og med april).
function yearStartCutoff(todayISO: string): string {
  const [yearStr, monthStr] = todayISO.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const effectiveYear = month <= 3 ? year - 1 : year;
  return `${effectiveYear}-01-01`;
}

// Regnes i UTC, uten lokale get/set-tidspunkter (2026-09-07): `new Date(iso)` tolkes som
// midnatt UTC, mens setMonth/getMonth jobber i lokal tid — over en sommertidsovergang
// forskjøv den kombinasjonen datoen én dag (oneMonthBack("2026-11-07") ga "2026-10-06" i
// Europe/Oslo), og det flyttet grensen for hva som telles som "signert siste måned".
// Overflyt i måneden (31. mars → 3. mars) oppfører seg som før; kun tidssonefeilen er borte.
// yearStartCutoff over har ikke samme feil — den regner rent på ISO-strengen og rører
// aldri et Date-objekt.
function oneMonthBack(todayISO: string): string {
  const [year, month, day] = todayISO.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(year, month - 2, day)).toISOString().slice(0, 10);
}

export default function JobbContractsSection({ today, onJumpToOppslag }: { today: string; onJumpToOppslag: (name: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const lastMonthCutoff = oneMonthBack(today);
  const yearCutoff = yearStartCutoff(today);
  const sinceLastMonth = useMemo(() => CONTRACTS.filter((c) => c.signeringsdato >= lastMonthCutoff), [lastMonthCutoff]);
  const sinceYearStart = useMemo(() => CONTRACTS.filter((c) => c.signeringsdato >= yearCutoff), [yearCutoff]);
  const visible = expanded ? sinceYearStart : sinceLastMonth;
  const visibleRows = expanded ? visible.slice(0, visibleCount) : visible;
  const { comments, addComment, removeComment, toggleRelevance, confirmDelete } = useComments();
  const mutationError = useMutationError();

  async function handleAdd(id: string, tekst: string): Promise<boolean> {
    const ok = await addComment("contract", id, tekst);
    if (!ok) mutationError.show("Kunne ikke legge til kommentaren. Prøv igjen.");
    return ok;
  }

  async function handleToggleRelevance(id: string, commentId: string, ikkeRelevant: boolean) {
    const ok = await toggleRelevance("contract", id, commentId, ikkeRelevant);
    if (!ok) mutationError.show("Kunne ikke oppdatere kommentaren. Prøv igjen.");
  }

  async function handleConfirmDelete() {
    const pending = confirmDelete.pending;
    if (!pending) return;
    const ok = await removeComment(pending.targetType, pending.targetId, pending.commentId);
    if (!ok) mutationError.show("Kunne ikke slette kommentaren. Prøv igjen.");
    confirmDelete.cancel();
  }

  return (
    <div className="border-t-2 border-t-rose-400/60 p-4">
      <CardHeader
        title="Nye kontrakter"
        stat={{ value: visible.length, label: expanded ? `signert siden ${yearCutoff.slice(0, 4)}` : "signert siste måned" }}
        icon={FileSignature}
        iconColorClass="text-rose-400"
      />
        {/* Ingen datastripe her (i motsetning til Utløp/Garantier): en kontraktsrad har
            ingen naturlig ferdig/totalt- eller kategori-todeling å kode visuelt — `leietype`
            er fritekst/sammensatt per rad (f.eks. "Husleie/Garasje/El-bil"), ikke en ren
            kategori, og `sfUrl` er alltid null i denne datakilden (ville gitt en evig
            0-av-alt-stripe). Å tvinge inn en stripe hadde vært støy, ikke informasjon. */}
        <MutationError message={mutationError.message} />
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="text-left text-ink-4">
                <th className="px-3 py-2 text-2xs font-medium">Kunde</th>
                <th className="px-3 py-2 text-2xs font-medium text-right">Signert</th>
                <th className="px-3 py-2 text-2xs font-medium text-right">Start</th>
                <th className="px-3 py-2 text-2xs font-medium text-right">Beløp</th>
                <th className="px-3 py-2 text-2xs font-medium">Bygg</th>
                <th className="px-3 py-2 text-2xs font-medium text-right">Kvm</th>
                <th className="px-3 py-2 text-2xs font-medium">Type</th>
                <th className="px-3 py-2 text-2xs font-medium">Kontrakt</th>
                <th className="px-3 py-2 text-2xs font-medium">Notat</th>
              </tr>
            </thead>
            <tbody>
              {/* Tomtilstand (2026-09-07): en rolig måned ga tidligere en tom tabell uten
                  et ord — det leste som en lastefeil, ikke som "ingenting signert". */}
              {visibleRows.length === 0 && (
                <tr className="border-t border-line">
                  <td colSpan={9} className="px-3 py-2 text-sm text-ink-3">
                    {expanded
                      ? `Ingen kontrakter signert siden ${yearCutoff.slice(0, 4)}.`
                      : "Ingen kontrakter signert siste måned."}
                  </td>
                </tr>
              )}
              {visibleRows.map((c) => (
                <ContractRow
                  key={c.id}
                  contract={c}
                  comments={comments[commentKey("contract", c.id)] ?? []}
                  onAdd={(tekst) => handleAdd(c.id, tekst)}
                  onRequestDelete={(commentId, preview) => confirmDelete.request({ targetType: "contract", targetId: c.id, commentId, preview })}
                  onToggleRelevance={(commentId, ikkeRelevant) => handleToggleRelevance(c.id, commentId, ikkeRelevant)}
                  onJumpToOppslag={onJumpToOppslag}
                />
              ))}
            </tbody>
          </table>
        </div>
        {expanded && visible.length > visibleCount && (
          <button
            type="button"
            onClick={() => setVisibleCount((v) => v + 10)}
            className="mt-3 text-xs font-medium text-ink-3 hover:text-ink-1"
          >
            {`Mer (${visible.length - visibleCount})`}
          </button>
        )}
        {sinceYearStart.length > sinceLastMonth.length && (
          <button
            type="button"
            onClick={() => {
              setExpanded((v) => !v);
              setVisibleCount(10);
            }}
            aria-expanded={expanded}
            className="mt-3 block text-xs font-medium text-accent hover:text-accent/80"
          >
            {expanded ? "Vis kun siste måned" : `Vis alle siden ${yearCutoff.slice(0, 4)} (${sinceYearStart.length - sinceLastMonth.length} flere)`}
          </button>
        )}
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={confirmDelete.pending ? `Slette kommentaren «${confirmDelete.pending.preview}»?` : ""}
        onCancel={confirmDelete.cancel}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

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
