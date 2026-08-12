import "server-only";
import { Redis } from "ioredis";

// Databasen som faktisk ble opprettet under Vercel Storage-fanen endte opp som
// "Redis" (Redis Cloud/redis.io) og gir én vanlig tilkoblingsstreng (REDIS_URL),
// ikke Upstash sitt REST-API (url+token) som først var planlagt. ioredis snakker
// direkte med denne over TCP.
let client: Redis | null = null;

function getClient(): Redis {
  if (client) return client;
  if (!process.env.REDIS_URL) {
    throw new Error(
      "REDIS_URL er ikke satt. Opprett/koble en Redis-database under Storage-fanen på Vercel, " +
        "og legg REDIS_URL i .env.local lokalt.",
    );
  }
  client = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  client.on("error", () => {
    /* ignorer forbigående tilkoblingsfeil her — feiler heller på selve kommandoen */
  });
  return client;
}

export async function hsetJSON<T>(key: string, field: string, value: T): Promise<void> {
  await getClient().hset(key, field, JSON.stringify(value));
}

export async function hgetJSON<T>(key: string, field: string): Promise<T | null> {
  const raw = await getClient().hget(key, field);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function hgetallJSON<T>(key: string): Promise<Record<string, T>> {
  const raw = await getClient().hgetall(key);
  const result: Record<string, T> = {};
  for (const [field, value] of Object.entries(raw)) {
    try {
      result[field] = JSON.parse(value) as T;
    } catch {
      /* hopp over korrupt/ulesbar oppføring */
    }
  }
  return result;
}

export async function hdel(key: string, field: string): Promise<void> {
  await getClient().hdel(key, field);
}

// Atomisk flyttall-inkrement på et hash-felt — brukes for løpende kostnadstellere
// (AI-bruk) der flere samtidige requests ellers kunne overskrevet hverandre.
export async function hincrByFloat(key: string, field: string, amount: number): Promise<number> {
  const result = await getClient().hincrbyfloat(key, field, amount);
  return parseFloat(result);
}

// Enkel verdi med TTL — brukes til korttidscache (sport/FPL) som må overleve
// serverless cold starts på Vercel, i motsetning til et modul-nivå JS-objekt.
export async function setJSON<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  await getClient().set(key, JSON.stringify(value), "EX", ttlSeconds);
}

export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await getClient().get(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function del(key: string): Promise<void> {
  await getClient().del(key);
}
