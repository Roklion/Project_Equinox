import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readDatabaseUrl } from "./environment";
import * as schema from "./schema";

/** The caller owns the pool: reuse it for workflows, then end it on shutdown. */
export function createDatabase(connectionString = readDatabaseUrl()) {
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
  });

  // pg emits background connection errors when, for example, Postgres restarts.
  // Do not log the driver error, which can contain connection details.
  pool.on("error", () => {
    console.error("An idle PostgreSQL connection failed.");
  });

  return { db: drizzle(pool, { schema }), pool };
}

const globalForDatabase = globalThis as typeof globalThis & {
  equinoxDatabase?: ReturnType<typeof createDatabase>;
};

/** Reuse one database pool across requests in this server runtime. */
export function getDatabase() {
  globalForDatabase.equinoxDatabase ??= createDatabase();
  return globalForDatabase.equinoxDatabase;
}
