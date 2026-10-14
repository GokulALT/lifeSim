import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { DlcUpdateSchema } from "@/lib/schemas";
import type { User } from "@/lib/schemas";
import { PLUGINS } from "@/plugins";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = DlcUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Validate all requested DLC IDs are registered plugins
  const knownIds = Object.keys(PLUGINS);
  const invalid  = parsed.data.unlockedDLCs.filter(id => !knownIds.includes(id));
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Unknown DLC IDs: ${invalid.join(", ")}` }, { status: 400 });
  }

  // core_realistic is always included
  const toSave = Array.from(new Set(["core_realistic", ...parsed.data.unlockedDLCs]));

  const db = await getDb();
  await db.collection<User>("users").updateOne(
    { _id: session.user.id },
    { $set: { unlockedDLCs: toSave } }
  );

  return NextResponse.json({ unlockedDLCs: toSave });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db   = await getDb();
  const user = await db.collection<User>("users").findOne({ _id: session.user.id });
  return NextResponse.json({ unlockedDLCs: user?.unlockedDLCs ?? ["core_realistic"] });
}
