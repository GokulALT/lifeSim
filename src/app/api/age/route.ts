import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { tickStats, clamp } from "@/engine/statEngine";
import { selectTier } from "@/engine/tierSelector";
import { resolveEvent, getFlagOverrideEvent, FALLBACK_EVENT, FLAG_OVERRIDE_CHANCE } from "@/engine/eventResolver";
import { careerTick } from "@/engine/careerEngine";
import { generateRareEvent } from "@/engine/aiEventGenerator";
import { PLUGINS } from "@/plugins";
import { AgeRequestSchema } from "@/lib/schemas/api";
import { toClient, appendDeathLog, persistCharacter } from "@/lib/characterServer";
import type { Character, StatBlock } from "@/lib/schemas/character";
import type { User } from "@/lib/schemas/user";
import type { EventTemplate, AiEvent } from "@/lib/schemas/event";
import type { GamePlugin } from "@/lib/schemas/plugin";
import type { Db } from "mongodb";

async function selectEvent(char: Character, plugin: GamePlugin, db: Db): Promise<EventTemplate | AiEvent> {
  // Flag overrides only win some turns (ruling R28), otherwise e.g. inDebt would repeat forever.
  if (Math.random() < FLAG_OVERRIDE_CHANCE) {
    const flagEvent = await getFlagOverrideEvent(char, db);
    if (flagEvent) return flagEvent;
  }

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
  // No rerolling: an unresolved event (e.g. a flag override like prison) must be answered first.
  if (character.pendingEvent) {
    return NextResponse.json({ error: "Resolve pending event first", event: character.pendingEvent }, { status: 409 });
  }

  const plugin = PLUGINS[character.packId] ?? PLUGINS["core_realistic"];

  // 1. Tick stats
  let updated = tickStats(character);
  if (plugin.applyStatTick) {
    for (const [key, value] of Object.entries(plugin.applyStatTick(updated))) {
      if (value !== undefined) updated.stats[key as keyof StatBlock] = clamp(value);
    }
    if (updated.stats.health <= 0) {
      updated.stats.health = 0;
      updated.isAlive = false;
    }
  }

  // 2. Death: no event this turn. Otherwise run the career tick, then pick an event.
  let event: EventTemplate | AiEvent | null = null;
  if (!updated.isAlive) {
    updated = appendDeathLog(updated);
  } else {
    updated = careerTick(updated, plugin);
    event = await selectEvent(updated, plugin, db);
  }

  // 3. Save (pending event is the server's source of truth for /api/choice).
  //    Conditional on the updatedAt we loaded, so overlapping requests cannot clobber each other.
  const saved = await persistCharacter(db, { ...updated, pendingEvent: event }, character.updatedAt);
  if (!saved) return NextResponse.json({ error: "Conflict, please retry" }, { status: 409 });

  return NextResponse.json({ character: toClient(saved), event });
}
