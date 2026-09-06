import "server-only";
import { hgetallJSON, hsetJSON, hdel } from "./kv";

// Web push-abonnementer, ett per enhet/nettleser. Lagres i Redis fordi
// avsenderen er en Vercel-cron som kjører uten noen brukersesjon — den må
// kunne finne mottakerne på egen hånd.
export interface StoredPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  // Når abonnementet ble registrert. Brukes kun til feilsøking ("virker det
  // fortsatt fra telefonen jeg satte opp i september?").
  registrertAt: string;
}

const HASH_KEY = "push:subscriptions";

// Endepunkts-URL-en er unik per enhet og er derfor en naturlig nøkkel, men
// den er for lang og inneholder tegn som gjør den upraktisk som Redis-felt.
// En kort, stabil hash av den holder.
function fieldFor(endpoint: string): string {
  let h = 0;
  for (let i = 0; i < endpoint.length; i++) {
    h = (Math.imul(31, h) + endpoint.charCodeAt(i)) | 0;
  }
  return `s${(h >>> 0).toString(36)}`;
}

export async function saveSubscription(sub: Omit<StoredPushSubscription, "registrertAt">): Promise<void> {
  await hsetJSON(HASH_KEY, fieldFor(sub.endpoint), {
    ...sub,
    registrertAt: new Date().toISOString(),
  } satisfies StoredPushSubscription);
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await hdel(HASH_KEY, fieldFor(endpoint));
}

export async function getSubscriptions(): Promise<StoredPushSubscription[]> {
  const map = await hgetallJSON<StoredPushSubscription>(HASH_KEY);
  return Object.values(map);
}
