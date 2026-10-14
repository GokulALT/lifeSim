// src/app/api/user/dlc/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  auth:      vi.fn(),
  updateOne: vi.fn(),
  findOne:   vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn().mockResolvedValue({
    collection: vi.fn().mockReturnValue({ updateOne: mocks.updateOne, findOne: mocks.findOne }),
  }),
}));

import { GET, POST } from "./route";
import { NextRequest } from "next/server";

function makeRequest(body: object | string) {
  return new NextRequest("http://localhost/api/user/dlc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/user/dlc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user_001" } });
    mocks.updateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("returns 401 without a session", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST(makeRequest({ unlockedDLCs: [] }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid body", async () => {
    const res = await POST(makeRequest({ nope: true }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await POST(makeRequest("{not json"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown DLC ids", async () => {
    const res = await POST(makeRequest({ unlockedDLCs: ["core_realistic", "bogus_pack"] }));
    expect(res.status).toBe(400);
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it("always includes core_realistic and de-duplicates", async () => {
    const res = await POST(makeRequest({ unlockedDLCs: ["fantasy_world_pack_v1", "fantasy_world_pack_v1"] }));
    expect(res.status).toBe(200);
    const { unlockedDLCs } = await res.json();
    expect(unlockedDLCs).toEqual(["core_realistic", "fantasy_world_pack_v1"]);
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: "user_001" },
      { $set: { unlockedDLCs: ["core_realistic", "fantasy_world_pack_v1"] } }
    );
  });
});

describe("GET /api/user/dlc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user_001" } });
  });

  it("returns 401 without a session", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the user's unlockedDLCs", async () => {
    mocks.findOne.mockResolvedValue({ _id: "user_001", unlockedDLCs: ["core_realistic", "fantasy_world_pack_v1"] });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ unlockedDLCs: ["core_realistic", "fantasy_world_pack_v1"] });
    expect(mocks.findOne).toHaveBeenCalledWith({ _id: "user_001" });
  });

  it("falls back to core_realistic when the user doc is missing", async () => {
    mocks.findOne.mockResolvedValue(null);
    const res = await GET();
    expect(await res.json()).toEqual({ unlockedDLCs: ["core_realistic"] });
  });
});
