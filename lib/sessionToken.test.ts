import { describe, it, expect, afterEach, vi } from "vitest";
import { signSessionToken, verifySessionToken } from "./sessionToken";

const SECRET = "test-hemmelighet-123";
const MAX_AGE = 60 * 60 * 24 * 30;

afterEach(() => {
  vi.useRealTimers();
});

describe("signSessionToken / verifySessionToken", () => {
  it("godtar et ferskt, riktig signert token (normalflyt)", async () => {
    const token = await signSessionToken(SECRET);
    expect(await verifySessionToken(token, SECRET, MAX_AGE)).toBe(true);
  });

  it("avviser manglende token", async () => {
    expect(await verifySessionToken(undefined, SECRET, MAX_AGE)).toBe(false);
    expect(await verifySessionToken(null, SECRET, MAX_AGE)).toBe(false);
    expect(await verifySessionToken("", SECRET, MAX_AGE)).toBe(false);
  });

  it("avviser feilformatert token (mangler separator, ugyldig tidsstempel, tom/ugyldig hash)", async () => {
    expect(await verifySessionToken("ikke-et-gyldig-token", SECRET, MAX_AGE)).toBe(false);
    expect(await verifySessionToken("abc.deadbeef", SECRET, MAX_AGE)).toBe(false);
    expect(await verifySessionToken("12345.", SECRET, MAX_AGE)).toBe(false);
    expect(await verifySessionToken(".deadbeef", SECRET, MAX_AGE)).toBe(false);
    expect(await verifySessionToken("12345.ikkehex!!", SECRET, MAX_AGE)).toBe(false);
    expect(await verifySessionToken("12345.abc", SECRET, MAX_AGE)).toBe(false); // oddetalls hex-lengde
  });

  it("avviser token signert med en annen hemmelighet (feil PIN/rotert hemmelighet)", async () => {
    const token = await signSessionToken("en-annen-hemmelighet");
    expect(await verifySessionToken(token, SECRET, MAX_AGE)).toBe(false);
  });

  it("avviser token med manipulert (men gyldig hex) hash-felt", async () => {
    const token = await signSessionToken(SECRET);
    const dot = token.indexOf(".");
    const tuklet = token.slice(0, dot + 1) + "0".repeat(token.length - dot - 1);
    expect(await verifySessionToken(tuklet, SECRET, MAX_AGE)).toBe(false);
  });

  it("godtar et token rett under utløpsgrensen, avviser rett over (tidsavbrudd)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = await signSessionToken(SECRET);

    vi.setSystemTime(new Date(new Date("2026-01-01T00:00:00Z").getTime() + (MAX_AGE - 1) * 1000));
    expect(await verifySessionToken(token, SECRET, MAX_AGE)).toBe(true);

    vi.setSystemTime(new Date(new Date("2026-01-01T00:00:00Z").getTime() + (MAX_AGE + 1) * 1000));
    expect(await verifySessionToken(token, SECRET, MAX_AGE)).toBe(false);
  });

  it("avviser et token med tidsstempel i fremtiden (skulle aldri kunne oppstå, men skal ikke stole blindt på det)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
    const fremtidigToken = await signSessionToken(SECRET);
    vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));
    expect(await verifySessionToken(fremtidigToken, SECRET, MAX_AGE)).toBe(false);
  });
});
