import { describe, it, expect } from "vitest";
import { CharacterSchema, EventTemplateSchema, AiEventSchema, UserSchema } from "../index";

describe("CharacterSchema", () => {
  it("accepts a valid character document", () => {
    const result = CharacterSchema.safeParse({
      _id: "char_001",
      userId: "user_001",
      packId: "core_realistic",
      metadata: { firstName: "Sam", lastName: "Lee", birthCountry: "Australia", birthCity: "Sydney", gender: "female", sexuality: "heterosexual" },
      age: 20,
      isAlive: true,
      stats: { happiness: 70, health: 80, smarts: 60, looks: 55 },
      hiddenStats: { karma: 50, fertility: 75, willpower: 60 },
      flags: { isEmployed: false, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: false, isStudent: true, inDebt: false, isTerminallyIll: false },
      financials: { bankBalance: 500, salary: 0, annualExpenses: 8000, assets: [] },
      career: { education: "none", currentJob: null, employer: null, yearsInRole: 0, performance: 50, salaryGrade: "none" },
      relationships: [],
      log: [{ age: 0, text: "You were born." }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects stats outside 0-100", () => {
    const result = CharacterSchema.shape.stats.safeParse({ happiness: 150, health: 80, smarts: 60, looks: 55 });
    expect(result.success).toBe(false);
  });
});

describe("AiEventSchema", () => {
  it("accepts a valid AI event", () => {
    const result = AiEventSchema.safeParse({
      eventText: "A venture capitalist approaches you at a coffee shop.",
      choices: [
        { text: "Pitch your idea.", effects: { happiness: 10 }, outcomeText: "They seem interested." },
        { text: "Decline politely.", effects: { happiness: -5 }, outcomeText: "You keep your privacy." },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects events with fewer than 2 choices", () => {
    const result = AiEventSchema.safeParse({
      eventText: "Something happened.",
      choices: [{ text: "OK.", effects: {}, outcomeText: "Fine." }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects stat effects outside allowed range", () => {
    const result = AiEventSchema.safeParse({
      eventText: "A very long event text that exceeds the minimum length.",
      choices: [
        { text: "Choice A.", effects: { happiness: 999 }, outcomeText: "Outcome text here." },
        { text: "Choice B.", effects: {}, outcomeText: "Another outcome." },
      ],
    });
    expect(result.success).toBe(false);
  });
});
