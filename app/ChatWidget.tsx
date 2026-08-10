"use client";

import { useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      const reply = res.ok
        ? data.text
        : `Feil: ${data.error ?? "Noe gikk galt"}`;
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Fikk ikke kontakt med serveren. Prøv igjen." },
      ]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Lukk assistent" : "Åpne assistent"}
        className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full border border-line-strong bg-accent text-white shadow-md shadow-black/15 transition hover:bg-accent/85"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16v11a1 1 0 01-1 1H9l-4 4V5a1 1 0 011-1z" />
        </svg>
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-40 flex h-[70vh] w-[min(92vw,380px)] flex-col rounded-2xl border border-line bg-surface-1 shadow-2xl shadow-black/25">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink-1">Assistent</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Lukk"
              className="text-ink-3 hover:text-ink-1"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <p className="text-xs leading-relaxed text-ink-3">
                Spør om nøkkeltallene i dashboardet (foreløpig testdata). Kalender og mail kommer i en senere fase.
              </p>
            )}
            <div className="flex flex-col gap-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "ml-auto bg-accent/15 text-ink-1"
                      : "bg-surface-2 text-ink-2"
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {loading && (
                <div className="max-w-[85%] rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-3">
                  Skriver…
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-line p-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder="Spør om noe..."
              className="flex-1 rounded-full border border-line bg-surface-2 px-3.5 py-2 text-sm text-ink-1 placeholder-ink-4 outline-none focus:border-line-strong"
            />
            <button
              type="button"
              onClick={send}
              disabled={loading || !input.trim()}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-white transition hover:bg-accent/85 disabled:opacity-40"
              aria-label="Send"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 8h12M9 4l5 4-5 4" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
