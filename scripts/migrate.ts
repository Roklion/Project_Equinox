import nextEnv from "@next/env";
import { createDatabase } from "../src/persistence/database";
import { readDatabaseUrl } from "../src/persistence/environment";
import { migrateDatabase } from "../src/persistence/migrate";

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

async function main() {
  // Validate before creating a pool; do not print credentials on failure.
  const connectionString = readDatabaseUrl();
  const { db, pool } = createDatabase(connectionString);
  try {
    await migrateDatabase(db);
    console.info("Database migrations applied successfully.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  const code = cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string"
    ? ` [${cause.code}]`
    : "";
  const message = cause instanceof Error ? cause.message : "Unknown migration error";
  console.error(`Migration failed${code}: ${message}`);
  process.exitCode = 1;
});
