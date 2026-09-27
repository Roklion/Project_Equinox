import { randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidPasswordHash, verifyPassword } from "./credentials";

describe("app password", () => {
  it("accepts only the password matching the configured scrypt hash", async () => {
    const salt = randomBytes(16);
    const hash = scryptSync("synthetic-password", salt, 32, { N: 16384, r: 8, p: 1 });
    const stored = `scrypt$16384$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;
    expect(await verifyPassword("synthetic-password", stored)).toBe(true);
    expect(await verifyPassword("wrong-password", stored)).toBe(false);
    expect(await verifyPassword("synthetic-password", undefined)).toBe(false);
  });

  it("recognizes only the configured scrypt hash format", () => {
    const salt = randomBytes(16).toString("hex");
    const digest = "ab".repeat(32);
    const stored = `scrypt$16384$8$1$${salt}$${digest}`;
    expect(isValidPasswordHash(stored)).toBe(true);
    expect(isValidPasswordHash(`${stored}copy-error`)).toBe(false);
    expect(isValidPasswordHash(undefined)).toBe(false);
  });
});
