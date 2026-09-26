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
