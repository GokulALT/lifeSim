import type { Db } from "mongodb";
import type { Character, CharacterClient, LogEntry } from "@/lib/schemas";

export const MAX_LOG_ENTRIES = 500;

/** Engine-internal keys that may ride along on a character document but must never reach the client. */
const INTERNAL_KEYS = ["_lowPerfYears"] as const;

export interface CharacterLogArchive {
  characterId: string;
  entries:     LogEntry[];
  archivedAt:  string;
}

/** Client-safe view of a character: hiddenStats and engine-internal keys never leave the server. */
export function toClient(char: Character): CharacterClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hiddenStats, ...client } = char;
  for (const key of INTERNAL_KEYS) delete (client as Record<string, unknown>)[key];
  return client;
}

/** `$set` payload for a character update. `_id` is immutable in MongoDB, so it is excluded. */
export function toUpdateSet(char: Character): Omit<Character, "_id"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...rest } = char;
  return rest;
}

/** Pure: returns a clone with `entry` appended to the log. */
export function appendLog(char: Character, entry: LogEntry): Character {
  const c = structuredClone(char);
  c.log.push(entry);
  return c;
}

/** Pure: returns a clone with the standard death entry ("You died at age N.") appended. */
export function appendDeathLog(char: Character): Character {
  return appendLog(char, { age: char.age, text: `You died at age ${char.age}.` });
}

/** Pure: splits off the oldest log entries beyond MAX_LOG_ENTRIES. */
export function splitOverflow(char: Character): { character: Character; overflow: LogEntry[] } {
  const excess = char.log.length - MAX_LOG_ENTRIES;
  if (excess <= 0) return { character: char, overflow: [] };
  return {
    character: { ...char, log: char.log.slice(excess) },
    overflow:  char.log.slice(0, excess),
  };
}

/** Inserts archived log entries into `character_logs` (no-op when empty). */
export async function archiveEntries(db: Db, characterId: string, entries: LogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await db.collection<CharacterLogArchive>("character_logs").insertOne({
    characterId,
    entries,
    archivedAt: new Date().toISOString(),
  });
}

/**
 * Saves `char` only if the stored document still has `expectedUpdatedAt` (optimistic concurrency).
 * Log overflow is trimmed in memory and archived only after the update matched, so a conflict
 * never leaves duplicate archives behind. Returns the saved character, or null on conflict.
 */
export async function persistCharacter(db: Db, char: Character, expectedUpdatedAt: string): Promise<Character | null> {
  const { character, overflow } = splitOverflow(char);
  const saved: Character = { ...character, updatedAt: new Date().toISOString() };

  const result = await db.collection<Character>("characters").updateOne(
    { _id: saved._id, updatedAt: expectedUpdatedAt },
    { $set: toUpdateSet(saved) }
  );
  if (result.matchedCount === 0) return null;

  await archiveEntries(db, saved._id, overflow);
  return saved;
}
