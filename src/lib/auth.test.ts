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
