import { describe, it, expect, vi } from "vitest";
import type { Db } from "mongodb";
import { toClient, appendLog, splitOverflow, archiveEntries, persistCharacter } from "./characterServer";
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

function makeDb(matchedCount = 1) {
  const insertOne = vi.fn().mockResolvedValue({ acknowledged: true });
  const updateOne = vi.fn().mockResolvedValue({ matchedCount });
  const collection = vi.fn().mockReturnValue({ insertOne, updateOne });
  return { db: { collection } as unknown as Db, collection, insertOne, updateOne };
}

describe("toClient", () => {
  it("strips hiddenStats", () => {
    const client = toClient(makeCharacter(0));
    expect("hiddenStats" in client).toBe(false);
    expect(client.stats.health).toBe(80);
  });

  it("strips the engine-internal _lowPerfYears key", () => {
    const char = { ...makeCharacter(0), _lowPerfYears: 1 } as Character;
    const client = toClient(char);
    expect("_lowPerfYears" in client).toBe(false);
    expect("_lowPerfYears" in char).toBe(true); // input untouched
  });
});

describe("appendLog", () => {
  it("returns a clone with the entry appended", () => {
    const char = makeCharacter(3);
    const result = appendLog(char, { age: 25, text: "new" });
    expect(result.log).toHaveLength(4);
    expect(result.log[3]).toEqual({ age: 25, text: "new" });
    expect(char.log).toHaveLength(3);
  });
});

describe("splitOverflow", () => {
  it("returns no overflow at or under the cap", () => {
    const char = makeCharacter(500);
    const { character, overflow } = splitOverflow(char);
    expect(character.log).toHaveLength(500);
    expect(overflow).toEqual([]);
  });

  it("splits the oldest entries beyond 500 and keeps the newest 500", () => {
    const char = appendLog(makeCharacter(502), { age: 999, text: "newest" });
    const { character, overflow } = splitOverflow(char);
    expect(character.log).toHaveLength(500);
    expect(character.log[0]).toEqual({ age: 3, text: "entry 3" });
    expect(character.log[499]).toEqual({ age: 999, text: "newest" });
    expect(overflow).toEqual([
      { age: 0, text: "entry 0" },
      { age: 1, text: "entry 1" },
      { age: 2, text: "entry 2" },
    ]);
    expect(char.log).toHaveLength(503); // input untouched
  });
});

describe("archiveEntries", () => {
  it("inserts entries into character_logs", async () => {
    const { db, collection, insertOne } = makeDb();
    await archiveEntries(db, "char_001", [{ age: 0, text: "entry 0" }]);
    expect(collection).toHaveBeenCalledWith("character_logs");
    const doc = insertOne.mock.calls[0][0];
    expect(doc.characterId).toBe("char_001");
    expect(doc.entries).toEqual([{ age: 0, text: "entry 0" }]);
    expect(typeof doc.archivedAt).toBe("string");
  });

  it("is a no-op for no entries", async () => {
    const { db, insertOne } = makeDb();
    await archiveEntries(db, "char_001", []);
    expect(insertOne).not.toHaveBeenCalled();
  });
});

describe("persistCharacter", () => {
  it("updates conditionally on the loaded updatedAt, then archives overflow", async () => {
    const { db, updateOne, insertOne } = makeDb(1);
    const saved = await persistCharacter(db, makeCharacter(503), "2026-01-01");

    expect(saved).not.toBeNull();
    expect(saved!.log).toHaveLength(500);
    expect(saved!.updatedAt).not.toBe("2026-01-01");

    const [filter, update] = updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: "char_001", updatedAt: "2026-01-01" });
    expect("_id" in update.$set).toBe(false);
    expect(update.$set.log).toHaveLength(500);
    expect(update.$set.updatedAt).toBe(saved!.updatedAt);

    expect(insertOne).toHaveBeenCalledTimes(1);
    expect(insertOne.mock.calls[0][0].entries).toHaveLength(3);
    expect(updateOne.mock.invocationCallOrder[0]).toBeLessThan(insertOne.mock.invocationCallOrder[0]);
  });

  it("returns null and archives nothing on a concurrency conflict", async () => {
    const { db, insertOne } = makeDb(0);
    const saved = await persistCharacter(db, makeCharacter(503), "2026-01-01");
    expect(saved).toBeNull();
    expect(insertOne).not.toHaveBeenCalled();
  });
});
