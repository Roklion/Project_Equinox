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
  if (oldSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = oldSecret;
  vi.mocked(isSessionActive).mockResolvedValue(true);
  vi.restoreAllMocks();
});

describe("route protection", () => {
  it("redirects an unauthenticated page request and rejects an API request", async () => {
    process.env.SESSION_SECRET = secret;
    expect((await proxy(new NextRequest("http://localhost:3000/"))).status).toBe(307);
    expect((await proxy(new NextRequest("http://localhost:3000/api/investments"))).status).toBe(401);
    expect((await proxy(new NextRequest("http://localhost:3000/icon-secret"))).status).toBe(307);
  });

  it("allows public PWA icons before sign-in", async () => {
    process.env.SESSION_SECRET = secret;
    for (const path of ["/icon-192.png", "/icon-512.png"]) {
      expect((await proxy(new NextRequest(`http://localhost:3000${path}`))).status).toBe(200);
    }
  });

  it("preserves session cookies and fails closed when session configuration is missing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.SESSION_SECRET = secret;
    const token = createSession(secret);
    delete process.env.SESSION_SECRET;

    const pageRequest = new NextRequest("http://localhost:3000/", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    const pageResponse = await proxy(pageRequest);
    expect(pageResponse.status).toBe(307);
    expect(pageResponse.cookies.get(SESSION_COOKIE)).toBeUndefined();

    const apiRequest = new NextRequest("http://localhost:3000/api/investments", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    const apiResponse = await proxy(apiRequest);
    expect(apiResponse.status).toBe(500);
    expect(apiResponse.cookies.get(SESSION_COOKIE)).toBeUndefined();
    expect(isSessionActive).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith("Session validation is unavailable because SESSION_SECRET is missing or invalid.");
  });

  it("preserves session cookies and fails closed when session configuration is malformed", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.SESSION_SECRET = secret;
    const token = createSession(secret);
    process.env.SESSION_SECRET = "not-a-hex-signing-key";

    const pageRequest = new NextRequest("http://localhost:3000/", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    const pageResponse = await proxy(pageRequest);
    expect(pageResponse.status).toBe(307);
    expect(pageResponse.cookies.get(SESSION_COOKIE)).toBeUndefined();

    const apiRequest = new NextRequest("http://localhost:3000/api/investments", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    const apiResponse = await proxy(apiRequest);
    expect(apiResponse.status).toBe(500);
    expect(apiResponse.cookies.get(SESSION_COOKIE)).toBeUndefined();
    expect(isSessionActive).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith("Session validation is unavailable because SESSION_SECRET is missing or invalid.");
  });

  it("allows a signed, active session", async () => {
    process.env.SESSION_SECRET = secret;
    const request = new NextRequest("http://localhost:3000/", {
      headers: { cookie: `${SESSION_COOKIE}=${createSession(secret)}` },
    });
    expect((await proxy(request)).status).toBe(200);
  });

  it("lets expired sessions reach logout so the route can clear them", async () => {
    process.env.SESSION_SECRET = secret;
    vi.mocked(isSessionActive).mockResolvedValue(false);
    const request = new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: { cookie: SESSION_COOKIE + "=" + createSession(secret) },
    });
    const response = await proxy(request);
    expect(response.status).toBe(200);
    expect(isSessionActive).not.toHaveBeenCalled();
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

  it("preserves a potentially valid session cookie and logs safely during a database outage", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.SESSION_SECRET = secret;
    vi.mocked(isSessionActive).mockRejectedValueOnce(new Error("database unavailable"));
    const request = new NextRequest("http://localhost:3000/", {
      headers: { cookie: SESSION_COOKIE + "=" + createSession(secret) },
    });
    const response = await proxy(request);
    expect(response.status).toBe(307);
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
    expect(log).toHaveBeenCalledWith("Session validation failed due to a database error.");
  });
});
