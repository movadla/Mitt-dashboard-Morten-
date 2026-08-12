import "server-only";
import { hgetJSON, hgetallJSON, hincrByFloat, hsetJSON } from "./kv";
import { addDaysIso, localDateString } from "./payday";

// Priser for claude-haiku-4-5 (USD per million tokens), platform.claude.com/docs/en/about-claude/pricing
// (aug 2026). Egen sporing siden en vanlig API-nøkkel ikke gir tilgang til Anthropics
// Usage/Cost-API (krever en Admin-nøkkel) eller ekte gjenstående saldo i det hele tatt —
// saldoen under er derfor et anslag brukeren selv oppdaterer etter å ha sjekket
// console.anthropic.com, ikke et live tall hentet fra Anthropic.
const PRICE_INPUT_PER_MTOK = 1;
const PRICE_CACHE_WRITE_5M_PER_MTOK = 1.25;
const PRICE_CACHE_WRITE_1H_PER_MTOK = 2;
const PRICE_CACHE_READ_PER_MTOK = 0.1;
const PRICE_OUTPUT_PER_MTOK = 5;

export const DAILY_ALERT_USD = 5;
export const MONTHLY_ALERT_USD = 30;

const DAILY_COST_HASH_KEY = "ai:usage:daily-cost-usd";
const BALANCE_HASH_KEY = "ai:usage:balance";
const BALANCE_FIELD = "usd";

export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
  cache_read_input_tokens?: number | null;
}

export function computeCostUsd(usage: UsageLike): number {
  const cache5m = usage.cache_creation?.ephemeral_5m_input_tokens ?? 0;
  const cache1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  return (
    (usage.input_tokens * PRICE_INPUT_PER_MTOK +
      cache5m * PRICE_CACHE_WRITE_5M_PER_MTOK +
      cache1h * PRICE_CACHE_WRITE_1H_PER_MTOK +
      cacheRead * PRICE_CACHE_READ_PER_MTOK +
      usage.output_tokens * PRICE_OUTPUT_PER_MTOK) /
    1_000_000
  );
}

export async function recordUsage(usage: UsageLike): Promise<void> {
  const cost = computeCostUsd(usage);
  if (cost <= 0) return;
  await hincrByFloat(DAILY_COST_HASH_KEY, localDateString(), cost);

  const balance = await getBalance();
  if (balance !== null) {
    await hincrByFloat(BALANCE_HASH_KEY, BALANCE_FIELD, -cost);
  }
}

export async function getBalance(): Promise<number | null> {
  return hgetJSON<number>(BALANCE_HASH_KEY, BALANCE_FIELD);
}

export async function setBalance(amountUsd: number): Promise<void> {
  await hsetJSON(BALANCE_HASH_KEY, BALANCE_FIELD, amountUsd);
}

export interface AiUsageSummary {
  last24hUsd: number;
  last30daysUsd: number;
  balanceUsd: number | null;
  dailyAlertUsd: number;
  monthlyAlertUsd: number;
  overDaily: boolean;
  overMonthly: boolean;
}

export async function getAiUsageSummary(): Promise<AiUsageSummary> {
  const [daily, balance] = await Promise.all([hgetallJSON<number>(DAILY_COST_HASH_KEY), getBalance()]);
  const today = localDateString();
  const last24hUsd = daily[today] ?? 0;

  let last30daysUsd = 0;
  for (let i = 0; i < 30; i++) {
    last30daysUsd += daily[addDaysIso(today, -i)] ?? 0;
  }

  return {
    last24hUsd,
    last30daysUsd,
    balanceUsd: balance,
    dailyAlertUsd: DAILY_ALERT_USD,
    monthlyAlertUsd: MONTHLY_ALERT_USD,
    overDaily: last24hUsd > DAILY_ALERT_USD,
    overMonthly: last30daysUsd > MONTHLY_ALERT_USD,
  };
}
