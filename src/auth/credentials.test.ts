import { randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPassword } from "./credentials";

describe("app password", () => {
  it("accepts only the password matching the configured scrypt hash", async () => {
    const salt = randomBytes(16);
    const hash = scryptSync("synthetic-password", salt, 32, { N: 16384, r: 8, p: 1 });
    const stored = `scrypt$16384$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;
    expect(await verifyPassword("synthetic-password", stored)).toBe(true);
    expect(await verifyPassword("wrong-password", stored)).toBe(false);
    expect(await verifyPassword("synthetic-password", undefined)).toBe(false);
  });
});
