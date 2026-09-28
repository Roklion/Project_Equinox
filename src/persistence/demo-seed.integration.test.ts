import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createPortfolioService } from "@/application/portfolio";
import { netMovementCents } from "@/domain/financial";
import { createDatabase } from "./database";
import { seedDemoPortfolio } from "./demo-seed";
import { readDatabaseUrl } from "./environment";
import { migrateDatabase } from "./migrate";
import { createPostgresPortfolioRepository } from "./records";
import { actions, households, investmentGroups, investmentOwners, investments, movements, valuationMarks } from "./schema";

vi.mock("server-only", () => ({}));

const databaseName = `equinox_test_${randomUUID().replaceAll("-", "")}`;
let admin: Client;
let connection: ReturnType<typeof createDatabase>;
let created = false;

beforeAll(async () => {
  const maintenanceUrl = readDatabaseUrl("TEST_DATABASE_URL");
  admin = new Client({ connectionString: maintenanceUrl, connectionTimeoutMillis: 5_000 });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  const testUrl = new URL(maintenanceUrl);
  testUrl.pathname = `/${databaseName}`;
  connection = createDatabase(testUrl.toString());
  await migrateDatabase(connection.db);
});

afterAll(async () => {
  try {
    await connection?.pool.end();
    if (created) await admin?.query(`DROP DATABASE "${databaseName}"`);
  } finally {
    await admin?.end();
  }
});

it("seeds a complete synthetic portfolio once through canonical writes", async () => {
  const { db } = connection;
  const [other] = await db.insert(households).values({ name: "Other sample household" }).returning();
  await expect(seedDemoPortfolio(db)).rejects.toThrow("empty household database");
  await db.delete(households).where(eq(households.id, other.id));
  expect(await seedDemoPortfolio(db)).toBe("created");
  const before = await db.execute(sql`select
    (select count(*) from investments) as investments,
    (select count(*) from actions) as actions,
    (select count(*) from movements) as movements,
    (select count(*) from valuation_marks) as marks`);
  expect(await seedDemoPortfolio(db)).toBe("already-seeded");
  const after = await db.execute(sql`select
    (select count(*) from investments) as investments,
    (select count(*) from actions) as actions,
    (select count(*) from movements) as movements,
    (select count(*) from valuation_marks) as marks`);
  expect(after.rows).toEqual(before.rows);

  const [additionalHousehold] = await db.insert(households).values({ name: "Another sample household" }).returning();
  await expect(seedDemoPortfolio(db)).rejects.toThrow("empty household database");
  await db.delete(households).where(eq(households.id, additionalHousehold.id));

  const [household] = await db.select().from(households);
  expect(household.name).toBe("Example Household");
  const allInvestments = await db.select().from(investments);
  expect(allInvestments).toHaveLength(5);
  const property = allInvestments.find((investment) => investment.name === "Sample Property Investment")!;
  expect(await db.select().from(investmentOwners).where(eq(investmentOwners.investmentId, property.id))).toHaveLength(2);
  expect(await db.select().from(investmentGroups)).toHaveLength(3);

  const history = await createPortfolioService(createPostgresPortfolioRepository(db))
    .getInvestmentHistory(household.id, property.id);
  expect(history.marks).toEqual(expect.arrayContaining([
    expect.objectContaining({ asOfDate: "2025-03-31", netValue: "-3000.00" }),
    expect.objectContaining({ asOfDate: "2025-06-30", netValue: "-1000.00" }),
  ]));
  const closed = allInvestments.find((investment) => investment.status === "closed")!;
  expect(closed.closedOn).toBe("2025-06-30");
  const closedHistory = await createPortfolioService(createPostgresPortfolioRepository(db))
    .getInvestmentHistory(household.id, closed.id);
  expect(closedHistory.movements).toHaveLength(2);
  expect(closedHistory.marks).toHaveLength(2);

  const transfer = (await db.select().from(actions).where(eq(actions.kind, "transfer")))[0];
  const legs = await db.select().from(movements).where(eq(movements.actionId, transfer.id));
  expect(legs).toHaveLength(2);
  expect(legs.map((leg) => leg.role).sort()).toEqual(["destination", "source"]);
  expect(legs.map((leg) => leg.direction).sort()).toEqual(["in", "out"]);
  expect(netMovementCents(legs.map((leg) => ({ ...leg, direction: leg.direction as "in" | "out" })),
    new Set(legs.map((leg) => leg.investmentId)))).toBe(0n);
  expect(await db.select().from(valuationMarks)).toHaveLength(10);
});
