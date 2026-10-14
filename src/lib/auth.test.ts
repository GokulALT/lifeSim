import { describe, it, expect } from "vitest";

describe("hashPassword / verifyPassword", () => {
  it("hashes a password and verifies it correctly", async () => {
    const { hashPassword, verifyPassword } = await import("./authUtils");
    const hash = await hashPassword("hunter2");
    expect(await verifyPassword("hunter2", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});

describe("routeDecision", () => {
  it("always allows /api/auth/*", async () => {
    const { routeDecision } = await import("./auth.config");
    expect(routeDecision("/api/auth/register", false)).toBe("allow");
    expect(routeDecision("/api/auth/session", true)).toBe("allow");
  });

  it("redirects logged-in users away from /login and /register", async () => {
    const { routeDecision } = await import("./auth.config");
    expect(routeDecision("/login", true)).toBe("redirect-home");
    expect(routeDecision("/register", true)).toBe("redirect-home");
  });

  it("returns unauthorized for logged-out /api/* requests", async () => {
    const { routeDecision } = await import("./auth.config");
    expect(routeDecision("/api/age", false)).toBe("unauthorized");
  });

  it("redirects logged-out users on other pages to /login", async () => {
    const { routeDecision } = await import("./auth.config");
    expect(routeDecision("/", false)).toBe("redirect-login");
    expect(routeDecision("/play", false)).toBe("redirect-login");
  });

  it("allows logged-out users on /login and /register", async () => {
    const { routeDecision } = await import("./auth.config");
    expect(routeDecision("/login", false)).toBe("allow");
    expect(routeDecision("/register", false)).toBe("allow");
  });

  it("allows logged-in users on pages and API routes", async () => {
    const { routeDecision } = await import("./auth.config");
    expect(routeDecision("/", true)).toBe("allow");
    expect(routeDecision("/api/age", true)).toBe("allow");
  });
});

describe("routeDecision prefix edges", () => {
  it("does not treat lookalike prefixes as special", async () => {
    const { routeDecision } = await import("./auth.config");
    expect(routeDecision("/api/authx", false)).toBe("unauthorized");
    expect(routeDecision("/api", false)).toBe("unauthorized");
    expect(routeDecision("/loginx", false)).toBe("redirect-login");
  });
});

describe("authorized callback mapping", () => {
  type AuthorizedFn = (args: { auth: unknown; request: { nextUrl: URL } }) => unknown;
  async function call(path: string, loggedIn: boolean) {
    const { authConfig } = await import("./auth.config");
    const fn = authConfig.callbacks.authorized as unknown as AuthorizedFn;
    return fn({
      auth: loggedIn ? { user: { id: "u1" } } : null,
      request: { nextUrl: new URL(`http://localhost:3000${path}`) },
    });
  }

  it("maps unauthorized to a 401 JSON response", async () => {
    const res = (await call("/api/age", false)) as Response;
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("maps redirect-login to a redirect to /login", async () => {
    const res = (await call("/play", false)) as Response;
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("maps allow to true", async () => {
    expect(await call("/", true)).toBe(true);
  });
});

describe("parseCredentials", () => {
  it("rejects operator objects and non-string values", async () => {
    const { parseCredentials } = await import("./authUtils");
    expect(parseCredentials({ email: { $regex: "^a" }, password: "x" })).toBeNull();
    expect(parseCredentials({ email: "a@b.co", password: { $ne: 1 } })).toBeNull();
    expect(parseCredentials({ email: "a@b.co", password: "x".repeat(73) })).toBeNull();
    expect(parseCredentials(undefined)).toBeNull();
  });

  it("normalises email by trim + lowercase", async () => {
    const { parseCredentials } = await import("./authUtils");
    expect(parseCredentials({ email: "  A@B.Co ", password: "pw" })).toEqual({
      email: "a@b.co",
      password: "pw",
    });
  });
});
