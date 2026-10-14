import { describe, it, expect } from "vitest";
import { filterEventsByConditions, FALLBACK_EVENT } from "./eventResolver";
import { EventTemplateSchema } from "@/lib/schemas";
import type { EventTemplate } from "@/lib/schemas/event";
import type { Character } from "@/lib/schemas/character";

const employed30: Character = {
  _id: "c1", userId: "u1", packId: "core_realistic",
  metadata: { firstName: "A", lastName: "B", birthCountry: "AU", birthCity: "Sydney", gender: "male", sexuality: "heterosexual" },
  age: 30, isAlive: true,
  stats: { happiness: 50, health: 70, smarts: 60, looks: 55 },
  hiddenStats: { karma: 50, fertility: 70, willpower: 60 },
  flags: { isEmployed: true, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: false, isStudent: false, inDebt: false, isTerminallyIll: false },
  financials: { bankBalance: 10000, salary: 50000, annualExpenses: 30000, assets: [] },
  career: { education: "bachelor", currentJob: "Dev", employer: "Corp", yearsInRole: 2, performance: 70, salaryGrade: "mid" },
  relationships: [], log: [], createdAt: "", updatedAt: "",
};

const baseEvent: EventTemplate = {
  _id: "evt_test", packId: "core_realistic", tier: "common",
  conditions: { ageMin: 18, ageMax: 65, requiredFlags: ["isEmployed"], blockedFlags: ["inPrison"], statThresholds: {} },
  eventText: "Test event.", choices: [
    { text: "Option A", effects: { happiness: 5 }, outcomeText: "Good." },
    { text: "Option B", effects: { happiness: -5 }, outcomeText: "Bad." },
  ],
};

function withThresholds(statThresholds: Record<string, { min?: number; max?: number }>): EventTemplate {
  return { ...baseEvent, _id: "evt_thr", conditions: { ...baseEvent.conditions, statThresholds } };
}

describe("filterEventsByConditions", () => {
  it("includes events matching all conditions", () => {
    expect(filterEventsByConditions([baseEvent], employed30)).toHaveLength(1);
  });

  it("excludes events where age is out of range", () => {
    const youngChar = { ...employed30, age: 10 };
    expect(filterEventsByConditions([baseEvent], youngChar)).toHaveLength(0);
  });

  it("excludes events where required flag is not set", () => {
    const unemployed = { ...employed30, flags: { ...employed30.flags, isEmployed: false } };
    expect(filterEventsByConditions([baseEvent], unemployed)).toHaveLength(0);
  });

  it("excludes events where a blocked flag is set", () => {
    const inPrison = { ...employed30, flags: { ...employed30.flags, inPrison: true } };
    expect(filterEventsByConditions([baseEvent], inPrison)).toHaveLength(0);
  });

  it("respects statThresholds min", () => {
    const lowSmarts = { ...employed30, stats: { ...employed30.stats, smarts: 30 } };
    const smartsGatedEvent: EventTemplate = {
      ...baseEvent, _id: "evt_smarts",
      conditions: { ...baseEvent.conditions, statThresholds: { smarts: { min: 50 } } },
    };
    expect(filterEventsByConditions([smartsGatedEvent], lowSmarts)).toHaveLength(0);
    expect(filterEventsByConditions([smartsGatedEvent], employed30)).toHaveLength(1);
  });

  it("maps careerPerformance to career.performance (min)", () => {
    const evt = withThresholds({ careerPerformance: { min: 60 } });
    expect(filterEventsByConditions([evt], employed30)).toHaveLength(1);
    const low = { ...employed30, career: { ...employed30.career, performance: 50 } };
    expect(filterEventsByConditions([evt], low)).toHaveLength(0);
  });

  it("maps careerPerformance to career.performance (max)", () => {
    const evt = withThresholds({ careerPerformance: { max: 40 } });
    expect(filterEventsByConditions([evt], employed30)).toHaveLength(0);
  });

  it("excludes events with unknown threshold keys", () => {
    const evt = withThresholds({ bogus: { min: 1 } });
    expect(filterEventsByConditions([evt], employed30)).toHaveLength(0);
  });
});

describe("FALLBACK_EVENT", () => {
  it("is a valid EventTemplate", () => {
    expect(EventTemplateSchema.safeParse(FALLBACK_EVENT).success).toBe(true);
  });
});
