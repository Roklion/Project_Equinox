import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createHouseholdSetupService } from "@/application/setup";
import { createPortfolioService } from "@/application/portfolio";
import { createDatabase } from "./database";
import { readDatabaseUrl } from "./environment";
import { migrateDatabase } from "./migrate";
import { createPostgresHouseholdSetupRepository } from "./setup";
import { createPostgresPortfolioRepository } from "./records";
import { households, owners } from "./schema";

vi.mock("server-only", () => ({}));
const databaseName = "equinox_test_" + randomUUID().replaceAll("-", "");
let admin: Client;
let connection: ReturnType<typeof createDatabase>;
let created = false;
beforeAll(async () => {
  const maintenance = readDatabaseUrl("TEST_DATABASE_URL");
  admin = new Client({ connectionString: maintenance, connectionTimeoutMillis: 5000 });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  const url = new URL(maintenance); url.pathname = "/" + databaseName;
  connection = createDatabase(url.toString());
  await migrateDatabase(connection.db);
});
afterAll(async () => {
  await connection?.pool.end();
  try { if (created) await admin.query(`DROP DATABASE "${databaseName}"`); }
  finally { await admin?.end(); }
});
it("initializes an empty migrated database with one owner and permits unclassified investment creation", async () => {
  const service = createHouseholdSetupService(createPostgresHouseholdSetupRepository(connection.db));
  expect(await service.getState()).toEqual({ status: "empty" });
  expect(() => service.initialize({ name: "Sample", ownerNames: [] })).toThrow("owners_required");
  expect(await service.getState()).toEqual({ status: "empty" });
  const home = await service.initialize({ name: "Sample household", ownerNames: ["Owner A"] });
  const portfolio = createPortfolioService(createPostgresPortfolioRepository(connection.db));
  const choices = await portfolio.getInvestmentChoices(home.householdId);
  expect(choices.owners).toHaveLength(1);
  for (const [key, rows] of Object.entries(choices)) if (key !== "owners") expect(rows).toHaveLength(0);
  await portfolio.createInvestment({ householdId: home.householdId, name: "Sample investment", ownerIds: [choices.owners[0].id] });
  expect(await portfolio.getInvestments(home.householdId)).toHaveLength(1);
  expect(await service.initialize({ name: "Retry", ownerNames: ["Other owner"] })).toEqual(home);
  expect(await connection.db.select().from(owners)).toHaveLength(1);
});
it("writes multiple owners once across overlapping retries and rolls back failed setup", async () => {
  await connection.db.execute(sql`TRUNCATE households CASCADE`);
  const service = createHouseholdSetupService(createPostgresHouseholdSetupRepository(connection.db));
  const first = { name: "Sample household", ownerNames: ["Owner A", "Owner B"] };
  const [a, b] = await Promise.all([service.initialize(first), service.initialize(first)]);
  expect(a).toEqual(b);
  expect(await connection.db.select().from(households)).toHaveLength(1);
  const ownerRows = await connection.db.select().from(owners);
  expect(ownerRows).toHaveLength(2);
  expect(ownerRows.every((owner) => owner.householdId === a.householdId)).toBe(true);
  await connection.db.execute(sql`TRUNCATE households CASCADE`);
  // Exercise a real write failure after the household insert.
  const repository = createPostgresHouseholdSetupRepository(connection.db);
  await expect(repository.initialize({ name: "Rollback sample", ownerNames: [null as never] })).rejects.toThrow();
  expect(await service.getState()).toEqual({ status: "empty" });
});
it("does not select or mutate an unexpected multiple-household installation", async () => {
  await connection.db.insert(households).values([{ name: "Sample A" }, { name: "Sample B" }]);
  const service = createHouseholdSetupService(createPostgresHouseholdSetupRepository(connection.db));
  expect(await service.getState()).toEqual({ status: "inconsistent" });
  await expect(service.initialize({ name: "Third", ownerNames: ["A"] })).rejects.toThrow("household_inconsistent");
  expect(await connection.db.select().from(households)).toHaveLength(2);
  expect(await connection.db.select().from(owners)).toHaveLength(0);
});
