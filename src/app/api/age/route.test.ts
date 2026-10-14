// src/app/api/age/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  auth:                 vi.fn(),
  findOne:              vi.fn(),
  updateOne:            vi.fn(),
  insertOne:            vi.fn(),
  tickStats:            vi.fn(),
  applyEffects:         vi.fn(),
  selectTier:           vi.fn(() => "common"),
  getFlagOverrideEvent: vi.fn(),
  resolveEvent:         vi.fn(),
  generateRareEvent:    vi.fn(),
}));

// Mock auth — return a session for user_001 by default
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));

// Mock mongodb
vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn().mockResolvedValue({
    collection: vi.fn().mockReturnValue({
      findOne:   mocks.findOne,
      updateOne: mocks.updateOne,
      insertOne: mocks.insertOne,
    }),
  }),
}));

// Mock engine functions to be deterministic
vi.mock("@/engine/statEngine",       () => ({ tickStats: mocks.tickStats, applyEffects: mocks.applyEffects }));
vi.mock("@/engine/tierSelector",     () => ({ selectTier: mocks.selectTier }));
vi.mock("@/engine/eventResolver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/engine/eventResolver")>();
  return {
    FALLBACK_EVENT:       actual.FALLBACK_EVENT,
    getFlagOverrideEvent: mocks.getFlagOverrideEvent,
    resolveEvent:         mocks.resolveEvent,
  };
});
vi.mock("@/engine/aiEventGenerator", () => ({ generateRareEvent: mocks.generateRareEvent }));

import { POST } from "./route";
import { NextRequest } from "next/server";

function makeRequest(body: object | string) {
  return new NextRequest("http://localhost/api/age", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const baseCharacter = {
  _id: "char_001", userId: "user_001", packId: "core_realistic",
  metadata: { firstName: "Sam", lastName: "Lee", birthCountry: "AU", birthCity: "Sydney", gender: "male", sexuality: "heterosexual" },
  age: 25, isAlive: true,
  stats: { happiness: 50, health: 80, smarts: 60, looks: 55 },
  hiddenStats: { karma: 50, fertility: 70, willpower: 60 },
  flags: { isEmployed: true, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: false, isStudent: false, inDebt: false, isTerminallyIll: false },
  financials: { bankBalance: 10000, salary: 50000, annualExpenses: 30000, assets: [] },
  career: { education: "bachelor", currentJob: "Dev", employer: "Corp", yearsInRole: 2, performance: 65, salaryGrade: "mid" },
  relationships: [], log: [],
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
};

const baseUser = { _id: "user_001", email: "x@x.com", unlockedDLCs: ["core_realistic"] };

const commonEvent = {
  _id: "evt_1", packId: "core_realistic", tier: "common",
  conditions: { ageMin: 0, ageMax: 120, requiredFlags: [], blockedFlags: [], statThresholds: {} },
  eventText: "Something happened.",
  choices: [
    { text: "OK", effects: {}, outcomeText: "Fine." },
    { text: "No", effects: {}, outcomeText: "Also fine." },
  ],
};

function mockLookups(character: object = baseCharacter, user: object | null = baseUser) {
  mocks.findOne.mockImplementation((query: Record<string, unknown>) => {
    if (query._id === "char_001") return Promise.resolve(structuredClone(character));
    if (query._id === "user_001") return Promise.resolve(user && structuredClone(user));
    return Promise.resolve(null);
  });
}

function lastSet(): Record<string, unknown> {
  const call = mocks.updateOne.mock.calls.at(-1);
  if (!call) throw new Error("updateOne was not called");
  return (call[1] as { $set: Record<string, unknown> }).$set;
}

describe("POST /api/age", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user_001" } });
    mockLookups();
    mocks.updateOne.mockResolvedValue({ matchedCount: 1 });
    mocks.insertOne.mockResolvedValue({ acknowledged: true });
    mocks.tickStats.mockImplementation((c: { age: number }) => ({ ...structuredClone(c), age: c.age + 1 }));
    mocks.applyEffects.mockImplementation((c: unknown) => c);
    mocks.selectTier.mockImplementation(() => "common");
    mocks.getFlagOverrideEvent.mockResolvedValue(null);
    mocks.resolveEvent.mockResolvedValue(commonEvent);
    mocks.generateRareEvent.mockResolvedValue(null);
  });

  it("returns 400 for missing characterId", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await POST(makeRequest("{not json"));
    expect(res.status).toBe(400);
  });

  // Review Focus #2: cross-user character access
  it("returns 403 when character belongs to a different user", async () => {
    mockLookups({ ...baseCharacter, userId: "user_999" });
    const res = await POST(makeRequest({ characterId: "char_001" }));
    expect(res.status).toBe(403);
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it("returns 403 when the character's DLC is not unlocked", async () => {
    mockLookups({ ...baseCharacter, packId: "fantasy_pack" });
    const res = await POST(makeRequest({ characterId: "char_001" }));
    expect(res.status).toBe(403);
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it("returns 200 with character and event on success", async () => {
    const res = await POST(makeRequest({ characterId: "char_001" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event).toBeDefined();
    expect(body.character).toBeDefined();
  });

  // Review Focus #1: hiddenStats not in response
  it("does not include hiddenStats in the response", async () => {
    const res = await POST(makeRequest({ characterId: "char_001" }));
    const body = await res.json();
    expect(body.character.hiddenStats).toBeUndefined();
  });

  it("persists the served event as pendingEvent and never $sets _id", async () => {
    const res = await POST(makeRequest({ characterId: "char_001" }));
    const body = await res.json();
    const set = lastSet();
    expect(set.pendingEvent).toEqual(body.event);
    expect(set.pendingEvent).toEqual(commonEvent);
    expect("_id" in set).toBe(false);
  });

  // Review Focus #3: full fallback chain
  it("serves FALLBACK_EVENT when AI fails and every event pool is empty", async () => {
    mocks.selectTier.mockReturnValue("rare");
    mocks.generateRareEvent.mockResolvedValue(null);
    mocks.resolveEvent.mockResolvedValue(null);

    const res = await POST(makeRequest({ characterId: "char_001" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mocks.generateRareEvent).toHaveBeenCalledTimes(1);
    expect(mocks.resolveEvent).toHaveBeenCalledTimes(2);
    expect(body.event).not.toBeNull();
    expect(typeof body.event.eventText).toBe("string");
    expect(body.event.choices.length).toBeGreaterThanOrEqual(2);
    expect(body.event._id).toBe("evt_builtin_quiet_year");
    expect(lastSet().pendingEvent).toEqual(body.event);
  });

  it("on death returns event: null, skips event selection, and logs the death", async () => {
    mocks.tickStats.mockImplementation((c: { age: number }) => ({ ...structuredClone(c), age: c.age + 1, isAlive: false }));

    const res = await POST(makeRequest({ characterId: "char_001" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event).toBeNull();
    expect(body.character.isAlive).toBe(false);
    expect(mocks.generateRareEvent).not.toHaveBeenCalled();
    expect(mocks.resolveEvent).not.toHaveBeenCalled();
    expect(mocks.getFlagOverrideEvent).not.toHaveBeenCalled();

    const set = lastSet();
    expect(set.pendingEvent).toBeNull();
    expect(set.log).toContainEqual({ age: 26, text: "You died at age 26." });
    expect("_id" in set).toBe(false);
  });

  it("returns 400 for an already-dead character", async () => {
    mockLookups({ ...baseCharacter, isAlive: false });
    const res = await POST(makeRequest({ characterId: "char_001" }));
    expect(res.status).toBe(400);
  });
});
