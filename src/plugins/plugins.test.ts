import { describe, it, expect } from "vitest";
import { PLUGINS } from "./index";
import type { Character } from "@/lib/schemas/character";

const mockChar: Character = {
  _id: "c1", userId: "u1", packId: "core_realistic",
  metadata: { firstName: "Test", lastName: "User", birthCountry: "AU", birthCity: "Sydney", gender: "male", sexuality: "heterosexual" },
  age: 30, isAlive: true,
  stats: { happiness: 50, health: 70, smarts: 60, looks: 55 },
  hiddenStats: { karma: 50, fertility: 70, willpower: 60 },
  flags: { isEmployed: true, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: false, isStudent: false, inDebt: false, isTerminallyIll: false },
  financials: { bankBalance: 20000, salary: 60000, annualExpenses: 30000, assets: [] },
  career: { education: "bachelor", currentJob: "Developer", employer: "Corp", yearsInRole: 3, performance: 70, salaryGrade: "mid" },
  relationships: [], log: [],
  createdAt: "", updatedAt: "",
};

describe("PLUGINS registry", () => {
  it("contains core_realistic", () => {
    expect(PLUGINS["core_realistic"]).toBeDefined();
  });

  it("core_realistic has no extraStats", () => {
    expect(PLUGINS["core_realistic"].extraStats).toHaveLength(0);
  });

  it("core_realistic buildAiBiasInstruction returns a non-empty string", () => {
    const bias = PLUGINS["core_realistic"].buildAiBiasInstruction(mockChar);
    expect(typeof bias).toBe("string");
    expect(bias.length).toBeGreaterThan(10);
  });

  it("fantasy_pack stub is registered", () => {
    expect(PLUGINS["fantasy_world_pack_v1"]).toBeDefined();
  });

  it("only the fantasy stub is comingSoon", () => {
    expect(PLUGINS["fantasy_world_pack_v1"].comingSoon).toBe(true);
    expect(PLUGINS["core_realistic"].comingSoon).toBeFalsy();
  });

  it("unknown packId falls back to core_realistic", () => {
    const plugin = PLUGINS["unknown_pack"] ?? PLUGINS["core_realistic"];
    expect(plugin.id).toBe("core_realistic");
  });
});
