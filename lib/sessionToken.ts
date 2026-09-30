// Delt ett sted slik at cookiens maxAge (satt ved innlogging) og tokenets egen utløpssjekk
// (håndhevet i middleware.ts og de CRON/VOICE-unntatte API-rutene) aldri kan drifte fra
// hverandre - 6 steder brukte tidligere samme tall som en løs kopiert konstant.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// v2 (2026-09-30): forsøkte først node:crypto (createHmac/timingSafeEqual) - feilet i praksis med
// "The edge runtime does not support Node.js 'crypto' module" fordi middleware.ts her fortsatt
// bruker den GAMLE, deprecated "Middleware"-filkonvensjonen (ikke den nye proxy.ts), som kjører
// på Edge runtime - Next 16 sin dokumenterte "Proxy kjører nå på Node.js-runtime"-endring gjelder
// altså kun proxy.ts-filnavnet, ikke det eksisterende middleware.ts-navnet i dette prosjektet.
// Web Crypto (globalThis.crypto.subtle) er derimot tilgjengelig BÅDE i Edge-middlewaren og i
// vanlige Node.js API-ruter (Node 19+) - én implementasjon som virker begge steder, i stedet for
// to separate kodeveier for samme logikk.
const encoder = new TextEncoder();

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

// Cookien inneholdt tidligere selve hemmeligheten (AUTH_SECRET/DELE_SECRET) i klartekst - en lekket
// cookie var da identisk med en lekket master-passord, gyldig helt til noen roterte hemmeligheten
// (og dermed logget alle andre ut også). Tokenet her er i stedet et signert, tidsstemplet derivat:
// hemmeligheten selv forlater aldri serveren, og en hemmelighet-rotasjon gjør automatisk ALLE
// utstedte tokens ugyldige (HMAC-en regnes ut på nytt med den nye hemmeligheten og matcher ikke
// gamle tokens) - uten at det trengs egen "revokert-liste"-logikk.
export async function signSessionToken(secret: string): Promise<string> {
  const issuedAt = String(Math.floor(Date.now() / 1000));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(issuedAt));
  return `${issuedAt}.${toHex(signature)}`;
}

// maxAgeSeconds speiler cookiens egen maxAge - tokenets EGEN utløpssjekk er det som faktisk
// håndheves her (uavhengig av om noen forsøker å forlenge en cookie manuelt), cookie-maxAge er
// kun nettleserens egen "slett automatisk"-rydding oppå dette.
export async function verifySessionToken(token: string | undefined | null, secret: string, maxAgeSeconds: number): Promise<boolean> {
  if (!token) return false;
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return false;
  const issuedAtRaw = token.slice(0, dotIndex);
  const givenHex = token.slice(dotIndex + 1);
  if (!/^\d+$/.test(issuedAtRaw)) return false;
  const givenSignature = fromHex(givenHex);
  if (!givenSignature) return false;

  const key = await importHmacKey(secret);
  // crypto.subtle.verify gjør selve byte-sammenligningen internt (spesifisert til å være trygg mot
  // timing-angrep av samme grunn som node:crypto sin timingSafeEqual) - ingen egen compare-logikk
  // trengs her.
  // givenSignature sin .buffer typebestemmes som ArrayBufferLike (kunne i teorien vært en
  // SharedArrayBuffer) - i praksis alltid en vanlig ArrayBuffer her siden fromHex allokerer den
  // selv, men TS sin BufferSource-type krever eksplisitt ArrayBuffer.
  const gyldigSignatur = await crypto.subtle.verify("HMAC", key, givenSignature.buffer as ArrayBuffer, encoder.encode(issuedAtRaw));
  if (!gyldigSignatur) return false;

  const issuedAt = Number(issuedAtRaw);
  const ageSeconds = Math.floor(Date.now() / 1000) - issuedAt;
  // ageSeconds < 0 ville bety et tidsstempel i fremtiden - kan ikke oppstå fra signSessionToken
  // (samme klokke utsteder og verifiserer), men avvises uansett i stedet for å anta at det er OK.
  return ageSeconds >= 0 && ageSeconds <= maxAgeSeconds;
}
