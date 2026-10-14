import { z } from "zod";
import bcrypt from "bcryptjs";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export const emailSchema = z.string().trim().toLowerCase().email();

const CredentialsSchema = z.object({
  email:    emailSchema,
  password: z.string().min(1).max(72),
});

/** Validates raw credentials; returns null for anything non-conforming (e.g. operator objects). */
export function parseCredentials(raw: unknown): { email: string; password: string } | null {
  const parsed = CredentialsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
