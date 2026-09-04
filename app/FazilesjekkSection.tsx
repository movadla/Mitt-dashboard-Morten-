"use client";

import { useState } from "react";
import { CardHeader } from "./CardShell";
import { FAZILESJEKK_ROWS, FAZILESJEKK_SAMMENDRAG, type FazilesjekkRow, type FazilesjekkStatus } from "@/lib/fazilesjekk";
import { formatKr } from "@/lib/widgets";
import { ClipboardCheck } from "lucide-react";

const STATUS_META: Record<FazilesjekkStatus, { label: string; text: string; bg: string }> = {
  ok: { label: "OK", text: "text-status-positive", bg: "bg-status-positive/12" },
  "delvis-ok": { label: "Delvis OK", text: "text-ink-3", bg: "bg-surface-3" },
  avvik: { label: "Avvik", text: "text-status-warning", bg: "bg-status-warning/12" },
  "finnes-ikke": { label: "Finnes ikke", text: "text-status-danger", bg: "bg-status-danger/12" },
  "kan-ikke-sjekkes": { label: "Kan ikke sjekkes", text: "text-ink-4", bg: "bg-surface-3" },
};

const AVVIKSTYPE_LABEL: Record<string, string> = {
  startdato: "Startdato",
  sluttdato: "Sluttdato",
  "mangler-sluttdato": "Mangler sluttdato",
  husleie: "Husleie",
  felleskostnader: "Felleskostnader",
  energi: "Energi",
  dobbeltregistrering: "Dobbeltregistrering",
  leiehull: "Leiehull",
  "areal-id": "Feil areal-ID",
  "mangler-belop-i-asana": "Mangler beløp i Asana",
};

function formatDato(iso?: string): string {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// Positivt beløp = underfakturert (Mustad taper), negativt = overfakturert.
// To ulike problemer, så de får ulik farge i stedet for å slås sammen til
// «avvik i kroner».
function PavirkningBelop({ kr }: { kr: number }) {
  const under = kr > 0;
  return (
    <span className={`text-sm font-semibold tabular-nums ${under ? "text-status-danger" : "text-status-warning"}`}>
      {under ? "−" : "+"}
      {formatKr(Math.abs(kr))}
      <span className="ml-1 text-2xs font-normal text-ink-4">{under ? "ikke fakturert" : "overfakturert"}</span>
    </span>
  );
}

function StatusChip({ status }: { status: FazilesjekkStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide ${meta.bg} ${meta.text}`}>
      {meta.label}
    </span>
  );
}

function SammenligningsRad({ label, asana, fazile, avvik }: { label: string; asana: string; fazile: string; avvik: boolean }) {
  if (asana === "–" && fazile === "–") return null;
  return (
    <div className="flex items-baseline gap-2 text-2xs">
      <span className="w-28 shrink-0 text-ink-4">{label}</span>
      <span className="w-32 shrink-0 tabular-nums text-ink-2">{asana}</span>
      <span className={`w-32 shrink-0 tabular-nums ${avvik ? "font-semibold text-status-warning" : "text-ink-2"}`}>{fazile}</span>
    </div>
  );
}

function KontraktRad({ row }: { row: FazilesjekkRow }) {
  const [open, setOpen] = useState(false);
  const datoAvvik = !!row.avvikstyper?.some((t) => t === "startdato" || t === "sluttdato" || t === "mangler-sluttdato");
  const husleieAvvik = !!row.avvikstyper?.includes("husleie") || !!row.avvikstyper?.includes("dobbeltregistrering");
  const fkAvvik = !!row.avvikstyper?.includes("felleskostnader");

  return (
    <li className="rounded-xl border border-line bg-surface-2">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-2 px-3 py-2.5 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 truncate text-sm font-medium text-ink-1">{row.leietaker}</p>
            <StatusChip status={row.status} />
          </div>
          {row.bygg && <p className="mt-0.5 truncate text-2xs text-ink-4">{row.bygg}</p>}
          {row.avvikstyper && row.avvikstyper.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {row.avvikstyper.map((t) => (
                <span key={t} className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] text-ink-3">
                  {AVVIKSTYPE_LABEL[t] ?? t}
                </span>
              ))}
            </div>
          )}
        </div>
        {row.belopspavirkning != null && <PavirkningBelop kr={row.belopspavirkning} />}
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-line px-3 py-2.5">
          <div className="flex items-baseline gap-2 text-[10px] font-semibold uppercase tracking-wide text-ink-4">
            <span className="w-28 shrink-0" />
            <span className="w-32 shrink-0">Asana</span>
            <span className="w-32 shrink-0">Fazile</span>
          </div>
          <SammenligningsRad label="Startdato" asana={formatDato(row.asanaStart)} fazile={formatDato(row.fazileStart)} avvik={datoAvvik} />
          <SammenligningsRad label="Sluttdato" asana={formatDato(row.asanaSlutt)} fazile={formatDato(row.fazileSlutt)} avvik={datoAvvik} />
          <SammenligningsRad
            label="Husleie"
            asana={row.asanaArsbelop != null ? formatKr(row.asanaArsbelop) : "–"}
            fazile={row.fazileHusleie != null ? formatKr(row.fazileHusleie) : "–"}
            avvik={husleieAvvik}
          />
          <SammenligningsRad
            label="Felleskostnader"
            asana={row.asanaFelleskost != null ? formatKr(row.asanaFelleskost) : "–"}
            fazile={row.fazileFelleskost != null ? formatKr(row.fazileFelleskost) : "–"}
            avvik={fkAvvik}
          />

          {row.kommentar && <p className="mt-1 text-xs leading-relaxed text-ink-2">{row.kommentar}</p>}

          {row.trappetrinn && (
            <div className="rounded-lg bg-surface-1 px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-4">Trappetrinnsleie</p>
              <p className="mt-0.5 text-2xs text-ink-2">{row.trappetrinn}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-4">
            {row.fazileKontraktsnokkel && <span>Fazile: {row.fazileKontraktsnokkel}</span>}
            {row.sfKontraktId && <span>SF: {row.sfKontraktId}</span>}
            {row.arealIdFazile && (
              <span className={row.arealIdVerifisert === "feil-bygg" ? "text-status-danger" : undefined}>
                Areal-ID {row.arealIdFazile}
                {row.arealIdVerifisert === "feil-bygg" ? " (feil bygg)" : row.arealIdVerifisert === "finnes-ikke" ? " (finnes ikke)" : ""}
              </span>
            )}
            {row.duplikatOppgaver != null && row.duplikatOppgaver > 1 && <span>{row.duplikatOppgaver} Asana-oppgaver</span>}
          </div>
        </div>
      )}
    </li>
  );
}

export default function FazilesjekkSection() {
  const s = FAZILESJEKK_SAMMENDRAG;
  const [visAlle, setVisAlle] = useState(false);

  // Sorter etter hvor mye det koster: underfakturering først (størst tap
  // øverst), deretter overfakturering, deretter resten.
  const rows = [...FAZILESJEKK_ROWS].sort((a, b) => {
    const av = a.belopspavirkning ?? 0;
    const bv = b.belopspavirkning ?? 0;
    if (av !== bv) return Math.abs(bv) - Math.abs(av);
    return a.leietaker.localeCompare(b.leietaker, "nb");
  });
  const synlige = visAlle ? rows : rows.filter((r) => r.belopspavirkning != null);

  const sumUnder = rows.reduce((sum, r) => sum + (r.belopspavirkning != null && r.belopspavirkning > 0 ? r.belopspavirkning : 0), 0);
  const sumOver = rows.reduce((sum, r) => sum + (r.belopspavirkning != null && r.belopspavirkning < 0 ? -r.belopspavirkning : 0), 0);

  return (
    <div className="border-t-2 border-t-sky-400/60 p-4">
      <CardHeader
        title="Fazilesjekk"
        subtitle={`${s.antallAvvik} avvik av ${s.unikeKontrakter}`}
        icon={ClipboardCheck}
        iconColorClass="text-sky-400"
      />

      <div className="flex flex-col gap-3">
        {/* Øyeblikksbilde, ikke live: dashboardet har ingen MCP-tilgang, så
            dataene må friskes opp ved å kjøre gjennomgangen på nytt i en
            Claude-økt. Datoen står derfor tydelig. */}
        <p className="text-2xs text-ink-4">
          Øyeblikksbilde {formatDato(s.kjortDato)} · kontraktsstart {formatDato(s.vinduFra)}–{formatDato(s.vinduTil)} · Asana «Signerte
          dokumenter» mot Fazile
        </p>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-status-danger/30 bg-status-danger/8 px-3 py-2.5">
            <p className="text-2xs font-semibold uppercase tracking-wide text-status-danger">Ikke fakturert</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink-1">{formatKr(sumUnder)}</p>
            <p className="text-2xs text-ink-4">per år</p>
          </div>
          <div className="rounded-xl border border-status-warning/30 bg-status-warning/8 px-3 py-2.5">
            <p className="text-2xs font-semibold uppercase tracking-wide text-status-warning">Overfakturert</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink-1">{formatKr(sumOver)}</p>
            <p className="text-2xs text-ink-4">per år</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-2xs text-ink-3">
          <span className="text-status-positive">{s.antallOk} OK</span>
          <span>{s.antallDelvisOk} delvis OK</span>
          <span className="text-status-warning">{s.antallAvvik} avvik</span>
          <span className="text-status-danger">{s.antallFinnesIkke} finnes ikke</span>
          <span className="text-ink-4">{s.antallKanIkkeSjekkes} kan ikke sjekkes</span>
        </div>

        {/* Areal-ID-funnet er en systemsvakhet, ikke et enkelt avvik — det
            hører derfor på toppen og ikke bare som en merkelapp per rad. */}
        {s.arealIdUtfylt > 0 && s.arealIdKorrekt === 0 && (
          <div className="rounded-xl border border-status-danger/30 bg-status-danger/8 px-3 py-2.5">
            <p className="text-2xs font-semibold uppercase tracking-wide text-status-danger">Areal-ID Fazile er ikke til å stole på</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">
              {s.arealIdUtfylt} kontrakter har feltet utfylt i Asana, og {s.arealIdKorrekt} av dem stemte. Feltet er en AI-gjetning —
              flere peker på helt andre bygg, og samme ID gjenbrukes på ulike leietakere. Kan ikke brukes som kobling mot Fazile.
            </p>
          </div>
        )}

        <div className="rounded-xl border border-line bg-surface-2/50 px-3 py-2.5">
          <p className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Trappetrinnsleie</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">
            {s.trappetrinnUtfylt} oppgaver har feltet utfylt, {s.trappetrinnMedReeltInnhold} med reelt innhold. Uttrekket er ujevnt i
            begge retninger — noen kontrakter har trinn i Fazile som Asana ikke fanget.
          </p>
        </div>

        <ul className="flex flex-col gap-1.5">
          {synlige.map((row) => (
            <KontraktRad key={`${row.leietaker}-${row.bygg ?? ""}`} row={row} />
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setVisAlle((v) => !v)}
          className="self-start text-xs font-medium text-accent hover:text-accent/80"
        >
          {visAlle ? "Vis bare de med beløpskonsekvens" : `Vis alle ${rows.length} avvik`}
        </button>

        <p className="text-2xs leading-relaxed text-ink-4">
          Datoavvik på tilleggs- og transportavtaler skyldes ofte at Asana henter signeringsdato fra PDF-en mens Fazile har
          virkningsdato. Bør stikkprøves mot avtaletekst før de leses som feil. {s.duplikatOppgaver} Asana-oppgaver deler
          Salesforce-ID med en annen.
        </p>
      </div>
    </div>
  );
}
