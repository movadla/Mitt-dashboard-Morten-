import { Redis } from "@upstash/redis";

// Lazy singleton: throwing only when Redis is actually used (not at import time)
// means the rest of app/api/chat/route.ts can still degrade gracefully if the
// KV database hasn't been provisioned yet, instead of crashing the whole module.
let client: Redis | null = null;

export function getRedis(): Redis {
  if (client) return client;
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    throw new Error(
      "KV_REST_API_URL/KV_REST_API_TOKEN er ikke satt. Opprett en Redis-database under Storage-fanen " +
        "på Vercel (Marketplace Database Providers → Redis), og legg de to variablene i .env.local lokalt.",
    );
  }
  client = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
  return client;
}
