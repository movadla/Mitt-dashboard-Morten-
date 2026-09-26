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
import {
  HAR_GARANTI,
  MANGLER_GARANTI,
  GUARANTEES_SIST_OPPDATERT,
  type GuaranteeSecured,
  type GuaranteeMissing,
  type GuaranteeMissingStatus,
  formatDateDMY,
  formatKr,
} from "@/lib/widgets";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  ExternalLink,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

const MISSING_STATUS_STYLE: Record<GuaranteeMissingStatus, string> = {
  Mangler: "bg-status-danger/12 text-status-danger",
  Forespurt: "bg-status-warning/12 text-status-warning",
  "I dialog": "bg-accent/15 text-accent",
};

type SortDir = 1 | -1;

// Nullverdier havner alltid sist, uansett sorteringsretning - ellers hopper "ukjent dato"/
// "ukjent beløp" forvirrende mellom topp og bunn når man snur en kolonne.
function cmpNullableStr(a: string | null, b: string | null, dir: SortDir): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir * a.localeCompare(b);
}
function cmpNullableNum(a: number | null, b: number | null, dir: SortDir): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir * (a - b);
}

type HarSortKey = "leietaker" | "bygg" | "type" | "belop" | "garantiUtlop" | "leieforholdUtlop";
const HAR_COMPARATORS: Record<HarSortKey, (a: GuaranteeSecured, b: GuaranteeSecured, dir: SortDir) => number> = {
  leietaker: (a, b, dir) => dir * a.leietaker.localeCompare(b.leietaker),
  bygg: (a, b, dir) => cmpNullableStr(a.bygg, b.bygg, dir),
  type: (a, b, dir) => dir * a.type.localeCompare(b.type),
  belop: (a, b, dir) => dir * (a.belop - b.belop),
  garantiUtlop: (a, b, dir) => cmpNullableStr(a.garantiUtlop, b.garantiUtlop, dir),
  leieforholdUtlop: (a, b, dir) => cmpNullableStr(a.leieforholdUtlop, b.leieforholdUtlop, dir),
};

type ManglerSortKey = "leietaker" | "bygg" | "type" | "belopAvtalt" | "innflytting" | "status";
const MANGLER_COMPARATORS: Record<ManglerSortKey, (a: GuaranteeMissing, b: GuaranteeMissing, dir: SortDir) => number> = {
  leietaker: (a, b, dir) => dir * a.leietaker.localeCompare(b.leietaker),
  bygg: (a, b, dir) => cmpNullableStr(a.bygg, b.bygg, dir),
  type: (a, b, dir) => cmpNullableStr(a.type, b.type, dir),
  belopAvtalt: (a, b, dir) => cmpNullableNum(a.belopAvtalt, b.belopAvtalt, dir),
  innflytting: (a, b, dir) => cmpNullableStr(a.innflytting, b.innflytting, dir),
  status: (a, b, dir) => dir * a.status.localeCompare(b.status),
};

// Klikkbar kolonneoverskrift, delt av begge tabellene i seksjonen. Første klikk sorterer
// stigende, andre klikk på samme kolonne snur til synkende - forblir der til en annen
// kolonne klikkes (ingen tredje-klikk-reset, det er sjeldent noen vil tilbake til
// standardsorteringen via akkurat denne knappen).
function SortableTh<K extends string>({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: K;
  active: boolean;
  dir: SortDir;
  onSort: (key: K) => void;
  align?: "left" | "right" | "center";
}) {
  const Icon = active ? (dir === 1 ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th className={`px-3 py-2 text-2xs font-medium ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-0.5 transition hover:text-ink-2 ${active ? "text-ink-2" : "text-ink-4"}`}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? "" : "opacity-50"}`} />
      </button>
    </th>
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

// Hover-tooltip er en fin snarvei på desktop, men gir ingenting å ta på mobil —
// selve begrunnelsen står derfor ALLTID i utvidet detalj under raden også
// (se DetailRow), ikonet+tooltipen her er bare en rask visuell markør.
function UsikkerMarker({ arsak }: { arsak?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex shrink-0 items-center text-status-warning" aria-label="Usikker kilde">
            <TriangleAlert className="h-3.5 w-3.5" />
          </span>
        }
      />
      <TooltipContent className="max-w-xs text-left">{arsak}</TooltipContent>
    </Tooltip>
  );
}

function DetailRow({ colSpan, kilde, usikkerhetsArsak, fritekst }: { colSpan: number; kilde: string; usikkerhetsArsak?: string; fritekst?: string | null }) {
  return (
    <tr className="border-t border-line bg-surface-3/50">
      <td colSpan={colSpan} className="p-0">
        <div className="sticky left-0 w-[calc(100vw-2.5rem)] max-w-[560px] space-y-1 px-3 py-2 pl-8 text-2xs text-ink-3">
          {usikkerhetsArsak && (
            <p className="text-status-warning">
              <span className="font-medium">Usikker: </span>
              {usikkerhetsArsak}
            </p>
          )}
          {fritekst && <p>{fritekst}</p>}
          <p className="text-ink-4">Kilde: {kilde}</p>
        </div>
      </td>
    </tr>
  );
}

function SecuredRow({
  g,
  comments,
  onAdd,
  onRequestDelete,
  onToggleRelevance,
  onJumpToOppslag,
}: {
  g: GuaranteeSecured;
  comments: Comment[];
  onAdd: (tekst: string) => Promise<boolean>;
  onRequestDelete: (commentId: string, preview: string) => void;
  onToggleRelevance: (commentId: string, ikkeRelevant: boolean) => void;
  onJumpToOppslag: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  return (
    <>
      <tr className="cursor-pointer border-t border-line transition-colors hover:bg-surface-2/50" onClick={() => setOpen((v) => !v)}>
        <td className="px-3 py-2 text-ink-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {g.usikker && <UsikkerMarker arsak={g.usikkerhetsArsak} />}
            <span className="truncate">{g.leietaker}</span>
            <OppslagLink name={g.leietaker} onJump={onJumpToOppslag} />
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-2xs text-ink-4">{g.bygg ?? "—"}</td>
        <td className="whitespace-nowrap px-3 py-2 text-2xs text-ink-3">{g.type}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium text-ink-1">{formatKr(g.belop)}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-3">{g.garantiUtlop ? formatDateDMY(g.garantiUtlop) : "—"}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-3">{g.leieforholdUtlop ? formatDateDMY(g.leieforholdUtlop) : "—"}</td>
        <td className="whitespace-nowrap px-3 py-2 text-center">
          {g.lenke ? (
            <a
              href={g.lenke}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex text-ink-4 transition hover:text-accent"
              title="Åpne lenke"
              aria-label={`Åpne garantidokument for ${g.leietaker}`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span className="text-ink-4">—</span>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <CommentBadge count={comments.length} open={notesOpen} onClick={() => setNotesOpen((v) => !v)} />
        </td>
      </tr>
      {open && <DetailRow colSpan={7} kilde={g.kilde} usikkerhetsArsak={g.usikkerhetsArsak} />}
      {notesOpen && (
        <tr className="border-t border-line bg-surface-2/40">
          <td colSpan={7} className="px-3 py-2 pl-9">
            <CommentThreadBody comments={comments} onAdd={onAdd} onDelete={onRequestDelete} onToggleRelevance={onToggleRelevance} />
          </td>
        </tr>
      )}
    </>
  );
}

function MissingRow({
  g,
  comments,
  onAdd,
  onRequestDelete,
  onToggleRelevance,
  onJumpToOppslag,
}: {
  g: GuaranteeMissing;
  comments: Comment[];
  onAdd: (tekst: string) => Promise<boolean>;
  onRequestDelete: (commentId: string, preview: string) => void;
  onToggleRelevance: (commentId: string, ikkeRelevant: boolean) => void;
  onJumpToOppslag: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  return (
    <>
      <tr className="cursor-pointer border-t border-line transition-colors hover:bg-surface-2/50" onClick={() => setOpen((v) => !v)}>
        <td className="px-3 py-2 text-ink-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {g.usikker && <UsikkerMarker arsak={g.usikkerhetsArsak} />}
            <span className="truncate">{g.leietaker}</span>
            <OppslagLink name={g.leietaker} onJump={onJumpToOppslag} />
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-2xs text-ink-4">{g.bygg ?? "—"}</td>
        <td className="whitespace-nowrap px-3 py-2 text-2xs text-ink-3">{g.type ?? "—"}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-1">{g.belopAvtalt !== null ? formatKr(g.belopAvtalt) : "—"}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-3">{g.innflytting ? formatDateDMY(g.innflytting) : "—"}</td>
        <td className="whitespace-nowrap px-3 py-2">
          <span className={`inline-flex items-center rounded-full px-2 py-1 text-2xs font-medium ${MISSING_STATUS_STYLE[g.status]}`}>{g.status}</span>
        </td>
        <td className="whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <CommentBadge count={comments.length} open={notesOpen} onClick={() => setNotesOpen((v) => !v)} />
        </td>
      </tr>
      {open && <DetailRow colSpan={7} kilde={g.kilde} usikkerhetsArsak={g.usikkerhetsArsak} fritekst={g.sisteStatusFritekst} />}
      {notesOpen && (
        <tr className="border-t border-line bg-surface-2/40">
          <td colSpan={7} className="px-3 py-2 pl-9">
            <CommentThreadBody comments={comments} onAdd={onAdd} onDelete={onRequestDelete} onToggleRelevance={onToggleRelevance} />
          </td>
        </tr>
      )}
    </>
  );
}

export default function JobbGuaranteesSection({ onJumpToOppslag }: { today: string; onJumpToOppslag: (name: string) => void }) {
  const { comments, addComment, removeComment, toggleRelevance, confirmDelete } = useComments();
  const mutationError = useMutationError();
  const [sok, setSok] = useState("");
  const [harSort, setHarSort] = useState<{ key: HarSortKey; dir: SortDir } | null>(null);
  const [manglerSort, setManglerSort] = useState<{ key: ManglerSortKey; dir: SortDir } | null>(null);

  function toggleHarSort(key: HarSortKey) {
    setHarSort((prev) => (prev?.key === key ? { key, dir: (prev.dir * -1) as SortDir } : { key, dir: 1 }));
  }
  function toggleManglerSort(key: ManglerSortKey) {
    setManglerSort((prev) => (prev?.key === key ? { key, dir: (prev.dir * -1) as SortDir } : { key, dir: 1 }));
  }

  // Samme feilhåndtering som Nye kontrakter (2026-09-07): useComments ruller tilbake den
  // optimistiske endringen selv, men returverdien ble kastet — en mislykket kommentar
  // forsvant lydløst fra skjermen uten at brukeren fikk vite at den ikke ble lagret.
  async function handleAdd(id: string, tekst: string): Promise<boolean> {
    const ok = await addComment("guarantee", id, tekst);
    if (!ok) mutationError.show("Kunne ikke legge til kommentaren. Prøv igjen.");
    return ok;
  }

  async function handleToggleRelevance(id: string, commentId: string, ikkeRelevant: boolean) {
    const ok = await toggleRelevance("guarantee", id, commentId, ikkeRelevant);
    if (!ok) mutationError.show("Kunne ikke oppdatere kommentaren. Prøv igjen.");
  }

  async function handleConfirmDelete() {
    const pending = confirmDelete.pending;
    if (!pending) return;
    const ok = await removeComment(pending.targetType, pending.targetId, pending.commentId);
    if (!ok) mutationError.show("Kunne ikke slette kommentaren. Prøv igjen.");
    confirmDelete.cancel();
  }

  // Størst eksponering øverst — det er beløpet, ikke navnet, som avgjør hvor det haster å
  // dobbeltsjekke en "usikker"-rad.
  const harSortert = useMemo(() => [...HAR_GARANTI].sort((a, b) => b.belop - a.belop), []);
  // Bekreftet ferske saker (ikke usikker) først — det er de Morten faktisk skal følge opp i dag.
  // Innenfor det, nærmeste innflytting/frist først; ukjent dato sist.
  const manglerSortert = useMemo(
    () =>
      [...MANGLER_GARANTI].sort((a, b) => {
        if (!!a.usikker !== !!b.usikker) return a.usikker ? 1 : -1;
        if (a.innflytting && b.innflytting) return a.innflytting.localeCompare(b.innflytting);
        if (a.innflytting) return -1;
        if (b.innflytting) return 1;
        return a.leietaker.localeCompare(b.leietaker);
      }),
    [],
  );

  const sokLav = sok.trim().toLowerCase();
  const harBase = sokLav ? harSortert.filter((g) => g.leietaker.toLowerCase().includes(sokLav)) : harSortert;
  const harFiltrert = harSort ? [...harBase].sort((a, b) => HAR_COMPARATORS[harSort.key](a, b, harSort.dir)) : harBase;
  const manglerBase = sokLav ? manglerSortert.filter((g) => g.leietaker.toLowerCase().includes(sokLav)) : manglerSortert;
  const manglerFiltrert = manglerSort
    ? [...manglerBase].sort((a, b) => MANGLER_COMPARATORS[manglerSort.key](a, b, manglerSort.dir))
    : manglerBase;

  const antallUsikkerHar = HAR_GARANTI.filter((g) => g.usikker).length;
  const antallUsikkerMangler = MANGLER_GARANTI.filter((g) => g.usikker).length;

  return (
    <div className="border-t-2 border-t-teal-400/60 p-4">
      <CardHeader
        title="Garantioversikt"
        stat={{ value: MANGLER_GARANTI.length, label: "mangler garanti" }}
        icon={ShieldCheck}
        iconColorClass="text-teal-400"
      />
      <MutationError message={mutationError.message} />
      <p className="mb-3 text-2xs leading-relaxed text-ink-4">
        Sist oppdatert {formatDateDMY(GUARANTEES_SIST_OPPDATERT)} (Salesforce/SharePoint/Asana/Outlook/Teams). {antallUsikkerHar + antallUsikkerMangler} rader er
        markert usikker (<TriangleAlert className="inline h-3 w-3 -translate-y-px text-status-warning" />) — kun bekreftet i en eldre kilde, ikke krysssjekket mot
        noe friskere.
      </p>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
        <input
          type="text"
          value={sok}
          onChange={(e) => setSok(e.target.value)}
          placeholder="Søk etter leietaker …"
          className="w-full rounded-lg border border-line bg-surface-2 py-1.5 pl-8 pr-3 text-sm text-ink-1 placeholder:text-ink-4 focus:border-line-strong focus:outline-none"
        />
      </div>
      <Tabs defaultValue="har">
        <TabsList variant="line">
          <TabsTrigger value="har">Har garanti ({harFiltrert.length})</TabsTrigger>
          <TabsTrigger value="mangler">Mangler garanti ({manglerFiltrert.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="har">
          <div className="-mx-1 mt-2 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-ink-4">
                  <SortableTh label="Leietaker" sortKey="leietaker" active={harSort?.key === "leietaker"} dir={harSort?.dir ?? 1} onSort={toggleHarSort} />
                  <SortableTh label="Bygg" sortKey="bygg" active={harSort?.key === "bygg"} dir={harSort?.dir ?? 1} onSort={toggleHarSort} />
                  <SortableTh label="Type" sortKey="type" active={harSort?.key === "type"} dir={harSort?.dir ?? 1} onSort={toggleHarSort} />
                  <SortableTh label="Beløp" sortKey="belop" active={harSort?.key === "belop"} dir={harSort?.dir ?? 1} onSort={toggleHarSort} align="right" />
                  <SortableTh
                    label="Garanti utløper"
                    sortKey="garantiUtlop"
                    active={harSort?.key === "garantiUtlop"}
                    dir={harSort?.dir ?? 1}
                    onSort={toggleHarSort}
                    align="right"
                  />
                  <SortableTh
                    label="Leieforhold utløper"
                    sortKey="leieforholdUtlop"
                    active={harSort?.key === "leieforholdUtlop"}
                    dir={harSort?.dir ?? 1}
                    onSort={toggleHarSort}
                    align="right"
                  />
                  <th className="px-3 py-2 text-center text-2xs font-medium">Lenke</th>
                  <th className="px-3 py-2 text-2xs font-medium">Notat</th>
                </tr>
              </thead>
              <tbody>
                {harFiltrert.length === 0 && (
                  <tr className="border-t border-line">
                    <td colSpan={8} className="px-3 py-2 text-sm text-ink-3">
                      {sok ? "Ingen treff." : "Ingen registrerte garantier."}
                    </td>
                  </tr>
                )}
                {harFiltrert.map((g) => (
                  <SecuredRow
                    key={g.id}
                    g={g}
                    comments={comments[commentKey("guarantee", g.id)] ?? []}
                    onAdd={(tekst) => handleAdd(g.id, tekst)}
                    onRequestDelete={(commentId, preview) => confirmDelete.request({ targetType: "guarantee", targetId: g.id, commentId, preview })}
                    onToggleRelevance={(commentId, ikkeRelevant) => handleToggleRelevance(g.id, commentId, ikkeRelevant)}
                    onJumpToOppslag={onJumpToOppslag}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="mangler">
          <div className="-mx-1 mt-2 overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="text-left text-ink-4">
                  <SortableTh label="Leietaker" sortKey="leietaker" active={manglerSort?.key === "leietaker"} dir={manglerSort?.dir ?? 1} onSort={toggleManglerSort} />
                  <SortableTh label="Bygg" sortKey="bygg" active={manglerSort?.key === "bygg"} dir={manglerSort?.dir ?? 1} onSort={toggleManglerSort} />
                  <SortableTh label="Type" sortKey="type" active={manglerSort?.key === "type"} dir={manglerSort?.dir ?? 1} onSort={toggleManglerSort} />
                  <SortableTh
                    label="Avtalt beløp"
                    sortKey="belopAvtalt"
                    active={manglerSort?.key === "belopAvtalt"}
                    dir={manglerSort?.dir ?? 1}
                    onSort={toggleManglerSort}
                    align="right"
                  />
                  <SortableTh
                    label="Innflytting/frist"
                    sortKey="innflytting"
                    active={manglerSort?.key === "innflytting"}
                    dir={manglerSort?.dir ?? 1}
                    onSort={toggleManglerSort}
                    align="right"
                  />
                  <SortableTh label="Status" sortKey="status" active={manglerSort?.key === "status"} dir={manglerSort?.dir ?? 1} onSort={toggleManglerSort} />
                  <th className="px-3 py-2 text-2xs font-medium">Notat</th>
                </tr>
              </thead>
              <tbody>
                {manglerFiltrert.length === 0 && (
                  <tr className="border-t border-line">
                    <td colSpan={7} className="px-3 py-2 text-sm text-ink-3">
                      {sok ? "Ingen treff." : "Ingen innflyttinger venter på bankgaranti eller depositum."}
                    </td>
                  </tr>
                )}
                {manglerFiltrert.map((g) => (
                  <MissingRow
                    key={g.id}
                    g={g}
                    comments={comments[commentKey("guarantee", g.id)] ?? []}
                    onAdd={(tekst) => handleAdd(g.id, tekst)}
                    onRequestDelete={(commentId, preview) => confirmDelete.request({ targetType: "guarantee", targetId: g.id, commentId, preview })}
                    onToggleRelevance={(commentId, ikkeRelevant) => handleToggleRelevance(g.id, commentId, ikkeRelevant)}
                    onJumpToOppslag={onJumpToOppslag}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={confirmDelete.pending ? `Slette kommentaren «${confirmDelete.pending.preview}»?` : ""}
        onCancel={confirmDelete.cancel}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
