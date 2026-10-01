import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));
vi.mock("./aiUsage", () => ({ recordUsage: vi.fn() }));

const { generateRyggCoachNote } = await import("./ryggCoach");

const BASE_INPUT = {
  week: 2,
  decision: "progress" as const,
  decisionReason: "Smertesnittet gikk ned - stabilt nok til å øke belastningen.",
  painAvg: 5.7,
  priorWeekPainAvg: 6.2,
  rpeAvg: 6,
  sessionsCompleted: 3,
  exerciseRpeByExercise: {},
  exerciseQualityByExercise: {},
  userNotes: [],
};

describe("generateRyggCoachNote", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    mockCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("returnerer null uten API-nøkkel, og kaller aldri Anthropic", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await generateRyggCoachNote(BASE_INPUT);
    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returnerer trimmet tekst ved et vellykket kall", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "  Bra jobbet denne uka!  " }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const result = await generateRyggCoachNote(BASE_INPUT);
    expect(result).toBe("Bra jobbet denne uka!");
  });

  it("returnerer null ved tomt svar (ingen tekstblokker)", async () => {
    mockCreate.mockResolvedValue({ content: [], usage: { input_tokens: 10, output_tokens: 0 } });
    const result = await generateRyggCoachNote(BASE_INPUT);
    expect(result).toBeNull();
  });

  it("returnerer null ved tomt-streng-svar", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "   " }], usage: { input_tokens: 10, output_tokens: 1 } });
    const result = await generateRyggCoachNote(BASE_INPUT);
    expect(result).toBeNull();
  });

  it("returnerer null ved nettverksfeil/API-feil - kaster aldri videre", async () => {
    mockCreate.mockRejectedValue(new Error("network down"));
    await expect(generateRyggCoachNote(BASE_INPUT)).resolves.toBeNull();
  });

  it("returnerer null ved tidsavbrudd (samme feilvei som andre API-feil)", async () => {
    mockCreate.mockRejectedValue(new Error("timeout"));
    await expect(generateRyggCoachNote(BASE_INPUT)).resolves.toBeNull();
  });

  it("kapper svært lang tekst til maks lagret lengde", async () => {
    const long = "x".repeat(1000);
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: long }], usage: { input_tokens: 10, output_tokens: 200 } });
    const result = await generateRyggCoachNote(BASE_INPUT);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(600);
  });
});
