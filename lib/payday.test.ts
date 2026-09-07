import { describe, it, expect, afterEach, vi } from "vitest";
import { addDaysIso, localDateString, nextPaydayFrom, toOsloDateString, weekRangeContaining } from "./payday";

// Dato-hjelperne er bevisst rene kalenderdag-funksjoner i UTC (se kommentarene i lib/payday.ts):
// månedsskift, årsskift, skuddår og sommertid/vintertid skal IKKE kunne flytte en dato med én dag.
// Det er nettopp de tilfellene som testes her — pluss Oslo-tidssonen i toOsloDateString, som er
// den ENE funksjonen som med vilje ikke er UTC.

describe("addDaysIso", () => {
  it("legger til dager innenfor samme måned", () => {
    expect(addDaysIso("2026-09-07", 3)).toBe("2026-09-10");
  });

  it("krysser månedsskifte fremover", () => {
    expect(addDaysIso("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("krysser månedsskifte bakover med negativt antall", () => {
    expect(addDaysIso("2026-10-01", -1)).toBe("2026-09-30");
  });

  it("krysser årsskifte fremover", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("krysser årsskifte bakover", () => {
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("håndterer skuddår: 2028-02-28 + 1 = 2028-02-29", () => {
    expect(addDaysIso("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("håndterer ikke-skuddår: 2026-02-28 + 1 = 2026-03-01", () => {
    expect(addDaysIso("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("flytter ikke datoen ved overgang til sommertid i Norge (2026-03-29)", () => {
    // Sommertid starter natt til 29. mars 2026. Ren UTC-aritmetikk skal ikke bry seg.
    expect(addDaysIso("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDaysIso("2026-03-29", 1)).toBe("2026-03-30");
  });

  it("flytter ikke datoen ved overgang til vintertid i Norge (2026-10-25)", () => {
    expect(addDaysIso("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDaysIso("2026-10-25", 1)).toBe("2026-10-26");
  });

  it("er identitet for n = 0", () => {
    expect(addDaysIso("2026-09-07", 0)).toBe("2026-09-07");
  });

  it("legger til 365 dager over et helt år", () => {
    expect(addDaysIso("2026-01-01", 365)).toBe("2027-01-01");
  });
});

describe("weekRangeContaining", () => {
  it("gir mandag-søndag for en onsdag (2026-09-09)", () => {
    expect(weekRangeContaining("2026-09-09")).toEqual({ start: "2026-09-07", end: "2026-09-13" });
  });

  it("lar mandagen være sin egen ukestart", () => {
    expect(weekRangeContaining("2026-09-07")).toEqual({ start: "2026-09-07", end: "2026-09-13" });
  });

  it("legger søndagen i uken som startet mandagen før (ikke i neste uke)", () => {
    expect(weekRangeContaining("2026-09-13")).toEqual({ start: "2026-09-07", end: "2026-09-13" });
  });

  it("krysser månedsskifte: 2026-10-01 (torsdag) hører til uken fra 2026-09-28", () => {
    expect(weekRangeContaining("2026-10-01")).toEqual({ start: "2026-09-28", end: "2026-10-04" });
  });

  it("krysser årsskifte: 2027-01-01 (fredag) hører til uken fra 2026-12-28", () => {
    expect(weekRangeContaining("2027-01-01")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
  });

  it("gir alltid nøyaktig 7 dager (start + 6 = end)", () => {
    for (const dato of ["2026-01-01", "2026-02-28", "2026-03-29", "2026-10-25", "2026-12-31", "2028-02-29"]) {
      const { start, end } = weekRangeContaining(dato);
      expect(addDaysIso(start, 6), dato).toBe(end);
    }
  });

  it("gir samme ukeintervall for alle sju dagene i uken", () => {
    const forventet = { start: "2026-09-07", end: "2026-09-13" };
    for (let i = 0; i < 7; i++) {
      expect(weekRangeContaining(addDaysIso("2026-09-07", i))).toEqual(forventet);
    }
  });
});

describe("toOsloDateString", () => {
  it("gir YYYY-MM-DD-format", () => {
    expect(toOsloDateString(new Date("2026-09-07T10:00:00Z"))).toBe("2026-09-07");
  });

  it("bruker Oslo-datoen, ikke UTC-datoen, rett etter midnatt norsk tid (vintertid, UTC+1)", () => {
    // 2026-01-05 23:30 UTC = 2026-01-06 00:30 i Oslo.
    expect(toOsloDateString(new Date("2026-01-05T23:30:00Z"))).toBe("2026-01-06");
  });

  it("bruker Oslo-datoen rett etter midnatt norsk tid (sommertid, UTC+2)", () => {
    // 2026-06-30 22:30 UTC = 2026-07-01 00:30 i Oslo — månedsskifte, ikke bare dagsskifte.
    expect(toOsloDateString(new Date("2026-06-30T22:30:00Z"))).toBe("2026-07-01");
  });

  it("krysser årsskiftet riktig (2026-12-31 23:30 UTC er 2027-01-01 i Oslo)", () => {
    expect(toOsloDateString(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });

  it("holder seg på UTC-dagen før når Oslo ennå ikke har passert midnatt", () => {
    expect(toOsloDateString(new Date("2026-01-05T22:30:00Z"))).toBe("2026-01-05");
  });
});

describe("localDateString", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gir Oslo-datoen for nåtidspunktet", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T09:00:00Z"));
    expect(localDateString()).toBe("2026-09-07");
  });

  it("gir morgendagens dato når klokka er 00:30 i Oslo men UTC fortsatt er i går", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T22:30:00Z")); // 2026-09-08 00:30 i Oslo
    expect(localDateString()).toBe("2026-09-08");
  });

  it("er alltid lik toOsloDateString(new Date())", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T00:30:00Z")); // sommertidsovergangen
    expect(localDateString()).toBe(toOsloDateString(new Date()));
  });
});

describe("nextPaydayFrom", () => {
  it("gir den 20. i inneværende måned når datoen er før lønningsdag", () => {
    expect(nextPaydayFrom("2026-09-07")).toBe("2026-09-18"); // 20. sept 2026 er en søndag
  });

  it("flytter lønningsdag som faller på søndag til fredagen før", () => {
    expect(nextPaydayFrom("2026-09-01")).toBe("2026-09-18");
  });

  it("flytter lønningsdag som faller på lørdag til fredagen før", () => {
    expect(nextPaydayFrom("2026-06-01")).toBe("2026-06-19"); // 20. juni 2026 er en lørdag
  });

  it("beholder lønningsdag på en hverdag", () => {
    expect(nextPaydayFrom("2026-10-01")).toBe("2026-10-20"); // tirsdag
  });

  it("bruker den 15. i desember, ikke den 20.", () => {
    expect(nextPaydayFrom("2026-12-01")).toBe("2026-12-15");
  });

  it("hopper til januar året etter når desember-lønningsdagen er passert", () => {
    expect(nextPaydayFrom("2026-12-16")).toBe("2027-01-20");
  });

  it("regner selve lønningsdagen som neste lønningsdag", () => {
    expect(nextPaydayFrom("2026-10-20")).toBe("2026-10-20");
  });
});
