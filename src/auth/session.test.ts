import { describe, expect, it } from "vitest";
import { createSession, hasValidSession, SESSION_SECONDS } from "./session";

const secret = "ab".repeat(32);

describe("signed session", () => {
  it("accepts a valid session until its seven-day expiry", () => {
    const now = Date.UTC(2026, 0, 1);
    const token = createSession(secret, now);
    expect(hasValidSession(token, secret, now + (SESSION_SECONDS - 1) * 1000)).toBe(true);
    expect(hasValidSession(token, secret, now + SESSION_SECONDS * 1000)).toBe(false);
  });

  it("accepts hex signing secrets regardless of letter case", () => {
    const token = createSession(secret);
    expect(hasValidSession(token, secret.toUpperCase())).toBe(true);
  });

  it("validates deterministic sessions created with a small timestamp", () => {
    const token = createSession(secret, 0);
    expect(hasValidSession(token, secret, 0)).toBe(true);
  });

  it("rejects tampering and an unrelated signing secret", () => {
    const token = createSession(secret);
    expect(hasValidSession(token.replace("v1.", "v2."), secret)).toBe(false);
    expect(hasValidSession(token, "cd".repeat(32))).toBe(false);
    expect(hasValidSession(undefined, secret)).toBe(false);
  });
});
