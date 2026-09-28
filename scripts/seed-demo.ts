import nextEnv from "@next/env";
import { createDatabase } from "../src/persistence/database";
import { readDatabaseUrl } from "../src/persistence/environment";
import { assertLoopbackDatabaseUrl } from "../src/persistence/demo-seed-config";
import { seedDemoPortfolio } from "../src/persistence/demo-seed";

nextEnv.loadEnvConfig(process.cwd(), true);

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo seed is disabled in production.");
  const connectionString = readDatabaseUrl();
  assertLoopbackDatabaseUrl(connectionString);
  const { db, pool } = createDatabase(connectionString);
  try {
    const result = await seedDemoPortfolio(db);
    console.info(result === "created" ? "Synthetic demo portfolio seeded." : "Synthetic demo portfolio already exists.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Demo seed failed. Check that the local database is migrated and contains no other household data.");
  console.error(error instanceof Error ? error.message : "Unknown seed error.");
  process.exitCode = 1;
});
