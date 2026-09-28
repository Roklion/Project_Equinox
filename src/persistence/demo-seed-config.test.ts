import { describe, expect, it } from "vitest";
import { assertLoopbackDatabaseUrl } from "./demo-seed-config";

describe("demo seed database target", () => {
  it.each([
    "postgresql://example:synthetic-password@localhost:5433/equinox",
    "postgresql://example:synthetic-password@[::1]:5433/equinox",
  ])("accepts a loopback host", (connectionString) => {
    expect(() => assertLoopbackDatabaseUrl(connectionString)).not.toThrow();
  });

  it("rejects a non-loopback host supplied through the node-postgres host override", () => {
    expect(() => assertLoopbackDatabaseUrl(
      "postgresql://example:synthetic-password@localhost/equinox?host=remote.example",
    )).toThrow("Demo seed requires a loopback PostgreSQL host.");
  });

  it("rejects a non-loopback URL hostname", () => {
    expect(() => assertLoopbackDatabaseUrl(
      "postgresql://example:synthetic-password@remote.example/equinox",
    )).toThrow("Demo seed requires a loopback PostgreSQL host.");
  });
});
