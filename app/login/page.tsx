"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock } from "lucide-react";
import { CARD_SHELL } from "../CardShell";

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      router.push("/");
    } else {
      setError(true);
      setPin("");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 px-6">
      {/* Eneste flate i appen som tidligere ikke brukte CARD_SHELL (elevasjon/kant) eller
          appens rounded-2xl-standard (var rounded-xl) - hver seksjon ellers har en
          fargechip+ikon via CardHeader, mens denne siden var en bar <form> uten noen
          identitet (2026-09-07). text-ink-1 (ikke en fane-farge): siden er felles for
          Privat og Jobb, ikke tilhørende noen av dem. */}
      <form
        onSubmit={handleSubmit}
        className={`${CARD_SHELL} flex w-full max-w-xs flex-col items-center gap-4 px-6 py-8`}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink-1/10">
          <Lock className="h-5 w-5 text-ink-1" />
        </span>
        <p className="text-ink-3 text-sm text-center tracking-widest uppercase">Dashboard</p>
        <input
          type="password"
          inputMode="numeric"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoFocus
          className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3 text-ink-1 font-mono text-center text-xl tracking-widest focus:outline-none focus:border-line-strong"
        />
        {error && (
          <p className="text-status-danger text-xs text-center">Feil PIN, prøv igjen</p>
        )}
        <button
          type="submit"
          disabled={loading || pin.length === 0}
          className="w-full bg-surface-2 hover:bg-surface-3 disabled:opacity-40 text-ink-1 rounded-2xl py-3 text-sm font-medium transition-colors"
        >
          {loading ? "Sjekker…" : "Logg inn"}
        </button>
      </form>
    </div>
  );
}
