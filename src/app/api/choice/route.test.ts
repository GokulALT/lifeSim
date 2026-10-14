// src/app/api/choice/route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  auth:      vi.fn(),
  findOne:   vi.fn(),
  updateOne: vi.fn(),
  insertOne: vi.fn(),
  getDb:     vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/mongodb", () => ({ getDb: mocks.getDb }));

import { POST } from "./route";
import { NextRequest } from "next/server";

function makeRequest(body: object | string) {
  return new NextRequest("http://localhost/api/choice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const templateEvent = {
  _id: "evt_1", packId: "core_realistic", tier: "common",
  conditions: { ageMin: 0, ageMax: 120, requiredFlags: [], blockedFlags: [], statThresholds: {} },
  eventText: "A friend invites you to a party.",
  choices: [
    { text: "Go to the party.", effects: { happiness: 10, bankBalance: -100 }, outcomeText: "You had a great time." },
    { text: "Stay home.", effects: { happiness: -5 }, outcomeText: "A quiet night in." },
    {
      text: "Try your luck at the casino.",
      probabilistic: {
        chance: 0.5,
        success: { bankBalance: 5000, outcomeText: "You won big!" },
        failure: { bankBalance: -2000, outcomeText: "You lost your shirt." },
      },
    },
  ],
};

const aiEvent = {
  eventText: "A venture capitalist approaches you at a coffee shop.",
  choices: [
    { text: "Pitch your idea.", effects: { happiness: 10, bankBalance: 500 }, outcomeText: "They seem interested." },
    { text: "Decline politely.", effects: { happiness: -5 }, outcomeText: "You keep your privacy." },
  ],
};

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
  pendingEvent: templateEvent as object | null,
};

function mockCharacter(overrides: Partial<typeof baseCharacter> = {}) {
  mocks.findOne.mockImplementation((query: Record<string, unknown>) =>
    Promise.resolve(query._id === "char_001" ? structuredClone({ ...baseCharacter, ...overrides }) : null),
  );
}

function lastSet(): Record<string, unknown> {
  const call = mocks.updateOne.mock.calls.at(-1);
  if (!call) throw new Error("updateOne was not called");
  return (call[1] as { $set: Record<string, unknown> }).$set;
}

describe("POST /api/choice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user_001" } });
    mocks.getDb.mockResolvedValue({
      collection: () => ({ findOne: mocks.findOne, updateOne: mocks.updateOne, insertOne: mocks.insertOne }),
    });
    mockCharacter();
    mocks.updateOne.mockResolvedValue({ matchedCount: 1 });
    mocks.insertOne.mockResolvedValue({ acknowledged: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await POST(makeRequest("{oops"));
    expect(res.status).toBe(400);
  });

  it("returns 403 for another user's character", async () => {
    mockCharacter({ userId: "user_999" });
    const res = await POST(makeRequest({ characterId: "char_001", eventId: "evt_1", choiceIndex: 0 }));
    expect(res.status).toBe(403);
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it("returns 400 for a dead character", async () => {
    mockCharacter({ isAlive: false });
    const res = await POST(makeRequest({ characterId: "char_001", eventId: "evt_1", choiceIndex: 0 }));
    expect(res.status).toBe(400);
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it("returns 409 when there is no pending event", async () => {
    mockCharacter({ pendingEvent: null });
    const res = await POST(makeRequest({ characterId: "char_001", eventId: "evt_1", choiceIndex: 0 }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("No pending event");
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it("returns 409 when eventId does not match the pending event", async () => {
    const res = await POST(makeRequest({ characterId: "char_001", eventId: "evt_other", choiceIndex: 0 }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Event mismatch");
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it("returns 400 for a choiceIndex outside the pending event's choices", async () => {
    const res = await POST(makeRequest({ characterId: "char_001", eventId: "evt_1", choiceIndex: 3 }));
    expect(res.status).toBe(400);
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it("applies a template choice, returns outcomeText, hides hiddenStats, and clears pendingEvent", async () => {
    const res = await POST(makeRequest({ characterId: "char_001", eventId: "evt_1", choiceIndex: 0 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcomeText).toBe("You had a great time.");
    expect(body.character.hiddenStats).toBeUndefined();
    expect(body.character.stats.happiness).toBe(60);
    expect(body.character.financials.bankBalance).toBe(9900);
    expect(body.character.pendingEvent).toBeNull();

    const set = lastSet();
    expect(set.pendingEvent).toBeNull();
    expect("_id" in set).toBe(false);
    expect(set.log).toContainEqual({ age: 25, text: "You had a great time." });
  });

  it("ignores a forged AI eventPayload and uses only the stored pending event", async () => {
    mockCharacter({ pendingEvent: aiEvent });
    const forged = {
      eventText: "Forged event text that is long enough.",
      choices: [
        { text: "Take the money", effects: { bankBalance: 999999999 }, outcomeText: "You are now extremely rich." },
        { text: "Leave it", effects: {}, outcomeText: "Nothing happens at all." },
      ],
    };
    const res = await POST(makeRequest({ characterId: "char_001", eventId: "ai", choiceIndex: 0, eventPayload: forged }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcomeText).toBe("They seem interested.");
    expect(body.character.financials.bankBalance).toBe(10500);
    expect((lastSet().financials as { bankBalance: number }).bankBalance).toBe(10500);
  });

  it("resolves a stored AI pending event with eventId 'ai'", async () => {
    mockCharacter({ pendingEvent: aiEvent });
    const res = await POST(makeRequest({ characterId: "char_001", eventId: "ai", choiceIndex: 1 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcomeText).toBe("You keep your privacy.");
    expect(body.character.stats.happiness).toBe(45);
    expect(lastSet().pendingEvent).toBeNull();
  });

  it("returns 409 when eventId is 'ai' but the pending event is a template", async () => {
    const res = await POST(makeRequest({ characterId: "char_001", eventId: "ai", choiceIndex: 0 }));
    expect(res.status).toBe(409);
  });

  it("applies the success branch of a probabilistic choice", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const res = await POST(makeRequest({ characterId: "char_001", eventId: "evt_1", choiceIndex: 2 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcomeText).toBe("You won big!");
    expect(body.character.financials.bankBalance).toBe(15000);
  });

  it("applies the failure branch of a probabilistic choice", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const res = await POST(makeRequest({ characterId: "char_001", eventId: "evt_1", choiceIndex: 2 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcomeText).toBe("You lost your shirt.");
    expect(body.character.financials.bankBalance).toBe(8000);
  });
});
