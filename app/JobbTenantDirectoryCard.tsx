"use client";

import { useMemo, useState } from "react";
import { CARD_SHELL, CardHeader, usePersistedCollapse } from "./CardShell";
import { TENANTS, type Tenant } from "@/lib/tenants";
import { Search } from "lucide-react";

function formatDateDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function matches(t: Tenant, query: string): boolean {
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

export default function JobbTenantDirectoryCard() {
  const [collapsed, toggleCollapsed] = usePersistedCollapse("Leietakersøk", true);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return TENANTS.filter((t) => matches(t, query.trim()));
  }, [query]);

  return (
    <div className={`${CARD_SHELL} border-t-2 border-t-sky-400/60 p-4`}>
      <CardHeader
        title="Leietakersøk"
        subtitle={`${TENANTS.length} leietakere lagt inn`}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        icon={Search}
        iconColorClass="text-sky-400"
      />
      {!collapsed && (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søk på navn, kundenummer, org.nummer eller bygg..."
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
          />
          {!query.trim() ? (
            <p className="text-sm text-ink-3">
              Skriv for å søke. Foreløpig er kun et utvalg leietakere lagt inn ({TENANTS.length} av 531 i Salesforce) —
              flere legges til etter behov.
            </p>
          ) : results.length === 0 ? (
            <p className="text-sm text-ink-3">
              Ingen treff blant de {TENANTS.length} leietakerne som er lagt inn foreløpig. Si ifra hvis denne leietakeren
              bør legges til.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {results.map((t) => (
                <TenantRow key={t.id} tenant={t} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
