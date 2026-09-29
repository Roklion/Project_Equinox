import { randomUUID, scryptSync } from "node:crypto";
import { spawn } from "node:child_process";
import { Client } from "pg";
import { createDatabase } from "../src/persistence/database";
import { assertLoopbackDatabaseUrl } from "../src/persistence/demo-seed-config";
import { migrateDatabase } from "../src/persistence/migrate";
import { seedDemoPortfolio } from "../src/persistence/demo-seed";

const maintenanceUrl = process.env.TEST_DATABASE_URL;
if (!maintenanceUrl) throw new Error("TEST_DATABASE_URL is required for browser tests.");
assertLoopbackDatabaseUrl(maintenanceUrl);

const databaseName = `equinox_e2e_${randomUUID().replaceAll("-", "")}`;
const databaseUrl = new URL(maintenanceUrl);
databaseUrl.pathname = `/${databaseName}`;
const admin = new Client({ connectionString: maintenanceUrl, connectionTimeoutMillis: 5_000 });
const password = "synthetic-equinox-test-password";
const salt = "00000000000000000000000000000031";
const passwordHash = `scrypt$16384$8$1$${salt}$${scryptSync(password, Buffer.from(salt, "hex"), 32).toString("hex")}`;
let created = false;
let stopping = false;
let serverExited = false;
let server: ReturnType<typeof spawn> | undefined;

async function cleanup() {
  if (stopping) return;
  stopping = true;
  if (server && !serverExited) {
    server.kill();
    await new Promise<void>((resolve) => server!.once("exit", () => resolve()));
  }
  try {
    if (created) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}

async function main() {
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    const connection = createDatabase(databaseUrl.toString());
    try {
      await migrateDatabase(connection.db);
      await seedDemoPortfolio(connection.db);
    } finally {
      await connection.pool.end();
    }
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3100", "-H", "127.0.0.1"], {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "development", DATABASE_URL: databaseUrl.toString(), APP_PASSWORD_HASH: passwordHash,
        SESSION_SECRET: "31".repeat(32) },
    });
    server.once("exit", (code) => {
      serverExited = true;
      void cleanup().then(() => { process.exitCode = code || 1; });
    });
  } catch (error) {
    await cleanup();
    throw error;
  }
}

process.on("SIGINT", () => { void cleanup(); });
process.on("SIGTERM", () => { void cleanup(); });
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unable to start browser-test server.");
  process.exitCode = 1;
});
