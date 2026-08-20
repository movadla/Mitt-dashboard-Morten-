"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CardHeader, ConfirmDialog, SkeletonRows, useConfirmDelete } from "./CardShell";
import type { LeasingManager } from "@/lib/leasingManagers";
import { TENANTS, type Tenant } from "@/lib/tenants";
import { COMPANY_INFO, EMPLOYEES, type CompanyInfoEntry } from "@/lib/companyInfo";
import { Users } from "lucide-react";

const MUSTAD_CATEGORY_LABEL: Record<CompanyInfoEntry["category"] | "ansatte", string> = {
  historie: "Historie",
  selskap: "Selskap",
  utvikling: "Utvikling",
  annet: "Annet",
  ansatte: "Ansatte",
};

function matchesCompanyInfo(entry: CompanyInfoEntry, q: string): boolean {
  return entry.title.toLowerCase().includes(q) || entry.body.toLowerCase().includes(q);
}

function matchesEmployee(e: { name: string; title: string | null; department: string | null }, q: string): boolean {
  return (
    e.name.toLowerCase().includes(q) ||
    (e.title ?? "").toLowerCase().includes(q) ||
    (e.department ?? "").toLowerCase().includes(q)
  );
}

function formatDateDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function matchesTenant(t: Tenant, query: string): boolean {
  const q = query.toLowerCase();
  return (
    t.kontonavn.toLowerCase().includes(q) ||
    (t.kundenummer ?? "").toLowerCase().includes(q) ||
    (t.orgnummer ?? "").toLowerCase().includes(q) ||
    (t.bygg ?? "").toLowerCase().includes(q)
  );
}

function TenantRow({ tenant }: { tenant: Tenant }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-line bg-surface-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left"
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
        <span className="min-w-0 flex-1 truncate text-sm text-ink-1">{tenant.kontonavn}</span>
        {tenant.bygg && <span className="shrink-0 text-2xs text-ink-4">{tenant.bygg}</span>}
      </button>
      {open && (
        <div className="border-t border-line px-3 py-2.5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-2xs text-ink-4">Kontonavn</dt>
            <dd className="text-ink-2">{tenant.kontonavn}</dd>
            <dt className="text-2xs text-ink-4">Kundenummer</dt>
            <dd className="text-ink-2">{tenant.kundenummer ?? "—"}</dd>
            <dt className="text-2xs text-ink-4">Org.nummer</dt>
            <dd className="text-ink-2">{tenant.orgnummer ?? "—"}</dd>
            <dt className="text-2xs text-ink-4">Bygg</dt>
            <dd className="text-ink-2">{tenant.bygg ?? "—"}</dd>
            <dt className="text-2xs text-ink-4">Kontoeier</dt>
            <dd className="text-ink-2">{tenant.kontoeier ?? "—"}</dd>
            <dt className="text-2xs text-ink-4">Adresse</dt>
            <dd className="text-ink-2">{tenant.adresse ?? "—"}</dd>
          </dl>

          {tenant.kontakter.length > 0 && (
            <div className="mt-3">
              <p className="text-2xs font-medium uppercase tracking-wider text-ink-4">Kontaktpersoner</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {tenant.kontakter.map((c, i) => (
                  <li key={i} className="text-sm text-ink-2">
                    {c.name}
                    {c.title && <span className="text-ink-4"> · {c.title}</span>}
                    {c.email && (
                      <>
                        {" · "}
                        <a href={`mailto:${c.email}`} className="text-accent hover:text-accent/80">
                          {c.email}
                        </a>
                      </>
                    )}
                    {c.phone && <span className="text-ink-4"> · {c.phone}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tenant.sisteSaker.length > 0 && (
            <div className="mt-3">
              <p className="text-2xs font-medium uppercase tracking-wider text-ink-4">Siste saker</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {tenant.sisteSaker.map((c) => (
                  <li key={c.caseNumber} className="text-sm text-ink-2">
                    {c.sfUrl ? (
                      <a href={c.sfUrl} target="_blank" rel="noreferrer" className="text-accent hover:text-accent/80">
                        {c.subject}
                      </a>
                    ) : (
                      c.subject
                    )}
                    <span className="text-ink-4">
                      {" "}
                      · {c.status} · {formatDateDMY(c.dato)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tenant.sfUrl && (
            <a
              href={tenant.sfUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-2xs font-medium text-accent hover:text-accent/80"
            >
              Åpne konto i Salesforce
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function ManagerForm({
  initial,
  onCancel,
  onSave,
}: {
  initial?: LeasingManager;
  onCancel: () => void;
  onSave: (input: { name: string; ansvar: string; email?: string }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [ansvar, setAnsvar] = useState(initial?.ansvar ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");

  function save() {
    if (!name.trim() || !ansvar.trim()) return;
    onSave({ name: name.trim(), ansvar: ansvar.trim(), email: email.trim() || undefined });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-2.5">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Navn"
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <input
        type="text"
        value={ansvar}
        onChange={(e) => setAnsvar(e.target.value)}
        placeholder="Ansvarsområde (f.eks. CC Vest)"
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="E-post (valgfritt)"
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-4 hover:text-ink-2">
          Avbryt
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!name.trim() || !ansvar.trim()}
          className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-2xs font-semibold uppercase text-surface-0 transition hover:bg-accent/85 disabled:opacity-40"
        >
          Lagre
        </button>
      </div>
    </div>
  );
}

function ManagerRow({
  manager,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
}: {
  manager: LeasingManager;
  editing: boolean;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, input: { name: string; ansvar: string; email?: string }) => void;
  onRemove: (manager: LeasingManager) => void;
}) {
  if (editing) {
    return <ManagerForm initial={manager} onCancel={onCancelEdit} onSave={(input) => onSaveEdit(manager.id, input)} />;
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
      <button type="button" onClick={() => onStartEdit(manager.id)} className="min-w-0 flex-1 text-left">
        <p className="text-sm font-medium text-ink-1">{manager.name}</p>
        <p className="mt-0.5 text-2xs text-ink-4">{manager.ansvar}</p>
      </button>
      {manager.email ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <a
            href={`mailto:${manager.email}`}
            className="rounded-lg border border-line px-2 py-1 text-2xs font-medium text-ink-2 transition hover:border-line-strong hover:text-ink-1"
          >
            E-post
          </a>
          <a
            href={`https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(manager.email)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-line px-2 py-1 text-2xs font-medium text-ink-2 transition hover:border-line-strong hover:text-ink-1"
          >
            Teams
          </a>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onStartEdit(manager.id)}
          className="shrink-0 text-2xs font-medium text-accent hover:text-accent/80"
        >
          + legg til e-post
        </button>
      )}
      <button
        type="button"
        onClick={() => onRemove(manager)}
        aria-label="Slett utleieansvarlig"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-ink-4 transition hover:bg-surface-3 hover:text-rose-400"
      >
        ×
      </button>
    </div>
  );
}

// Slått sammen fra tidligere "Utleieansvarlige" og "Leietakersøk" — begge er
// oppslag mot personer/kontoer Mustad har i Salesforce, og hører naturlig
// sammen som én "Oppslag"-fane i stedet for to separate.
export default function JobbLookupCard() {
  const [tenantQuery, setTenantQuery] = useState("");
  const [managers, setManagers] = useState<LeasingManager[]>([]);
  const [loadingManagers, setLoadingManagers] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const confirmDelete = useConfirmDelete<LeasingManager>();
  const [mustadQuery, setMustadQuery] = useState("");
  const [mustadCategory, setMustadCategory] = useState<CompanyInfoEntry["category"] | "ansatte" | "alle">("alle");

  const load = useCallback(() => {
    fetch("/api/leasing-managers")
      .then((r) => r.json())
      .then((d) => setManagers((d.managers ?? []) as LeasingManager[]))
      .finally(() => setLoadingManagers(false));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("mitt-dashboard:jobb-refresh", load);
    return () => window.removeEventListener("mitt-dashboard:jobb-refresh", load);
  }, [load]);

  const tenantResults = useMemo(() => {
    if (!tenantQuery.trim()) return [];
    return TENANTS.filter((t) => matchesTenant(t, tenantQuery.trim()));
  }, [tenantQuery]);

  const mustadQ = mustadQuery.trim().toLowerCase();
  const mustadInfoResults = COMPANY_INFO.filter(
    (e) => (mustadCategory === "alle" || mustadCategory === e.category) && (!mustadQ || matchesCompanyInfo(e, mustadQ)),
  );
  const showEmployees = mustadCategory === "ansatte" || (mustadCategory === "alle" && mustadQ.length > 0);
  const employeeResults = showEmployees ? EMPLOYEES.filter((e) => !mustadQ || matchesEmployee(e, mustadQ)) : [];

  async function handleAdd(input: { name: string; ansvar: string; email?: string }) {
    const res = await fetch("/api/leasing-managers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.ok) {
      const created: LeasingManager = await res.json();
      setManagers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setShowForm(false);
      window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
    }
  }

  async function handleSaveEdit(id: string, input: { name: string; ansvar: string; email?: string }) {
    const res = await fetch(`/api/leasing-managers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, email: input.email ?? null }),
    });
    if (res.ok) {
      const updated: LeasingManager = await res.json();
      setManagers((prev) => prev.map((m) => (m.id === id ? updated : m)).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingId(null);
      window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
    }
  }

  async function handleRemove(manager: LeasingManager) {
    setManagers((prev) => prev.filter((m) => m.id !== manager.id));
    await fetch(`/api/leasing-managers/${manager.id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("mitt-dashboard:jobb-refresh"));
  }

  return (
    <div className="border-t-2 border-t-violet-400/60 p-4">
      <CardHeader
        title="Oppslag"
        subtitle={`${TENANTS.length} leietakere · ${managers.length} utleieansvarlige · ${EMPLOYEES.length} ansatte`}
        onAdd={() => setShowForm(true)}
        addLabel="Ny utleieansvarlig"
        icon={Users}
        iconColorClass="text-violet-400"
      />

      <div className="flex flex-col gap-2">
        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Leietakersøk</p>
        <input
          type="text"
          value={tenantQuery}
          onChange={(e) => setTenantQuery(e.target.value)}
          placeholder="Søk på navn, kundenummer, org.nummer eller bygg..."
          className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        {!tenantQuery.trim() ? (
          <p className="text-sm text-ink-3">
            Skriv for å søke. Foreløpig er kun et utvalg leietakere lagt inn ({TENANTS.length} av 531 i Salesforce) —
            flere legges til etter behov.
          </p>
        ) : tenantResults.length === 0 ? (
          <p className="text-sm text-ink-3">
            Ingen treff blant de {TENANTS.length} leietakerne som er lagt inn foreløpig. Si ifra hvis denne leietakeren
            bør legges til.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {tenantResults.map((t) => (
              <TenantRow key={t.id} tenant={t} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4">
        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Utleieansvarlige</p>
        {loadingManagers ? (
          <SkeletonRows count={2} />
        ) : (
          <div className="flex flex-col gap-1.5">
            {managers.map((m) => (
              <ManagerRow
                key={m.id}
                manager={m}
                editing={editingId === m.id}
                onStartEdit={setEditingId}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={handleSaveEdit}
                onRemove={confirmDelete.request}
              />
            ))}
          </div>
        )}
        {showForm && <ManagerForm onCancel={() => setShowForm(false)} onSave={handleAdd} />}
      </div>

      <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4">
        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Mustad — oppslagsverk</p>
        <input
          type="text"
          value={mustadQuery}
          onChange={(e) => setMustadQuery(e.target.value)}
          placeholder="Søk i historie, selskap, utvikling eller ansatte..."
          className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
        />
        <div className="flex flex-wrap gap-1.5">
          {(["alle", "historie", "selskap", "utvikling", "ansatte"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setMustadCategory(c)}
              className={`rounded-full border px-2.5 py-1 text-2xs font-medium transition ${
                mustadCategory === c
                  ? "border-violet-400/60 bg-violet-400/15 text-violet-300"
                  : "border-line bg-surface-2 text-ink-3 hover:border-line-strong hover:text-ink-1"
              }`}
            >
              {c === "alle" ? "Alle" : MUSTAD_CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>

        {mustadInfoResults.length === 0 && employeeResults.length === 0 ? (
          <p className="text-sm text-ink-3">Ingen treff.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {mustadInfoResults.map((e) => (
              <div key={e.id} className="rounded-xl border border-line bg-surface-2 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-2xs text-ink-4">
                    {MUSTAD_CATEGORY_LABEL[e.category]}
                  </span>
                  <p className="text-sm font-medium text-ink-1">{e.title}</p>
                </div>
                <p className="mt-1 text-sm text-ink-2">{e.body}</p>
                {e.sourceRef && (
                  <p className="mt-1 text-2xs text-ink-4">
                    Kilde:{" "}
                    {/^https?:\/\//.test(e.sourceRef) ? (
                      <a href={e.sourceRef} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                        {e.sourceRef}
                      </a>
                    ) : (
                      e.sourceRef
                    )}
                  </p>
                )}
              </div>
            ))}
            {employeeResults.map((e) => (
              <div key={e.id} className="rounded-xl border border-line bg-surface-2 px-3 py-2">
                <p className="text-sm font-medium text-ink-1">{e.name}</p>
                <p className="mt-0.5 text-2xs text-ink-4">
                  {[e.title, e.department].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete.isOpen}
        message={`Slette ${confirmDelete.pending?.name ?? ""} fra utleieansvarlige?`}
        onCancel={confirmDelete.cancel}
        onConfirm={() => {
          if (confirmDelete.pending) handleRemove(confirmDelete.pending);
          confirmDelete.cancel();
        }}
      />
    </div>
  );
}
