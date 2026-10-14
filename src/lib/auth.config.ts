import type { NextAuthConfig } from "next-auth";

export type RouteDecision = "allow" | "redirect-login" | "redirect-home" | "unauthorized";

export function routeDecision(pathname: string, isLoggedIn: boolean): RouteDecision {
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return "allow";

  const isAuthPage = pathname === "/login" || pathname === "/register";
  if (isLoggedIn && isAuthPage) return "redirect-home";
  if (!isLoggedIn && (pathname === "/api" || pathname.startsWith("/api/"))) return "unauthorized";
  if (!isLoggedIn && !isAuthPage) return "redirect-login";
  return "allow";
}

// Edge-safe config: no DB, bcrypt or Node-only imports.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const decision = routeDecision(request.nextUrl.pathname, !!auth?.user);
      switch (decision) {
        case "allow":
          return true;
        case "redirect-home":
          return Response.redirect(new URL("/", request.nextUrl));
        case "redirect-login":
          return Response.redirect(new URL("/login", request.nextUrl));
        case "unauthorized":
          return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    },
    jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
