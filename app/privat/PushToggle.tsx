"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

// base64url → Uint8Array. PushManager.subscribe krever nøkkelen som binærdata,
// mens VAPID-nøkkelen distribueres som base64url-streng.
// Returtypen er bevisst Uint8Array<ArrayBuffer> og ikke bare Uint8Array:
// applicationServerKey krever en buffer som IKKE kan være en SharedArrayBuffer,
// og en naken `new Uint8Array(n)` har den videre ArrayBufferLike-typen.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "ukjent" | "utilgjengelig" | "av" | "på" | "nektet" | "jobber";

/** Slår morgenbriefen av og på for DENNE enheten.
 *
 *  På iPhone virker web push kun når appen er lagt til på hjem-skjermen og
 *  åpnes derfra (iOS 16.4+). I Safari-fanen finnes ikke PushManager i det
 *  hele tatt — da vises en forklaring i stedet for en knapp som ikke kan
 *  virke. */
export default function PushToggle() {
  const [state, setState] = useState<State>("ukjent");
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setState("utilgjengelig");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("nektet");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (!cancelled) setState(existing ? "på" : "av");
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!publicKey) return;
    setState("jobber");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "nektet" : "av");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      setState("på");
    } catch {
      setState("av");
    }
  }

  async function disable() {
    setState("jobber");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("av");
    } catch {
      setState("på");
    }
  }

  // Uten en konfigurert VAPID-nøkkel kan ingenting av dette virke — da er en
  // knapp bare en felle. Se app/api/cron/morning-brief/route.ts.
  if (!publicKey || state === "ukjent" || state === "utilgjengelig") return null;

  if (state === "nektet") {
    return (
      <p className="text-2xs text-ink-4">
        Varsler er blokkert for denne appen. Skru dem på igjen i telefonens innstillinger for å få morgenbriefen.
      </p>
    );
  }

  const on = state === "på";
  return (
    <button
      type="button"
      onClick={on ? disable : enable}
      disabled={state === "jobber"}
      className={`flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-2xs font-semibold transition disabled:opacity-60 ${
        on
          ? "bg-accent-privat/12 text-accent-privat hover:bg-accent-privat/20"
          : "border border-line text-ink-3 hover:border-line-strong hover:text-ink-1"
      }`}
    >
      {on ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
      {state === "jobber" ? "Vent…" : on ? "Morgenbrief på" : "Slå på morgenbrief"}
    </button>
  );
}
