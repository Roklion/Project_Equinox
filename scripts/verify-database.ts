import nextEnv from "@next/env";
import { sql } from "drizzle-orm";
import { createDatabase } from "../src/persistence/database";
import { readDatabaseUrl } from "../src/persistence/environment";

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

async function main() {
  const { db, pool } = createDatabase(readDatabaseUrl());
  try {
    await db.transaction(async (tx) => {
      // A session-local table proves write/read behavior without changing app data.
      await tx.execute(sql`create temporary table equinox_connection_check
        (label text not null, amount_cents integer not null) on commit drop`);
      await tx.execute(sql`insert into equinox_connection_check (label, amount_cents)
        values ('Synthetic investment', 12345)`);
      const result = await tx.execute<{ label: string; amount_cents: number }>(
        sql`select label, amount_cents from equinox_connection_check`,
      );
      if (result.rows.length !== 1 ||
          result.rows[0].label !== "Synthetic investment" ||
          result.rows[0].amount_cents !== 12345) {
        throw new Error("Synthetic database read/write check failed.");
      }
    });
    console.info("Server-side PostgreSQL synthetic read/write check passed.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Driver errors may contain connection details; never print them here.
  const safeMessages = new Set([
    "DATABASE_URL is required for database operations.",
    "DATABASE_URL must be a valid PostgreSQL connection URL.",
    "DATABASE_URL must be a PostgreSQL URL with a host and database name.",
    "Synthetic database read/write check failed.",
  ]);
  const message = error instanceof Error && safeMessages.has(error.message)
    ? error.message
    : "Server-side PostgreSQL synthetic read/write check failed.";
  console.error(message);
  process.exitCode = 1;
});
