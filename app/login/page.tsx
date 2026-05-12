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
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#07090f" }}>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 w-full max-w-xs px-6"
      >
        <p className="text-zinc-400 text-sm text-center tracking-widest uppercase">Dashboard</p>
        <input
          type="password"
          inputMode="numeric"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoFocus
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-100 text-center text-xl tracking-widest focus:outline-none focus:border-zinc-500"
        />
        {error && (
          <p className="text-red-400 text-xs text-center">Feil PIN, prøv igjen</p>
        )}
        <button
          type="submit"
          disabled={loading || pin.length === 0}
          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-100 rounded-lg py-3 text-sm transition-colors"
        >
          {loading ? "Sjekker…" : "Logg inn"}
        </button>
      </form>
    </div>
  );
}
