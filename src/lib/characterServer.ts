import type { Db } from "mongodb";
import type { Character, CharacterClient, LogEntry } from "@/lib/schemas";

export const MAX_LOG_ENTRIES = 500;

export interface CharacterLogArchive {
  characterId: string;
  entries:     LogEntry[];
  archivedAt:  string;
}

/** Client-safe view of a character: hiddenStats never leave the server. */
export function toClient(char: Character): CharacterClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hiddenStats, ...client } = char;
  return client;
}

/** `$set` payload for a character update. `_id` is immutable in MongoDB, so it is excluded. */
export function toUpdateSet(char: Character): Omit<Character, "_id"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...rest } = char;
  return { ...rest, updatedAt: new Date().toISOString() };
}

/**
 * Moves the oldest log entries beyond MAX_LOG_ENTRIES into `character_logs`
 * and returns a clone whose log holds only the newest MAX_LOG_ENTRIES.
 */
export async function archiveOverflow(char: Character, db: Db): Promise<Character> {
  const overflow = char.log.length - MAX_LOG_ENTRIES;
  if (overflow <= 0) return char;

  const c = structuredClone(char);
  await db.collection<CharacterLogArchive>("character_logs").insertOne({
    characterId: c._id,
    entries:     c.log.slice(0, overflow),
    archivedAt:  new Date().toISOString(),
  });
  c.log = c.log.slice(overflow);
  return c;
}

/** Returns a clone with `entry` appended, archiving any overflow. */
export async function appendLog(char: Character, entry: LogEntry, db: Db): Promise<Character> {
  const c = structuredClone(char);
  c.log.push(entry);
  return archiveOverflow(c, db);
}
