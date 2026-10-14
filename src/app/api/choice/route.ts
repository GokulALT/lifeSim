import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { applyEffects } from "@/engine/statEngine";
import { ChoiceRequestSchema } from "@/lib/schemas/api";
import { toClient, appendLog, appendDeathLog, persistCharacter } from "@/lib/characterServer";
import type { Character } from "@/lib/schemas/character";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = ChoiceRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // eventPayload is deliberately ignored: the stored pendingEvent is the only source of truth.
  const { characterId, eventId, choiceIndex } = parsed.data;
  const db = await getDb();

  const character = await db.collection<Character>("characters").findOne({ _id: characterId });
  if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });
  if (character.userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!character.isAlive) return NextResponse.json({ error: "Character is dead" }, { status: 400 });

  const event = character.pendingEvent;
  if (!event) return NextResponse.json({ error: "No pending event" }, { status: 409 });

  const pendingId = "_id" in event ? event._id : "ai";
  if (eventId !== pendingId) return NextResponse.json({ error: "Event mismatch" }, { status: 409 });

  const choice = event.choices[choiceIndex];
  if (!choice) return NextResponse.json({ error: "Invalid choice index" }, { status: 400 });

  // Apply effects
  let updated = applyEffects(character, choice.effects ?? {});
  let outcomeText = choice.outcomeText ?? "";

  // Handle probabilistic outcomes (template events only)
  const prob = "probabilistic" in choice ? choice.probabilistic : undefined;
  if (prob) {
    const branch = Math.random() < prob.chance ? prob.success : prob.failure;
    updated = applyEffects(updated, branch);
    outcomeText = branch.outcomeText;
  }

  updated = appendLog(updated, { age: updated.age, text: outcomeText });

  // A choice can be fatal: same death handling and log text as /api/age.
  if (updated.stats.health <= 0) {
    updated.stats.health = 0;
    updated.isAlive = false;
    updated = appendDeathLog(updated);
  }

  // Conditional on the updatedAt we loaded: a concurrent /api/age or /api/choice wins, this one gets 409.
  const saved = await persistCharacter(db, { ...updated, pendingEvent: null }, character.updatedAt);
  if (!saved) return NextResponse.json({ error: "Conflict, please retry" }, { status: 409 });

  return NextResponse.json({ character: toClient(saved), outcomeText });
}
