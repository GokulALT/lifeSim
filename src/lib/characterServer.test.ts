import { describe, it, expect, vi } from "vitest";
import type { Db } from "mongodb";
import { toClient, appendLog } from "./characterServer";
import type { Character } from "@/lib/schemas";

function makeCharacter(logLength: number): Character {
  return {
    _id: "char_001", userId: "user_001", packId: "core_realistic",
    metadata: { firstName: "Sam", lastName: "Lee", birthCountry: "AU", birthCity: "Sydney", gender: "male", sexuality: "heterosexual" },
    age: 25, isAlive: true,
    stats: { happiness: 50, health: 80, smarts: 60, looks: 55 },
    hiddenStats: { karma: 50, fertility: 70, willpower: 60 },
    flags: { isEmployed: true, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: false, isStudent: false, inDebt: false, isTerminallyIll: false },
    financials: { bankBalance: 10000, salary: 50000, annualExpenses: 30000, assets: [] },
    career: { education: "bachelor", currentJob: "Dev", employer: "Corp", yearsInRole: 2, performance: 65, salaryGrade: "mid" },
    relationships: [],
    log: Array.from({ length: logLength }, (_, i) => ({ age: i, text: `entry ${i}` })),
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
  };
}

function makeDb() {
  const insertOne = vi.fn().mockResolvedValue({ acknowledged: true });
  const collection = vi.fn().mockReturnValue({ insertOne });
  return { db: { collection } as unknown as Db, collection, insertOne };
}

describe("toClient", () => {
  it("strips hiddenStats", () => {
    const client = toClient(makeCharacter(0));
    expect("hiddenStats" in client).toBe(false);
    expect(client.stats.health).toBe(80);
  });
});

describe("appendLog", () => {
  it("appends without archiving when under the cap", async () => {
    const { db, insertOne } = makeDb();
    const char = makeCharacter(3);
    const result = await appendLog(char, { age: 25, text: "new" }, db);
    expect(result.log).toHaveLength(4);
    expect(result.log[3]).toEqual({ age: 25, text: "new" });
    expect(char.log).toHaveLength(3); // original untouched
    expect(insertOne).not.toHaveBeenCalled();
  });

  it("archives overflow beyond 500 into character_logs and keeps the newest 500", async () => {
    const { db, collection, insertOne } = makeDb();
    const char = makeCharacter(502);
    const result = await appendLog(char, { age: 999, text: "newest" }, db);

    expect(result.log).toHaveLength(500);
    expect(result.log[499]).toEqual({ age: 999, text: "newest" });
    expect(result.log[0]).toEqual({ age: 3, text: "entry 3" });

    expect(collection).toHaveBeenCalledWith("character_logs");
    expect(insertOne).toHaveBeenCalledTimes(1);
    const doc = insertOne.mock.calls[0][0];
    expect(doc.characterId).toBe("char_001");
    expect(doc.entries).toEqual([
      { age: 0, text: "entry 0" },
      { age: 1, text: "entry 1" },
      { age: 2, text: "entry 2" },
    ]);
    expect(typeof doc.archivedAt).toBe("string");
  });
});
