import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabase } from "@/persistence/database";
import { readDatabaseUrl } from "@/persistence/environment";
import { migrateDatabase, migrationsFolder } from "@/persistence/migrate";

// Vitest runs outside Next.js. Only the framework marker is stubbed, not pg/SQL.
vi.mock("server-only", () => ({}));

describe("PostgreSQL persistence", () => {
  const databaseName = `equinox_test_${randomUUID().replaceAll("-", "")}`;
  let admin: Client | undefined;
  let connection: ReturnType<typeof createDatabase> | undefined;
  let created = false;

  beforeAll(async () => {
    const maintenanceUrl = readDatabaseUrl("TEST_DATABASE_URL");
    admin = new Client({ connectionString: maintenanceUrl, connectionTimeoutMillis: 5_000 });
    await admin.connect();
    // The name is generated here, never taken from user input or an existing DB.
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    const testUrl = new URL(maintenanceUrl);
    testUrl.pathname = `/${databaseName}`;
    connection = createDatabase(testUrl.toString());
  });

  afterAll(async () => {
    try {
      await connection?.pool.end();
      if (created) await admin?.query(`DROP DATABASE "${databaseName}"`);
    } finally {
      await admin?.end();
    }
  });

  it("connects to a fresh database and applies committed migrations once", async () => {
    const { db } = connection!;
    const result = await db.execute<{ name: string }>(sql`select current_database() as name`);
    expect(result.rows[0].name).toBe(databaseName);

    await migrateDatabase(db);
    const first = await db.execute(sql`select hash, created_at from drizzle.__drizzle_migrations order by id`);
    const migrations = readMigrationFiles({ migrationsFolder });
    expect(migrations.length).toBeGreaterThan(0);
    expect(first.rows.map((row) => row.hash)).toEqual(migrations.map((migration) => migration.hash));

    await migrateDatabase(db);
    const second = await db.execute(sql`select hash, created_at from drizzle.__drizzle_migrations order by id`);
    expect(second.rows).toEqual(first.rows);
  });
});
