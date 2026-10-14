import { describe, it, expect } from "vitest";
import { CharacterSchema, AiEventSchema, ChoiceSchema } from "../index";

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

  it("accepts a null, template, or AI pendingEvent and rejects garbage", () => {
    const pending = CharacterSchema.shape.pendingEvent;
    expect(pending.safeParse(undefined).success).toBe(true);
    expect(pending.safeParse(null).success).toBe(true);
    expect(pending.safeParse({
      _id: "evt_1", packId: "core_realistic", tier: "common",
      conditions: {},
      eventText: "A quiet year passes by.",
      choices: [{ text: "Rest", effects: {} }, { text: "Work", effects: {} }],
    }).success).toBe(true);
    expect(pending.safeParse({
      eventText: "A venture capitalist approaches you at a coffee shop.",
      choices: [
        { text: "Pitch your idea.", effects: {}, outcomeText: "They seem interested." },
        { text: "Decline politely.", effects: {}, outcomeText: "You keep your privacy." },
      ],
    }).success).toBe(true);
    expect(pending.safeParse({ eventText: "x" }).success).toBe(false);
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

describe("setFlags effect", () => {
  it("is accepted on template choice effects and probabilistic branches", () => {
    const result = ChoiceSchema.safeParse({
      text: "Say yes.",
      effects: { happiness: 5, setFlags: { isMarried: true } },
      probabilistic: {
        chance: 0.5,
        success: { setFlags: { isEmployed: false }, outcomeText: "You quit." },
        failure: { outcomeText: "Nothing changed." },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown flags and non-boolean values", () => {
    expect(ChoiceSchema.safeParse({ text: "Bad.", effects: { setFlags: { isMarried: "yes" } } }).success).toBe(false);
  });

  it("is stripped from AI event effects so the AI cannot set flags", () => {
    const result = AiEventSchema.parse({
      eventText: "A venture capitalist approaches you at a coffee shop.",
      choices: [
        { text: "Pitch your idea.", effects: { happiness: 10, setFlags: { isEmployed: true } }, outcomeText: "They seem interested." },
        { text: "Decline politely.", effects: {}, outcomeText: "You keep your privacy." },
      ],
    });
    expect(result.choices[0].effects).toEqual({ happiness: 10 });
    expect("setFlags" in result.choices[0].effects).toBe(false);
  });
});
