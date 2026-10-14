// src/lib/mongodb.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { EventTemplateSchema } from "@/lib/schemas";

const { connectMock, ctorMock, dbMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
  ctorMock: vi.fn(),
  dbMock: { name: "fake-db" },
}));

vi.mock("mongodb", () => ({
  MongoClient: class {
    constructor(uri: string) {
      ctorMock(uri);
    }
    connect() {
      return connectMock(this);
    }
    db() {
      return dbMock;
    }
  },
}));

type MongoGlobal = { _mongoDbPromise?: Promise<unknown> };

// We test the module shape, not a real connection (no test DB required)
describe("mongodb module", () => {
  it("exports a getDb function", async () => {
    const mod = await import("./mongodb");
    expect(typeof mod.getDb).toBe("function");
  });
});

describe("getDb connection caching", () => {
  const originalUri = process.env.MONGODB_URI;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    delete (globalThis as unknown as MongoGlobal)._mongoDbPromise;
    process.env.MONGODB_URI = "mongodb://test-host:27017/test";
    connectMock.mockImplementation(async (client: unknown) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return client;
    });
  });

  afterEach(() => {
    if (originalUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalUri;
  });

  it("constructs only one client for two concurrent first calls", async () => {
    const { getDb } = await import("./mongodb");
    const [a, b] = await Promise.all([getDb(), getDb()]);
    expect(ctorMock).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(a).toBe(dbMock);
  });

  it("reuses the cached connection on later calls", async () => {
    const { getDb } = await import("./mongodb");
    await getDb();
    await getDb();
    expect(ctorMock).toHaveBeenCalledTimes(1);
  });

  it("clears the cache after a failed connect so the next call retries", async () => {
    const { getDb } = await import("./mongodb");
    connectMock.mockRejectedValueOnce(new Error("boom"));
    await expect(getDb()).rejects.toThrow("boom");
    await expect(getDb()).resolves.toBe(dbMock);
    expect(ctorMock).toHaveBeenCalledTimes(2);
  });

  it("throws when MONGODB_URI is not set", async () => {
    delete process.env.MONGODB_URI;
    const { getDb } = await import("./mongodb");
    await expect(getDb()).rejects.toThrow(
      "MONGODB_URI environment variable is not set"
    );
    expect(ctorMock).not.toHaveBeenCalled();
  });
});

describe("event seed data", () => {
  const files = ["common", "uncommon", "flags"];
  const events = files.flatMap((name) => {
    const filePath = path.join(process.cwd(), "data", "events", `${name}.json`);
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown[];
  });

  it("every entry passes EventTemplateSchema", () => {
    const failures = events
      .map((event, i) => ({ i, result: EventTemplateSchema.safeParse(event) }))
      .filter(({ result }) => !result.success)
      .map(({ i, result }) => `entry ${i}: ${JSON.stringify(result.error?.issues)}`);
    expect(failures).toEqual([]);
  });

  it("all _ids are unique", () => {
    const ids = events.map((e) => (e as { _id: string })._id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
