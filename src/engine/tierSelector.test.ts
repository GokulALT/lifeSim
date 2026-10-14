import { describe, it, expect } from "vitest";
import { selectTier, weightedRandom, tierWeights } from "./tierSelector";
import type { Character } from "@/lib/schemas/character";

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    _id: "c1", userId: "u1", packId: "core_realistic",
    metadata: { firstName: "A", lastName: "B", birthCountry: "AU", birthCity: "Sydney", gender: "male", sexuality: "heterosexual" },
    age: 30, isAlive: true,
    stats: { happiness: 50, health: 70, smarts: 60, looks: 55 },
    hiddenStats: { karma: 50, fertility: 70, willpower: 60 },
    flags: { isEmployed: false, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: false, isStudent: false, inDebt: false, isTerminallyIll: false },
    financials: { bankBalance: 10000, salary: 50000, annualExpenses: 30000, assets: [] },
    career: { education: "bachelor", currentJob: null, employer: null, yearsInRole: 0, performance: 50, salaryGrade: "none" },
    relationships: [], log: [], createdAt: "", updatedAt: "",
    ...overrides,
  };
}

describe("weightedRandom", () => {
  it("always returns a key from the weights map", () => {
    const weights = { common: 65, uncommon: 25, rare: 10 };
    for (let i = 0; i < 50; i++) {
      const result = weightedRandom(weights);
      expect(["common", "uncommon", "rare"]).toContain(result);
    }
  });
});

describe("tierWeights", () => {
  it("applies spec modifiers deterministically", () => {
    expect(tierWeights(makeChar({ age: 15 }))).toEqual({ common: 75, uncommon: 15, rare: 10 });
    expect(tierWeights(makeChar({ age: 8 }))).toEqual({ common: 85, uncommon: 15, rare: 0 });
    expect(tierWeights(makeChar({ age: 60 }))).toEqual({ common: 60, uncommon: 25, rare: 15 });
  });
});

describe("selectTier", () => {
  it("returns a valid tier string", () => {
    const tier = selectTier(makeChar());
    expect(["common", "uncommon", "rare"]).toContain(tier);
  });

  it("never returns rare for children under 12", () => {
    const char = makeChar({ age: 8 });
    let rareCount = 0;
    for (let i = 0; i < 100; i++) {
      if (selectTier(char) === "rare") rareCount++;
    }
    expect(rareCount).toBe(0);
  });
});
