import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSession, SESSION_COOKIE } from "./auth/session";
import { proxy } from "./proxy";

vi.mock("@/auth/store", () => ({
  isSessionActive: vi.fn(async () => true),
}));

const secret = "ab".repeat(32);
const oldSecret = process.env.SESSION_SECRET;
afterEach(() => { process.env.SESSION_SECRET = oldSecret; });

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
});
