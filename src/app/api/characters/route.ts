import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { CreateCharacterSchema } from "@/lib/schemas";
import type { Character, User } from "@/lib/schemas";
import { toClient } from "@/lib/characterServer";
import { PLUGINS } from "@/plugins";

function makeDefaultCharacter(userId: string, data: ReturnType<typeof CreateCharacterSchema.parse>): Character {
  const now = new Date().toISOString();
  return {
    _id:      randomUUID(),
    userId,
    packId:   data.packId,
    metadata: {
      firstName:    data.firstName,
      lastName:     data.lastName,
      birthCountry: data.birthCountry,
      birthCity:    data.birthCity,
      gender:       data.gender,
      sexuality:    data.sexuality,
    },
    age:      0,
    isAlive:  true,
    stats: {
      happiness: Math.floor(Math.random() * 31) + 50,  // 50-80
      health:    Math.floor(Math.random() * 31) + 60,  // 60-90
      smarts:    Math.floor(Math.random() * 71) + 10,  // 10-80
      looks:     Math.floor(Math.random() * 71) + 10,  // 10-80
    },
    hiddenStats: {
      karma:     Math.floor(Math.random() * 101),
      fertility: Math.floor(Math.random() * 41) + 50,
      willpower: Math.floor(Math.random() * 101),
    },
    flags: {
      isEmployed: false, isMarried: false, hasChildren: false,
      inPrison: false, hasDrugHabit: false, isStudent: true,
      inDebt: false, isTerminallyIll: false,
    },
    financials: { bankBalance: 0, salary: 0, annualExpenses: 0, assets: [] },
    career:     { education: "none", currentJob: null, employer: null, yearsInRole: 0, performance: 50, salaryGrade: "none" },
    relationships: [
      { npcId: randomUUID(), name: `${data.firstName}'s Mother`, relation: "mother", closeness: Math.floor(Math.random() * 41) + 50 },
      { npcId: randomUUID(), name: `${data.firstName}'s Father`, relation: "father", closeness: Math.floor(Math.random() * 41) + 40 },
    ],
    log: [{ age: 0, text: `You were born in ${data.birthCity}, ${data.birthCountry}.` }],
    pendingEvent: null,
    createdAt: now,
    updatedAt: now,
  };
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
  const parsed = CreateCharacterSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const plugin = PLUGINS[parsed.data.packId];
  if (!plugin || plugin.comingSoon) {
    return NextResponse.json({ error: "Pack not available yet" }, { status: 400 });
  }

  const db   = await getDb();
  const user = await db.collection<User>("users").findOne({ _id: session.user.id });
  if (!user?.unlockedDLCs?.includes(parsed.data.packId)) {
    return NextResponse.json({ error: "DLC not unlocked" }, { status: 403 });
  }

  const character = makeDefaultCharacter(session.user.id, parsed.data);
  await db.collection<Character>("characters").insertOne(character);

  return NextResponse.json({ character: toClient(character) }, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db   = await getDb();
  const docs = await db.collection<Character>("characters")
    .find({ userId: session.user.id }, { projection: { hiddenStats: 0 } })
    .toArray();

  return NextResponse.json({ characters: docs.map(toClient) });
}
