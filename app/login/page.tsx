"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
    <div className="min-h-screen flex items-center justify-center bg-surface-0">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 w-full max-w-xs px-6"
      >
        <p className="text-ink-3 text-sm text-center tracking-widest uppercase">Dashboard</p>
        <input
          type="password"
          inputMode="numeric"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoFocus
          className="bg-surface-1 border border-line rounded-xl px-4 py-3 text-ink-1 font-mono text-center text-xl tracking-widest focus:outline-none focus:border-line-strong"
        />
        {error && (
          <p className="text-status-danger text-xs text-center">Feil PIN, prøv igjen</p>
        )}
        <button
          type="submit"
          disabled={loading || pin.length === 0}
          className="bg-surface-2 hover:bg-surface-3 disabled:opacity-40 text-ink-1 rounded-xl py-3 text-sm font-medium transition-colors"
        >
          {loading ? "Sjekker…" : "Logg inn"}
        </button>
      </form>
    </div>
  );
}
