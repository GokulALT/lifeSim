import { describe, it, expect, vi, afterEach } from "vitest";
import { careerTick, HIRE_CHANCE } from "./careerEngine";
import type { Character } from "@/lib/schemas/character";
import type { GamePlugin } from "@/lib/schemas/plugin";

const plugin: GamePlugin = {
  id: "test_pack",
  label: "Test",
  extraStats: [],
  careerTracks: [
    { title: "Barista", minSmarts: 0,  salaryGrade: "junior", minSalary: 20000, maxSalary: 30000 },
    { title: "Surgeon", minSmarts: 90, salaryGrade: "senior", minSalary: 200000, maxSalary: 300000 },
  ],
  seedEvents: { common: "", uncommon: "", flags: "" },
  buildAiBiasInstruction: () => "",
};

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    _id: "c1", userId: "u1", packId: "core_realistic",
    metadata: { firstName: "A", lastName: "B", birthCountry: "AU", birthCity: "Sydney", gender: "male", sexuality: "heterosexual" },
    age: 25, isAlive: true,
    stats: { happiness: 50, health: 70, smarts: 60, looks: 55 },
    hiddenStats: { karma: 50, fertility: 70, willpower: 60 },
    flags: { isEmployed: false, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: false, isStudent: false, inDebt: false, isTerminallyIll: false },
    financials: { bankBalance: 0, salary: 0, annualExpenses: 12000, assets: [] },
    career: { education: "highschool", currentJob: null, employer: null, yearsInRole: 3, performance: 10, salaryGrade: "none" },
    relationships: [], log: [], createdAt: "", updatedAt: "",
    ...overrides,
  };
}

const employed = (over: Partial<Character> = {}) => makeChar({
  flags: { ...makeChar().flags, isEmployed: true },
  financials: { bankBalance: 0, salary: 50000, annualExpenses: 12000, assets: [] },
  career: { education: "bachelor", currentJob: "Teacher", employer: "School", yearsInRole: 4, performance: 60, salaryGrade: "mid" },
  ...over,
});

afterEach(() => { vi.restoreAllMocks(); });

describe("careerTick", () => {
  it("hires an eligible adult into a qualifying track when the roll succeeds", () => {
    // roll (hire) → 0.1 < HIRE_CHANCE; track pick → 0.99 of 1 eligible; salary → 0.5
    vi.spyOn(Math, "random").mockReturnValueOnce(0.1).mockReturnValueOnce(0.99).mockReturnValueOnce(0.5);
    const char = makeChar();
    const result = careerTick(char, plugin);

    expect(result.flags.isEmployed).toBe(true);
    expect(result.career.currentJob).toBe("Barista"); // Surgeon needs smarts 90
    expect(result.career.employer).toBe("a local employer");
    expect(result.career.salaryGrade).toBe("junior");
    expect(result.career.yearsInRole).toBe(0);
    expect(result.career.performance).toBe(50);
    expect(result.financials.salary).toBe(25000);
    expect(Number.isInteger(result.financials.salary)).toBe(true);
    expect(result.log).toContainEqual({ age: 25, text: "You got a job as a Barista." });
    // pure: input untouched
    expect(char.flags.isEmployed).toBe(false);
    expect(char.log).toHaveLength(0);
  });

  it("keeps the salary within [minSalary, maxSalary] at the random extremes", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0.999999);
    expect(careerTick(makeChar(), plugin).financials.salary).toBe(30000);
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0);
    expect(careerTick(makeChar(), plugin).financials.salary).toBe(20000);
  });

  it("skips hiring when no track qualifies", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const strict: GamePlugin = { ...plugin, careerTracks: [plugin.careerTracks[1]] };
    const result = careerTick(makeChar(), strict);
    expect(result.flags.isEmployed).toBe(false);
    expect(result.career.currentJob).toBeNull();
    expect(result.log).toHaveLength(0);
  });

  it("does not hire when the roll fails", () => {
    vi.spyOn(Math, "random").mockReturnValue(HIRE_CHANCE);
    const result = careerTick(makeChar(), plugin);
    expect(result.flags.isEmployed).toBe(false);
    expect(result.financials.salary).toBe(0);
    expect(result.log).toHaveLength(0);
  });

  it("does not hire a character in prison", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const result = careerTick(makeChar({ flags: { ...makeChar().flags, inPrison: true } }), plugin);
    expect(result.flags.isEmployed).toBe(false);
    expect(random).not.toHaveBeenCalled();
  });

  it("does not hire a character under 18", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(careerTick(makeChar({ age: 17 }), plugin).flags.isEmployed).toBe(false);
    expect(careerTick(makeChar({ age: 18 }), plugin).flags.isEmployed).toBe(true);
  });

  it("does not hire a character at or over 65", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(careerTick(makeChar({ age: 65 }), plugin).flags.isEmployed).toBe(false);
  });

  it("does nothing for a dead character", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(careerTick(makeChar({ isAlive: false }), plugin).flags.isEmployed).toBe(false);
  });

  it("increments yearsInRole for an employed character under 65", () => {
    const random = vi.spyOn(Math, "random");
    const result = careerTick(employed({ age: 64 }), plugin);
    expect(result.career.yearsInRole).toBe(5);
    expect(result.flags.isEmployed).toBe(true);
    expect(result.career.currentJob).toBe("Teacher");
    expect(random).not.toHaveBeenCalled();
  });

  it("retires an employed character at 65", () => {
    const result = careerTick(employed({ age: 65 }), plugin);
    expect(result.flags.isEmployed).toBe(false);
    expect(result.financials.salary).toBe(0);
    expect(result.career.currentJob).toBeNull();
    expect(result.career.employer).toBeNull();
    expect(result.career.salaryGrade).toBe("none");
    expect(result.log).toContainEqual({ age: 65, text: "You retired." });
  });
});
