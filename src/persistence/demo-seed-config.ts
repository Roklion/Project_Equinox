import { Client } from "pg";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Validate the host node-postgres will use, including URL query overrides. */
export function assertLoopbackDatabaseUrl(connectionString: string): void {
  const effectiveHost = new Client({ connectionString }).host.toLowerCase();
  if (!loopbackHosts.has(effectiveHost)) {
    throw new Error("Demo seed requires a loopback PostgreSQL host.");
  }
}
