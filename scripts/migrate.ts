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

main().catch(() => {
  console.error("Migration failed. Check DATABASE_URL, database availability, and the pending migration SQL. Connection details are omitted.");
  process.exitCode = 1;
});
