import { describe, expect, it } from "vitest";
import { collectExerciseValues, collectUserNotes } from "./ryggWeekCycle";
import type { RyggDailyLog, RyggSessionLog } from "./ryggLog";

function session(overrides: Partial<RyggSessionLog>): RyggSessionLog {
  return {
    id: "id",
    date: "2026-10-01",
    week: 1,
    sessionNo: 1,
    completed: true,
    rpe: 5,
    aggravated: false,
    ...overrides,
  };
}

function daily(overrides: Partial<RyggDailyLog>): RyggDailyLog {
  return {
    date: "2026-10-01",
    pain: 5,
    radiating: false,
    walked: true,
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("collectExerciseValues", () => {
  it("slår sammen verdier fra flere økter for samme øvelse", () => {
    const sessions = [
      session({ id: "a", exerciseRpe: { birddog: 5, curlup: 9 } }),
      session({ id: "b", exerciseRpe: { birddog: 6 } }),
    ];
    expect(collectExerciseValues(sessions, "exerciseRpe")).toEqual({ birddog: [5, 6], curlup: [9] });
  });

  it("hopper over IKKE-fullførte økter", () => {
    const sessions = [session({ completed: false, exerciseRpe: { birddog: 9 } })];
    expect(collectExerciseValues(sessions, "exerciseRpe")).toEqual({});
  });

  it("håndterer økter uten feltet i det hele tatt (gamle logger)", () => {
    const sessions = [session({ exerciseRpe: undefined })];
    expect(collectExerciseValues(sessions, "exerciseRpe")).toEqual({});
  });

  it("leser exerciseQuality uavhengig av exerciseRpe", () => {
    const sessions = [session({ exerciseRpe: { birddog: 9 }, exerciseQuality: { birddog: 2 } })];
    expect(collectExerciseValues(sessions, "exerciseQuality")).toEqual({ birddog: [2] });
  });

  it("returnerer tomt objekt for en tom liste", () => {
    expect(collectExerciseValues([], "exerciseRpe")).toEqual({});
  });
});

describe("collectUserNotes", () => {
  it("kombinerer notater fra smertelogg og øktlogg", () => {
    const result = collectUserNotes(
      [daily({ date: "2026-10-01", note: "Stiv om morgenen" })],
      [session({ date: "2026-10-02", note: "Curl-up kjentes bedre" })],
    );
    expect(result).toEqual(["2026-10-01: Stiv om morgenen", "2026-10-02: Curl-up kjentes bedre"]);
  });

  it("utelater rader uten notat", () => {
    const result = collectUserNotes([daily({ note: undefined })], [session({ note: undefined })]);
    expect(result).toEqual([]);
  });

  it("returnerer tom liste når ingenting er logget", () => {
    expect(collectUserNotes([], [])).toEqual([]);
  });
});
