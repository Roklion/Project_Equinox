import { randomBytes, scryptSync } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";
import { SESSION_COOKIE } from "@/auth/session";
import { revokeSession } from "@/auth/store";
import { proxy } from "@/proxy";

const activeTokens = vi.hoisted(() => new Set<string>());
const bucketSpy = vi.hoisted(() => vi.fn(() => "synthetic-bucket"));
vi.mock("@/auth/rate-limit", () => ({
  loginBucket: bucketSpy,
  reserveLoginAttempt: vi.fn(async () => true),
  clearLoginFailures: vi.fn(async () => {}),
}));
vi.mock("@/auth/store", () => ({
  saveSession: vi.fn(async (token: string) => { activeTokens.add(token); }),
  isSessionActive: vi.fn(async (token: string) => activeTokens.has(token)),
  revokeSession: vi.fn(async (token: string) => { activeTokens.delete(token); }),
}));

const originalHash = process.env.APP_PASSWORD_HASH;
const originalSecret = process.env.SESSION_SECRET;
const secret = "ab".repeat(32);

beforeEach(() => {
  activeTokens.clear();
  vi.mocked(revokeSession).mockImplementation(async (token) => { activeTokens.delete(token); });
  const salt = randomBytes(16);
  const hash = scryptSync("synthetic-password", salt, 32, { N: 16384, r: 8, p: 1 });
  process.env.APP_PASSWORD_HASH = `scrypt$16384$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;
  process.env.SESSION_SECRET = secret;
});
afterEach(() => {
  process.env.APP_PASSWORD_HASH = originalHash;
  process.env.SESSION_SECRET = originalSecret;
  vi.restoreAllMocks();
});

function loginRequest(password: string) {
  return new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

describe("login and logout", () => {
  it("uses only the trusted platform IP header for the throttle bucket", async () => {
    const spoofedOnly = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.44" },
      body: JSON.stringify({ password: "wrong-password" }),
    });
    await login(spoofedOnly);
    expect(bucketSpy).toHaveBeenLastCalledWith("unknown", secret);

    const platformAddress = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": "203.0.113.16",
        "x-forwarded-for": "198.51.100.44",
      },
      body: JSON.stringify({ password: "wrong-password" }),
    });
    await login(platformAddress);
    expect(bucketSpy).toHaveBeenLastCalledWith("203.0.113.16", secret);
  });

  it("rejects an incorrect password without setting a session", async () => {
    const response = await login(loginRequest("wrong-password"));
    expect(response.status).toBe(401);
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("grants access with a correct password and revokes the token on logout", async () => {
    const response = await login(loginRequest("synthetic-password"));
    expect(response.status).toBe(200);
    const cookie = response.cookies.get(SESSION_COOKIE);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.maxAge).toBe(7 * 24 * 60 * 60);
    const protectedRequest = new NextRequest("http://localhost:3000/", {
      headers: { cookie: `${SESSION_COOKIE}=${cookie?.value}` },
    });
    expect((await proxy(protectedRequest)).status).toBe(200);
    const signedOut = await logout(protectedRequest);
    expect(signedOut.cookies.get(SESSION_COOKIE)?.maxAge).toBe(0);
    expect((await proxy(protectedRequest)).status).toBe(307);
  });

  it("preserves the token and reports incomplete revocation on database failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(revokeSession).mockRejectedValueOnce(new Error("postgres://synthetic-secret@localhost"));
    const token = "synthetic-session-token";
    const request = new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: { cookie: SESSION_COOKIE + "=" + token },
    });
    const response = await logout(request);
    expect(response.status).toBe(503);
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(log).toHaveBeenCalledWith("Session revocation failed during logout.");
  });
});
