// src/engine/statEngine.test.ts
import { describe, it, expect } from "vitest";
import { tickStats, applyEffects, clamp } from "./statEngine";
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
    relationships: [
      { npcId: "npc_1", name: "Mum", relation: "mother", closeness: 80 },
    ],
    log: [],
    createdAt: "", updatedAt: "",
    ...overrides,
  };
}

describe("clamp", () => {
  it("clamps values within 0-100", () => {
    expect(clamp(150)).toBe(100);
    expect(clamp(-10)).toBe(0);
    expect(clamp(50)).toBe(50);
  });
});

describe("applyEffects", () => {
  // Review Focus #4: stat overflow at boundary
  it("does not let health exceed 100", () => {
    const char = makeChar({ stats: { happiness: 50, health: 100, smarts: 60, looks: 55 } });
    const result = applyEffects(char, { health: 20 });
    expect(result.stats.health).toBe(100);
  });

  it("does not let stats drop below 0", () => {
    const char = makeChar({ stats: { happiness: 5, health: 70, smarts: 60, looks: 55 } });
    const result = applyEffects(char, { happiness: -50 });
    expect(result.stats.happiness).toBe(0);
  });

  it("applies bank balance change", () => {
    const char = makeChar({ financials: { bankBalance: 1000, salary: 0, annualExpenses: 0, assets: [] } });
    const result = applyEffects(char, { bankBalance: -500 });
    expect(result.financials.bankBalance).toBe(500);
  });

  it("applies career performance change", () => {
    const char = makeChar();
    const result = applyEffects(char, { careerPerformance: 10 });
    expect(result.career.performance).toBe(60);
  });
});

describe("tickStats", () => {
  it("increments age by 1", () => {
    const char = makeChar({ age: 25 });
    const result = tickStats(char);
    expect(result.age).toBe(26);
  });

  it("applies health decay after age 40", () => {
    const char = makeChar({ age: 41, stats: { happiness: 50, health: 80, smarts: 60, looks: 55 } });
    const result = tickStats(char);
    expect(result.stats.health).toBe(79); // -1/yr after 40
  });

  it("applies increased health decay after age 60", () => {
    const char = makeChar({ age: 61, stats: { happiness: 50, health: 80, smarts: 60, looks: 55 } });
    const result = tickStats(char);
    expect(result.stats.health).toBe(78); // -2/yr after 60
  });

  it("applies drug habit health penalty", () => {
    const char = makeChar({
      age: 30,
      stats: { happiness: 50, health: 80, smarts: 60, looks: 55 },
      flags: { isEmployed: false, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: true, isStudent: false, inDebt: false, isTerminallyIll: false },
    });
    const result = tickStats(char);
    expect(result.stats.health).toBe(75); // -5/yr for drug habit
  });

  it("adds salary - expenses to bank balance", () => {
    const char = makeChar({ financials: { bankBalance: 0, salary: 50000, annualExpenses: 30000, assets: [] } });
    const result = tickStats(char);
    expect(result.financials.bankBalance).toBe(20000);
  });

  it("depreciates vehicle assets at 8%/yr", () => {
    const char = makeChar({ financials: { bankBalance: 10000, salary: 0, annualExpenses: 0, assets: [{ type: "car", name: "Honda", value: 10000, annualCost: 1000 }] } });
    const result = tickStats(char);
    expect(result.financials.assets[0].value).toBe(9200); // 10000 * 0.92
    expect(result.financials.bankBalance).toBe(9000);     // 10000 - 1000 annualCost
  });

  it("sets inDebt flag when bankBalance < 0", () => {
    const char = makeChar({ financials: { bankBalance: -100, salary: 0, annualExpenses: 50000, assets: [] } });
    const result = tickStats(char);
    expect(result.flags.inDebt).toBe(true);
  });

  // Controller ruling R5: inDebt requires 2+ consecutive negative years
  it("does NOT set inDebt on the first negative year coming from a positive balance", () => {
    const char = makeChar({ financials: { bankBalance: 1000, salary: 0, annualExpenses: 50000, assets: [] }, flags: { isEmployed: false, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: false, isStudent: false, inDebt: false, isTerminallyIll: false } });
    const result = tickStats(char);
    expect(result.financials.bankBalance).toBe(-49000);
    expect(result.flags.inDebt).toBe(false);
  });

  // Controller ruling R5: inDebt clears once the balance is back to >= 0
  it("clears inDebt when bankBalance returns to >= 0", () => {
    const char = makeChar({ financials: { bankBalance: -100, salary: 50000, annualExpenses: 0, assets: [] }, flags: { isEmployed: false, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: false, isStudent: false, inDebt: true, isTerminallyIll: false } });
    const result = tickStats(char);
    expect(result.financials.bankBalance).toBe(49900);
    expect(result.flags.inDebt).toBe(false);
  });

  it("decays relationship closeness by 2/yr", () => {
    const char = makeChar({ relationships: [{ npcId: "n1", name: "Mum", relation: "mother", closeness: 80 }] });
    const result = tickStats(char);
    expect(result.relationships[0].closeness).toBe(78);
  });

  it("removes estranged NPCs (closeness < 10)", () => {
    const char = makeChar({ relationships: [{ npcId: "n1", name: "Ex", relation: "friend", closeness: 9 }] });
    const result = tickStats(char);
    expect(result.relationships).toHaveLength(0);
  });

  // Review Focus #5: death at health boundary
  it("sets isAlive to false when health reaches 0", () => {
    const char = makeChar({ age: 76, stats: { happiness: 50, health: 1, smarts: 60, looks: 55 } });
    const result = tickStats(char);
    // age 76 → -3/yr health decay: 1 - 3 = -2, clamped to 0 → death
    expect(result.stats.health).toBe(0);
    expect(result.isAlive).toBe(false);
  });
});
