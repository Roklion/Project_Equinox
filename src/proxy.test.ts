import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSession, SESSION_COOKIE } from "./auth/session";
import { isSessionActive } from "./auth/store";
import { proxy } from "./proxy";

vi.mock("@/auth/store", () => ({
  isSessionActive: vi.fn(async () => true),
}));

const secret = "ab".repeat(32);
const oldSecret = process.env.SESSION_SECRET;
afterEach(() => {
  process.env.SESSION_SECRET = oldSecret;
  vi.mocked(isSessionActive).mockResolvedValue(true);
});

describe("route protection", () => {
  it("redirects an unauthenticated page request and rejects an API request", async () => {
    process.env.SESSION_SECRET = secret;
    expect((await proxy(new NextRequest("http://localhost:3000/"))).status).toBe(307);
    expect((await proxy(new NextRequest("http://localhost:3000/api/investments"))).status).toBe(401);
    expect((await proxy(new NextRequest("http://localhost:3000/icon-secret"))).status).toBe(307);
  });

  it("allows a signed, active session", async () => {
    process.env.SESSION_SECRET = secret;
    const request = new NextRequest("http://localhost:3000/", {
      headers: { cookie: `${SESSION_COOKIE}=${createSession(secret)}` },
    });
    expect((await proxy(request)).status).toBe(200);
  });

  it("clears a revoked session cookie to avoid repeating its database lookup", async () => {
    process.env.SESSION_SECRET = secret;
    vi.mocked(isSessionActive).mockResolvedValue(false);
    const request = new NextRequest("http://localhost:3000/", {
      headers: { cookie: `${SESSION_COOKIE}=${createSession(secret)}` },
    });
    const response = await proxy(request);
    expect(response.status).toBe(307);
    expect(response.cookies.get(SESSION_COOKIE)?.maxAge).toBe(0);
  });

  it("preserves a potentially valid session cookie during a database outage", async () => {
    process.env.SESSION_SECRET = secret;
    vi.mocked(isSessionActive).mockRejectedValueOnce(new Error("database unavailable"));
    const request = new NextRequest("http://localhost:3000/", {
      headers: { cookie: `${SESSION_COOKIE}=${createSession(secret)}` },
    });
    const response = await proxy(request);
    expect(response.status).toBe(307);
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });
});
