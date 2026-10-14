import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { hashPassword, emailSchema } from "@/lib/authUtils";
import type { User } from "@/lib/schemas";
import { randomUUID } from "crypto";

const RegisterSchema = z.object({
  email:    emailSchema,
  password: z.string().min(8).max(72),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const db = await getDb();
  const users = db.collection<User>("users");

  const existing = await users.findOne({ email });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const now  = new Date().toISOString();
  const user: User = {
    _id:               randomUUID(),
    email,
    passwordHash:      await hashPassword(password),
    createdAt:         now,
    unlockedDLCs:      ["core_realistic"],
    activeCharacterId: null,
  };

  try {
    await users.insertOne(user);
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: unknown }).code === 11000) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
