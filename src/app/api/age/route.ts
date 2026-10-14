import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { tickStats } from "@/engine/statEngine";
import { selectTier } from "@/engine/tierSelector";
import { resolveEvent, getFlagOverrideEvent, FALLBACK_EVENT } from "@/engine/eventResolver";
import { generateRareEvent } from "@/engine/aiEventGenerator";
import { PLUGINS } from "@/plugins";
import { AgeRequestSchema } from "@/lib/schemas/api";
import { toClient, toUpdateSet, appendLog, archiveOverflow } from "@/lib/characterServer";
import type { Character } from "@/lib/schemas/character";
import type { User } from "@/lib/schemas/user";
import type { EventTemplate, AiEvent } from "@/lib/schemas/event";
import type { GamePlugin } from "@/lib/schemas/plugin";
import type { Db } from "mongodb";

async function selectEvent(char: Character, plugin: GamePlugin, db: Db): Promise<EventTemplate | AiEvent> {
  const flagEvent = await getFlagOverrideEvent(char, db);
  if (flagEvent) return flagEvent;

  const tier = selectTier(char);
  let event: EventTemplate | AiEvent | null;
  if (tier === "rare") {
    // Fallback chain: AI → uncommon → common
    event = await generateRareEvent(char, plugin);
    if (!event) event = await resolveEvent(char, "uncommon", db);
  } else {
    event = await resolveEvent(char, tier, db);
  }
  if (!event && tier !== "common") event = await resolveEvent(char, "common", db);

  // Every pool empty: a living character always gets an event.
  return event ?? FALLBACK_EVENT;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = AgeRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { characterId } = parsed.data;
  const db = await getDb();

  const [character, user] = await Promise.all([
    db.collection<Character>("characters").findOne({ _id: characterId }),
    db.collection<User>("users").findOne({ _id: session.user.id }),
  ]);

  if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });
  if (character.userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!character.isAlive) return NextResponse.json({ error: "Character is dead" }, { status: 400 });
  if (!user?.unlockedDLCs?.includes(character.packId)) return NextResponse.json({ error: "DLC not unlocked" }, { status: 403 });

  const plugin = PLUGINS[character.packId] ?? PLUGINS["core_realistic"];

  // 1. Tick stats
  let updated = tickStats(character);
  if (plugin.applyStatTick) {
    Object.assign(updated.stats, plugin.applyStatTick(updated));
  }

  // 2. Death: no event this turn
  let event: EventTemplate | AiEvent | null = null;
  if (!updated.isAlive) {
    updated = await appendLog(updated, { age: updated.age, text: `You died at age ${updated.age}.` }, db);
  } else {
    event = await selectEvent(updated, plugin, db);
    updated = await archiveOverflow(updated, db); // tickStats may have pushed log entries
  }
  updated = { ...updated, pendingEvent: event };

  // 3. Save updated character (pending event is the server's source of truth for /api/choice)
  await db.collection<Character>("characters").updateOne(
    { _id: characterId },
    { $set: toUpdateSet(updated) }
  );

  return NextResponse.json({ character: toClient(updated), event });
}
