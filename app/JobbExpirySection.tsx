"use client";

import { useState } from "react";
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
  EXPIRIES,
  EXPIRIES_WINDOW,
  type ExpiringTenant,
  type ExpiryStatus,
  formatDateDMY,
  formatKr,
} from "@/lib/widgets";
import { daysBetween, relativeDaysLabel } from "@/lib/payday";
import { ArrowUpRight, CalendarClock } from "lucide-react";

// Summeres fra EXPIRIES her i stedet for å importere EXPIRIES_TOTAL_ARSLEIE/
// EXPIRIES_REELL_EKSPONERING (2026-09-07): de er hånd-vedlikeholdte konstanter i datafilen
// og kan drifte fra tabellen de står under, på samme måte som Fazilesjekk-tellingene gjorde.
// Reell eksponering = linjer UTEN signert etterfølger-kontrakt (reforhandlet=true er reelt
// sikret, se merknaden over EXPIRIES i lib/widgets). EXPIRIES_WINDOW importeres fortsatt —
// uttrekksvinduet er en egenskap ved spørringen mot Fazile og finnes ikke i radene.
const TOTAL_ARSLEIE = EXPIRIES.reduce((sum, t) => sum + t.totalArsleie, 0);
const REELL_EKSPONERING = EXPIRIES.reduce(
  (sum, t) => sum + t.lines.reduce((linjeSum, l) => (l.reforhandlet ? linjeSum : linjeSum + l.totalArsleie), 0),
  0,
);

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

// Hastegrad-histogram: grupperer leietakerne etter NÆRMESTE linjes utløpsdato
// (samme utledning som `nearestLine` i ExpiryTenantRow under) i tre bøtter —
// 0–7/8–14/15–30 dager. Lista sin egentlige jobb er å rangere uro, ikke bare
// telle opp, så en enkelt sum i toppen (EXPIRIES.length) sier ingenting om
// HVOR HASTER det er. Ikke `RatioBar` (den uttrykker kun ferdig/totalt), men
// samme visuelle språk: tynn stolpe i seksjonsfargen, tegnet med bg-current,
// ingen ny avhengighet — kun tre segmenter i stedet for to.
// Bøttene regnes mot DAGENS dato, ikke mot linjenes forhåndsregnede `dagerTilUtlop`
// (2026-09-08). Det feltet er frosset i det øyeblikket uttrekket mot Fazile ble kjørt:
// med et uttrekk fra 12.08 lå to leietakere fortsatt i «0–7 d» og lyste rødt, mens de i
// virkeligheten gikk ut 14.08 og 18.08 — over tre uker før dagen kortet ble sett på.
// «Utløpt» er derfor en egen, første bøtte: har fristen passert er det ikke lenger et
// hastegradsspørsmål, og det skal ikke skjules inne i «0–7 d».
const URGENCY_BUCKETS = [
  { label: "Utløpt", swatch: "bg-status-danger", aria: "allerede utløpt" },
  { label: "0-7 d", swatch: "bg-current", aria: "innen 7 dager" },
  { label: "8-14 d", swatch: "bg-current opacity-60", aria: "om 8 til 14 dager" },
  { label: "15-30 d", swatch: "bg-current opacity-30", aria: "om 15 til 30 dager" },
];

export function expiryBucketIndex(dagerTil: number): number {
  if (dagerTil < 0) return 0;
  if (dagerTil <= 7) return 1;
  if (dagerTil <= 14) return 2;
  return 3;
}

function ExpiryUrgencyBar({ tenants, today, colorClass }: { tenants: ExpiringTenant[]; today: string; colorClass: string }) {
  const total = tenants.length;
  if (total === 0) return null;
  const buckets = [0, 0, 0, 0];
  for (const t of tenants) {
    const nearestDager = Math.min(...t.lines.map((l) => daysBetween(today, l.slutt)));
    buckets[expiryBucketIndex(nearestDager)] += 1;
  }
  return (
    <div className={colorClass}>
      <div
        className="flex h-1 overflow-hidden rounded-full bg-ink-4/25"
        role="img"
        aria-label={`Utløp etter hastegrad: ${buckets.map((c, i) => `${c} ${URGENCY_BUCKETS[i].aria}`).join(", ")}`}
      >
        {buckets.map((count, i) => (
          <span
            key={URGENCY_BUCKETS[i].label}
            className={`block h-full ${URGENCY_BUCKETS[i].swatch}`}
            style={{ width: `${(count / total) * 100}%` }}
          />
        ))}
      </div>
      {/* Tegnforklaring, ikke etiketter som forsøker å stå over «sitt» segment
          (2026-09-08): de gamle lå i flex-1-tredjedeler og pekte derfor sjelden på
          segmentet de beskrev, i text-[8.5px] text-ink-4 — under enhver lesbar
          størrelse, og grunnen til at «2 · 0-7 d» leste som «2-0-7 d». */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {buckets.map((count, i) => (
          <span key={URGENCY_BUCKETS[i].label} className="flex items-center gap-1.5 text-2xs text-ink-3">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${URGENCY_BUCKETS[i].swatch}`} aria-hidden />
            <span className="tabular-nums">{count}</span> {URGENCY_BUCKETS[i].label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ExpiryTenantRow({
  tenant,
  today,
  comments,
  onAdd,
  onRequestDelete,
  onToggleRelevance,
  onJumpToOppslag,
}: {
  tenant: ExpiringTenant;
  today: string;
  comments: Comment[];
  onAdd: (tekst: string) => Promise<boolean>;
  onRequestDelete: (commentId: string, preview: string) => void;
  onToggleRelevance: (commentId: string, ikkeRelevant: boolean) => void;
  onJumpToOppslag: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  // Nærmeste linje og hastegrad regnes fra `slutt` mot dagens dato, ikke fra det
  // forhåndsregnede `dagerTilUtlop` — se merknaden over URGENCY_BUCKETS.
  const nearestLine = tenant.lines.reduce((a, b) => (a.slutt <= b.slutt ? a : b));
  const dagerTilNaermeste = daysBetween(today, nearestLine.slutt);
  const utlopt = dagerTilNaermeste < 0;
  const utlopUrgent = dagerTilNaermeste < 10;

  return (
    <>
      <tr className="border-t border-line transition-colors hover:bg-surface-2/50">
        <td className="p-0">
          <div className="flex min-w-0 items-center">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
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
        <td className="whitespace-nowrap px-3 py-2 text-2xs text-ink-4">{tenant.bygg}</td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-3">{tenant.lines.length}</td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums font-medium text-ink-1">{formatKr(tenant.totalArsleie)}</td>
        {/* Avstanden i tid er det man handler på, og den kan ikke leses ut av datoen alene
            når uttrekket er noen uker gammelt — «14.08.2026» sa ingenting om at fristen
            var passert. relativeDaysLabel gir «12 dager siden» / «om 3 dager». */}
        <td className={`whitespace-nowrap px-3 py-2 tabular-nums ${utlopUrgent ? "font-medium text-status-danger" : "text-ink-3"}`}>
          {formatDateDMY(nearestLine.slutt)}
          <span className={`ml-1.5 text-2xs ${utlopt ? "text-status-danger" : "text-ink-4"}`}>
            {relativeDaysLabel(nearestLine.slutt, today)}
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <span
            title={tenant.statusKilde}
            className={`inline-flex items-center rounded-full px-2 py-1 text-2xs font-medium ${EXPIRY_STATUS_STYLE[tenant.status]}`}
          >
            {tenant.status}
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <CommentBadge count={comments.length} open={notesOpen} onClick={() => setNotesOpen((v) => !v)} />
        </td>
      </tr>
      {notesOpen && (
        <tr className="border-t border-line bg-surface-2/40">
          <td colSpan={7} className="px-3 py-2 pl-9">
            <CommentThreadBody comments={comments} onAdd={onAdd} onDelete={onRequestDelete} onToggleRelevance={onToggleRelevance} />
          </td>
        </tr>
      )}
      {open &&
        tenant.lines.map((l) => (
          <tr key={l.linjeId} className="border-t border-line border-l-2 border-l-line-strong bg-surface-3/50">
            <td colSpan={7} className="px-3 py-2 pl-8">
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
                  className={`whitespace-nowrap tabular-nums text-2xs ${daysBetween(today, l.slutt) < 10 ? "font-medium text-status-danger" : "text-ink-4"}`}
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

export default function JobbExpirySection({ today, onJumpToOppslag }: { today: string; onJumpToOppslag: (name: string) => void }) {
  const { comments, addComment, removeComment, toggleRelevance, confirmDelete } = useComments();
  const mutationError = useMutationError();

  // Uttrekksvinduet er en egenskap ved spørringen mot Fazile, og det ligger fast i fila.
  // Er starten passert, beskriver vinduet ikke lenger «neste 30 dager» — og det er verdt
  // å si høyt, for da er det uttrekket som må kjøres på nytt, ikke kortet som er i stykker.
  const vinduAlderDager = daysBetween(EXPIRIES_WINDOW.fraDato, today);
  const antallUtlopt = EXPIRIES.filter(
    (t) => Math.min(...t.lines.map((l) => daysBetween(today, l.slutt))) < 0,
  ).length;

  // Samme feilhåndtering som Nye kontrakter (2026-09-07): useComments ruller tilbake den
  // optimistiske endringen selv, men returverdien ble kastet — en mislykket kommentar
  // forsvant lydløst fra skjermen uten at brukeren fikk vite at den ikke ble lagret.
  async function handleAdd(targetId: string, tekst: string): Promise<boolean> {
    const ok = await addComment("expiry-tenant", targetId, tekst);
    if (!ok) mutationError.show("Kunne ikke legge til kommentaren. Prøv igjen.");
    return ok;
  }

  async function handleToggleRelevance(targetId: string, commentId: string, ikkeRelevant: boolean) {
    const ok = await toggleRelevance("expiry-tenant", targetId, commentId, ikkeRelevant);
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
    <div className="border-t-2 border-t-orange-400/60 p-4">
      {/* «neste 30 dager» var direkte feil så snart uttrekket ble noen dager gammelt: fire
          av leietakerne i lista hadde allerede passert utløpsdato. Etiketten beskriver nå
          uttrekket, som er det tallet faktisk teller. (2026-09-08) */}
      <CardHeader
        title="Utløpsliste"
        stat={{ value: EXPIRIES.length, label: "i uttrekket" }}
        icon={CalendarClock}
        iconColorClass="text-orange-400"
      />
        <>
          <MutationError message={mutationError.message} />
          {vinduAlderDager > 0 && (
            <p className="mb-2 text-2xs leading-relaxed text-status-warning">
              Uttrekket dekker {formatDateDMY(EXPIRIES_WINDOW.fraDato)}–{formatDateDMY(EXPIRIES_WINDOW.tilDato)}, som
              startet for {vinduAlderDager} dager siden
              {antallUtlopt > 0 ? ` — ${antallUtlopt} av leietakerne under har allerede passert utløpsdato` : ""}.
              Dagene til utløp regnes mot dagens dato, så lista er riktig, men den dekker ikke de neste 30 dagene før
              uttrekket kjøres på nytt.
            </p>
          )}
          <div className="mb-3">
            <ExpiryUrgencyBar tenants={EXPIRIES} today={today} colorClass="text-orange-400" />
          </div>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="text-left text-ink-4">
                  <th className="px-3 py-2 text-2xs font-medium">Leietaker</th>
                  <th className="px-3 py-2 text-2xs font-medium">Bygg</th>
                  <th className="px-3 py-2 text-2xs font-medium">Lin.</th>
                  <th className="px-3 py-2 text-2xs font-medium">Årsleie</th>
                  <th className="px-3 py-2 text-2xs font-medium">Utløp</th>
                  <th className="px-3 py-2 text-2xs font-medium">Status</th>
                  <th className="px-3 py-2 text-2xs font-medium">Notat</th>
                </tr>
              </thead>
              <tbody>
                {/* Tomtilstand (2026-09-07): en tom utløpsliste er GOD nyhet, men en tabell
                    uten rader og uten tekst leste som en lastefeil. */}
                {EXPIRIES.length === 0 && (
                  <tr className="border-t border-line">
                    <td colSpan={7} className="px-3 py-2 text-sm text-ink-3">
                      Ingen kontraktslinjer utløper i dette vinduet.
                    </td>
                  </tr>
                )}
                {EXPIRIES.map((t) => {
                  const targetId = String(t.customerId);
                  return (
                    <ExpiryTenantRow
                      key={t.customerId}
                      tenant={t}
                      today={today}
                      comments={comments[commentKey("expiry-tenant", targetId)] ?? []}
                      onAdd={(tekst) => handleAdd(targetId, tekst)}
                      onRequestDelete={(commentId, preview) =>
                        confirmDelete.request({ targetType: "expiry-tenant", targetId, commentId, preview })
                      }
                      onToggleRelevance={(commentId, ikkeRelevant) => handleToggleRelevance(targetId, commentId, ikkeRelevant)}
                      onJumpToOppslag={onJumpToOppslag}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-2xs text-ink-4">
            {formatDateDMY(EXPIRIES_WINDOW.fraDato)}–{formatDateDMY(EXPIRIES_WINDOW.tilDato)} · Total eksponering{" "}
            {formatKr(TOTAL_ARSLEIE)} · Reell eksponering (ekskl. reforhandlet) {formatKr(REELL_EKSPONERING)}
          </p>
        </>
      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={confirmDelete.pending ? `Slette kommentaren «${confirmDelete.pending.preview}»?` : ""}
        onCancel={confirmDelete.cancel}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
