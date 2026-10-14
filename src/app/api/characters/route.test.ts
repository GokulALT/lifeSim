// src/app/api/characters/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  auth:      vi.fn(),
  findOne:   vi.fn(),
  insertOne: vi.fn(),
  find:      vi.fn(),
  toArray:   vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn().mockResolvedValue({
    collection: vi.fn().mockReturnValue({
      findOne:   mocks.findOne,
      insertOne: mocks.insertOne,
      find:      mocks.find,
    }),
  }),
}));

import { POST, GET } from "./route";
import { NextRequest } from "next/server";

function makeRequest(body: object | string) {
  return new NextRequest("http://localhost/api/characters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = {
  firstName: "Sam", lastName: "Lee", birthCountry: "AU", birthCity: "Sydney",
  gender: "male", sexuality: "heterosexual", packId: "core_realistic",
};

describe("/api/characters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user_001" } });
    mocks.findOne.mockResolvedValue({ _id: "user_001", email: "x@x.com", unlockedDLCs: ["core_realistic"] });
    mocks.insertOne.mockResolvedValue({ acknowledged: true });
    mocks.find.mockReturnValue({ toArray: mocks.toArray });
    mocks.toArray.mockResolvedValue([]);
  });

  describe("POST", () => {
    it("returns 401 without a session", async () => {
      mocks.auth.mockResolvedValue(null);
      const res = await POST(makeRequest(validBody));
      expect(res.status).toBe(401);
    });

    it("returns 400 for an invalid body", async () => {
      const res = await POST(makeRequest({ firstName: "" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for malformed JSON", async () => {
      const res = await POST(makeRequest("{not json"));
      expect(res.status).toBe(400);
    });

    it("returns 403 when the pack is not unlocked", async () => {
      const res = await POST(makeRequest({ ...validBody, packId: "fantasy_pack" }));
      expect(res.status).toBe(403);
      expect(mocks.insertOne).not.toHaveBeenCalled();
    });

    it("returns 201 with a client-safe new character", async () => {
      const res = await POST(makeRequest(validBody));
      expect(res.status).toBe(201);
      const { character } = await res.json();
      expect(character.hiddenStats).toBeUndefined();
      expect(character.age).toBe(0);
      expect(character.isAlive).toBe(true);
      expect(character.pendingEvent).toBeNull();
      expect(character.log).toContainEqual({ age: 0, text: "You were born in Sydney, AU." });
      for (const key of ["happiness", "health", "smarts", "looks"]) {
        const v = character.stats[key];
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    });

    it("stores hiddenStats server-side", async () => {
      await POST(makeRequest(validBody));
      expect(mocks.insertOne).toHaveBeenCalledTimes(1);
      const doc = mocks.insertOne.mock.calls[0][0];
      expect(doc.hiddenStats).toBeDefined();
      expect(doc.userId).toBe("user_001");
    });
  });

  describe("GET", () => {
    it("returns 401 without a session", async () => {
      mocks.auth.mockResolvedValue(null);
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it("queries by userId excluding hiddenStats and returns no hiddenStats", async () => {
      mocks.toArray.mockResolvedValue([{ _id: "c1", userId: "user_001", hiddenStats: { karma: 1 }, _lowPerfYears: 2 }]);
      const res = await GET();
      expect(mocks.find).toHaveBeenCalledWith({ userId: "user_001" }, { projection: { hiddenStats: 0 } });
      const body = await res.json();
      expect(body.characters).toHaveLength(1);
      expect(body.characters[0].hiddenStats).toBeUndefined();
      expect(body.characters[0]._lowPerfYears).toBeUndefined();
    });
  });
});
