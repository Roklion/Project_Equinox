import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createSettingsService, settingsDimensions } from "@/application/settings";
import { createPortfolioService } from "@/application/portfolio";
import { createDatabase } from "./database";
import { readDatabaseUrl } from "./environment";
import { migrateDatabase } from "./migrate";
import { createPostgresSettingsRepository } from "./settings";
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

it("administers an empty household without changing stable associations or financial history", async () => {
  const [home] = await connection.db.insert(households).values({ name: "Sample household" }).returning();
  const service = createSettingsService(createPostgresSettingsRepository(connection.db));
  const portfolio = createPortfolioService(createPostgresPortfolioRepository(connection.db));
  for (const rows of Object.values((await service.getSettings(home.id)).choices)) expect(rows).toEqual([]);
  for (const dimension of settingsDimensions) await service.write({ householdId: home.id, dimension, operation: "create", label: `Sample ${dimension}` });
  const choices = (await service.getSettings(home.id)).choices;
  const metadata = { householdId: home.id, name: "Sample investment", ownerIds: [choices.owners[0].id], groupIds: [choices.customGroups[0].id],
    assetClassId: choices.assetClasses[0].id, accountTypeId: choices.accountTypes[0].id, taxStatusId: choices.taxStatuses[0].id,
    liquidityId: choices.liquidities[0].id, institutionId: choices.institutions[0].id };
  const investment = await portfolio.createInvestment(metadata);
  await portfolio.recordExternalAction({ householdId: home.id, investmentId: investment.id, kind: "contribution", effectiveDate: "2026-01-01", amount: "10" });
  await portfolio.recordValuationMark({ householdId: home.id, investmentId: investment.id, asOfDate: "2026-01-02", grossValue: "20", debt: "30" });
  await portfolio.closeInvestment(home.id, investment.id, "2026-01-02");
  const beforeMetadata = await portfolio.getInvestmentMetadata(home.id, investment.id);
  const beforeHistory = await portfolio.getInvestmentHistory(home.id, investment.id);
  await service.write({ householdId: home.id, dimension: "household", operation: "rename", label: "Renamed sample household" });
  expect((await service.getSettings(home.id)).household).toEqual({ ...home, name: "Renamed sample household" });
  for (const dimension of settingsDimensions) {
    const id = choices[dimension][0].id;
    await service.write({ householdId: home.id, dimension, operation: "rename", id, label: `Renamed ${dimension}` });
    expect((await portfolio.getInvestmentChoices(home.id))[dimension]).toContainEqual({ id, label: `Renamed ${dimension}` });
    await expect(service.write({ householdId: home.id, dimension, operation: "remove", id })).rejects.toThrow("record_in_use");
    if (dimension !== "owners") {
      await expect(service.write({ householdId: home.id, dimension, operation: "create", label: ` Renamed ${dimension} ` })).rejects.toThrow("duplicate_label");
    }
    await service.write({ householdId: home.id, dimension, operation: "create", label: "Unused sample" });
    const unused = (await portfolio.getInvestmentChoices(home.id))[dimension].find((row) => row.label === "Unused sample")!;
    if (dimension !== "owners") await expect(service.write({ householdId: home.id, dimension, operation: "rename", id: unused.id, label: `Renamed ${dimension}` })).rejects.toThrow("duplicate_label");
    await service.write({ householdId: home.id, dimension, operation: "remove", id: unused.id });
    expect((await portfolio.getInvestmentChoices(home.id))[dimension]).toHaveLength(1);
    expect(await portfolio.getInvestmentMetadata(home.id, investment.id)).toEqual(beforeMetadata);
    expect(await portfolio.getInvestmentHistory(home.id, investment.id)).toEqual(beforeHistory);
  }
  // Duplicate owner labels are allowed by the canonical schema, retaining separate identities.
  await service.write({ householdId: home.id, dimension: "owners", operation: "create", label: "Renamed owners" });
  const ownerChoices = (await portfolio.getInvestmentChoices(home.id)).owners;
  expect(ownerChoices).toHaveLength(2);
  expect(new Set(ownerChoices.map((row) => row.id)).size).toBe(2);
  const secondOwner = ownerChoices.find((row) => row.id !== choices.owners[0].id)!;
  await service.write({ householdId: home.id, dimension: "owners", operation: "remove", id: secondOwner.id });
  // After explicit investment reassignment, previously referenced lookup records can be removed.
  const [replacementOwner] = await connection.db.insert(owners).values({ householdId: home.id, name: "Replacement owner" }).returning();
  await portfolio.editInvestment({ householdId: home.id, investmentId: investment.id, name: "Sample investment", ownerIds: [replacementOwner.id], groupIds: [] });
  for (const dimension of settingsDimensions) await service.write({ householdId: home.id, dimension, operation: "remove", id: choices[dimension][0].id });
  expect(await portfolio.getInvestmentHistory(home.id, investment.id)).toEqual(beforeHistory);
});

it("rejects cross-household and absent identities without mutating either household", async () => {
  const [home, foreign] = await connection.db.insert(households).values([{ name: "Local sample" }, { name: "Other sample" }]).returning();
  const service = createSettingsService(createPostgresSettingsRepository(connection.db));
  for (const dimension of settingsDimensions) await service.write({ householdId: foreign.id, dimension, operation: "create", label: "Foreign sample" });
  const before = await service.getSettings(foreign.id);
  for (const dimension of settingsDimensions) {
    for (const id of [before.choices[dimension][0].id, randomUUID()]) {
      await expect(service.write({ householdId: home.id, dimension, operation: "rename", id, label: "Changed" })).rejects.toThrow("invalid_association");
      await expect(service.write({ householdId: home.id, dimension, operation: "remove", id })).rejects.toThrow("invalid_association");
    }
    // Same label in a different household is not a duplicate.
    await service.write({ householdId: home.id, dimension, operation: "create", label: "Foreign sample" });
  }
  expect(await service.getSettings(foreign.id)).toEqual(before);
});
