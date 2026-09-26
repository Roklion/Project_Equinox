import { describe, expect, it } from "vitest";
import { readDatabaseUrl } from "@/persistence/environment";

describe("database environment", () => {
  it("requires explicit database configuration", () => {
    expect(() => readDatabaseUrl("DATABASE_URL", {})).toThrow("DATABASE_URL is required");
  });

  it("accepts standard PostgreSQL URLs without changing connection options", () => {
    const url = "postgresql://example:synthetic-password@localhost:5433/equinox?sslmode=verify-full";
    expect(readDatabaseUrl("DATABASE_URL", { DATABASE_URL: url })).toBe(url);
  });

  it("requires a separate test URL rather than falling back to the application database", () => {
    expect(() => readDatabaseUrl("TEST_DATABASE_URL", {
      DATABASE_URL: "postgres://localhost/equinox",
    })).toThrow("TEST_DATABASE_URL is required");
  });

  it.each([
    "not a connection URL",
    "https://example:synthetic-password@localhost/equinox",
    "postgres://example:synthetic-password@localhost",
  ])("rejects invalid configuration without exposing its value", (value) => {
    let message = "";
    try {
      readDatabaseUrl("DATABASE_URL", { DATABASE_URL: value });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/^DATABASE_URL must be/);
    expect(message).not.toContain(value);
    expect(message).not.toContain("synthetic-password");
  });
});
