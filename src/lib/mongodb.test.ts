// src/lib/mongodb.test.ts
import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { EventTemplateSchema } from "@/lib/schemas";

// We test the module shape, not a real connection (no test DB required)
describe("mongodb module", () => {
  it("exports a getDb function", async () => {
    const mod = await import("./mongodb");
    expect(typeof mod.getDb).toBe("function");
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
