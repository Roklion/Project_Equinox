import nextEnv from "@next/env";
import { createDatabase } from "../src/persistence/database";
import { readDatabaseUrl } from "../src/persistence/environment";
import { seedDemoPortfolio } from "../src/persistence/demo-seed";

nextEnv.loadEnvConfig(process.cwd(), true);

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo seed is disabled in production.");
  const connectionString = readDatabaseUrl();
  const url = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Demo seed requires a loopback PostgreSQL host.");
  }
  const { db, pool } = createDatabase(connectionString);
  try {
    const result = await seedDemoPortfolio(db);
    console.info(result === "created" ? "Synthetic demo portfolio seeded." : "Synthetic demo portfolio already exists.");
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error("Demo seed failed. Check that the local database is migrated and contains no other household data.");
  process.exitCode = 1;
});
