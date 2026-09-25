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
import { CONTRACT_DETALJER, CONTRACTS, type Contract, type ContractDetaljer, formatDateDMY, formatKr } from "@/lib/widgets";
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
  // v78 (2026-09-26, Morten: "nøkkelinfo og en oppsummering når jeg trykker på en kontrakt og
  // den boksen utvider seg"): klikk hvor som helst på selve raden (ikke et eget ikon/knapp) -
  // matcher mønsteret i Inntektsprognose sine leietaker-tabeller. Ikonene/kommentar-knappen
  // inni raden stopper egen event-boble (stopPropagation) slik at de ikke også åpner/lukker
  // denne, se OppslagLink og de to andre klikkbare elementene under.
  const [detaljerOpen, setDetaljerOpen] = useState(false);
  const detaljer = CONTRACT_DETALJER[c.id];
  return (
    <>
      <tr
        className="cursor-pointer border-t border-line transition-colors hover:bg-surface-2/50"
        onClick={() => setDetaljerOpen((v) => !v)}
      >
        <td className="whitespace-nowrap px-3 py-2 text-ink-2">
          <div className="flex items-center gap-1">
            <span className="truncate">{c.kunde}</span>
            <OppslagLink name={c.kunde} onJump={onJumpToOppslag} />
            {/* v77 (2026-09-26, presentasjonsrevisjon): "Kontrakt"-kolonnen (lenke til
                Salesforce) er fjernet - sfUrl er null for ~136 av ~149 rader (kun 3 gamle rader
                har den bevart, bulk-henting for resten ble ansett for kostbart), så en egen,
                alltid synlig kolonne var "—" nesten hele tiden. Vises nå kun som et lite ikon
                her, ved siden av kundenavnet, når lenken faktisk finnes - ingen tom kolonne. */}
            {c.sfUrl && (
              <a
                href={c.sfUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Åpne ${c.kunde} i Salesforce`}
                title="Åpne i Salesforce"
                className="shrink-0 text-ink-4 hover:text-accent"
              >
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </a>
            )}
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">{formatDateDMY(c.signeringsdato)}</td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">{formatDateDMY(c.startdato)}</td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">{formatKr(c.arsbelop)}</td>
        <td className="whitespace-nowrap px-3 py-2 text-ink-2">{c.bygg}</td>
        {/* Rått tall ga «135.6» med punktum som desimalskilletegn — engelsk formatering
            midt i et norsk grensesnitt. toLocaleString gir «135,6», og maxFractionDigits 1
            holder «12» som «12» i stedet for «12,0». (2026-09-08) */}
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-right text-ink-2">
          {c.kvm.toLocaleString("nb-NO", { maximumFractionDigits: 1 })}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-ink-2">{c.leietype}</td>
        <td className="whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <CommentBadge count={comments.length} open={notesOpen} onClick={() => setNotesOpen((v) => !v)} />
        </td>
      </tr>
      {detaljerOpen && (
        <tr className="border-t border-line bg-surface-2/40">
          <td colSpan={8} className="px-3 py-2 pl-9">
            <ContractDetaljerPanel detaljer={detaljer} />
          </td>
        </tr>
      )}
      {notesOpen && (
        <tr className="border-t border-line bg-surface-2/40">
          <td colSpan={8} className="px-3 py-2 pl-9">
            <CommentThreadBody comments={comments} onAdd={onAdd} onDelete={onRequestDelete} onToggleRelevance={onToggleRelevance} />
          </td>
        </tr>
      )}
    </>
  );
}

// v78 (2026-09-26): nøkkelinfo + oppsummering hentet fra Asana-prosjektet "Signerte dokumenter"
// (se lib/widgets.local.ts sin fyldige kommentar ved CONTRACT_DETALJER for metodikk og hvorfor
// signatarer/kontaktinfo bevisst ikke er med). Kun de 10 nyeste kontraktene har en oppføring så
// langt - resten viser en nøytral "ikke hentet ennå"-tekst, ikke en feilmelding.
function ContractDetaljerPanel({ detaljer }: { detaljer: ContractDetaljer | undefined }) {
  if (!detaljer) {
    return <p className="text-2xs text-ink-4">Ingen kontraktsdetaljer hentet fra Asana ennå.</p>;
  }
  const rad = (label: string, verdi: string | null) =>
    verdi ? (
      <div className="flex gap-1.5">
        <span className="shrink-0 text-ink-4">{label}:</span>
        <span className="text-ink-2">{verdi}</span>
      </div>
    ) : null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink-1">{detaljer.oppsummering}</p>
      <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-2xs sm:grid-cols-2">
        {rad("Kontraktsnummer", detaljer.kontraktsnummer)}
        {rad("Signert", detaljer.signertDato ? formatDateDMY(detaljer.signertDato) : null)}
        {rad("Sluttdato", detaljer.sluttdato ? formatDateDMY(detaljer.sluttdato) : "Løpende, ingen avtalt sluttdato")}
        {rad("MVA", detaljer.mvaType)}
        {rad("Garanti", detaljer.garantitype ? `${detaljer.garantitype}${detaljer.garantibelop ? ` (${formatKr(detaljer.garantibelop)})` : ""}` : null)}
        {rad(
          "Opsjon",
          detaljer.opsjon === null
            ? null
            : detaljer.opsjon
              ? `Ja${detaljer.opsjonsbetingelser ? `, ${detaljer.opsjonsbetingelser}` : ""}${detaljer.opsjonsperiodeManeder ? ` (${detaljer.opsjonsperiodeManeder} mnd)` : ""}`
              : "Nei",
        )}
      </div>
      {detaljer.saerligeBestemmelser && (
        <p className="text-2xs text-ink-3">
          <span className="font-medium text-ink-4">Særlige bestemmelser: </span>
          {detaljer.saerligeBestemmelser}
        </p>
      )}
      {detaljer.salesforceUrl && (
        <a
          href={detaljer.salesforceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex w-fit items-center gap-1 text-2xs text-accent hover:underline"
        >
          Åpne i Salesforce
          <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden />
        </a>
      )}
    </div>
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
                <th className="px-3 py-2 text-2xs font-medium">Notat</th>
              </tr>
            </thead>
            <tbody>
              {/* Tomtilstand (2026-09-07): en rolig måned ga tidligere en tom tabell uten
                  et ord — det leste som en lastefeil, ikke som "ingenting signert". */}
              {visibleRows.length === 0 && (
                <tr className="border-t border-line">
                  <td colSpan={8} className="px-3 py-2 text-sm text-ink-3">
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
