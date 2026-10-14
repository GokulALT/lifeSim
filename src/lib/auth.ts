import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getDb } from "./mongodb";
import { verifyPassword, parseCredentials } from "./authUtils";
import { authConfig } from "./auth.config";
import type { User } from "./schemas";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email:    { label: "Email",    type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const creds = parseCredentials(credentials);
        if (!creds) return null;

        const db   = await getDb();
        const user = await db.collection<User>("users").findOne({ email: creds.email });
        if (!user) return null;

        const valid = await verifyPassword(creds.password, user.passwordHash);
        if (!valid) return null;

        return { id: String(user._id), email: user.email };
      },
    }),
  ],
});
