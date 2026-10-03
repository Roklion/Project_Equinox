import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createMigrationService, MigrationError } from "@/application/migration";
import { createAnalyticsService } from "@/application/analytics";
import { syntheticImport } from "@/migration/testing/normalized";
import type { ImportInput } from "@/application/migration-ports";
import { createDatabase } from "./database";
import { readDatabaseUrl } from "./environment";
import { migrateDatabase } from "./migrate";
import { createPostgresMigrationRepository } from "./migration";
import { createPostgresAnalyticsRepository } from "./analytics";
import { createInvestment } from "./records";
import { households, owners, investments, actions, movements, valuationMarks, investmentOwners, investmentGroups, assetClasses, customGroups } from "./schema";
vi.mock("server-only", () => ({}));
const databaseName = `equinox_test_${randomUUID().replaceAll("-","")}`;
let admin: Client | undefined;
let connection: ReturnType<typeof createDatabase> | undefined;
let created = false;
let input: ImportInput;
beforeAll(async () => {
  const url = readDatabaseUrl("TEST_DATABASE_URL");
  admin = new Client({connectionString:url,connectionTimeoutMillis:5000}); await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`); created = true;
  const target = new URL(url); target.pathname = `/${databaseName}`;
  connection = createDatabase(target.toString()); await migrateDatabase(connection.db);
});
beforeEach(async () => {
  const db = connection!.db;
  const [home] = await db.insert(households).values({name:"Synthetic migration household"}).returning();
  const [a,b] = await db.insert(owners).values([{householdId:home.id,name:"Synthetic Owner A"},{householdId:home.id,name:"Synthetic Owner B"}]).returning();
  input = syntheticImport(home.id,a.id,b.id);
});
afterAll(async () => {
  try {await connection?.pool.end(); if(created) await admin?.query(`DROP DATABASE "${databaseName}"`);}
  finally {await admin?.end();}
});
const service = () => createMigrationService(createPostgresMigrationRepository(connection!.db));
async function counts() {
  const db = connection!.db; const householdId = input.mapping.householdId;
  const result = [];
  for(const table of [investments,actions,movements,valuationMarks,investmentOwners,investmentGroups,assetClasses,customGroups]) result.push((await db.select().from(table).where(eq(table.householdId,householdId))).length);
  return result;
}
it("dry run writes nothing and successful mixed import preserves canonical semantics", async () => {
  const db = connection!.db; const householdId = input.mapping.householdId;
  const [lookup] = await db.insert(assetClasses).values({householdId,label:"Synthetic Asset"}).returning();
  const before = await counts(); const plan = await service().preflight(input);
  expect(plan.findings).toEqual([]); expect(plan.counts.classifications).toBe(1); expect(await counts()).toEqual(before);
  const manifest = await service().apply(input);
  expect(manifest.counts).toEqual(plan.counts); expect(Object.keys(manifest.ids)).toHaveLength(15);
  expect(await counts()).toEqual([3,6,7,6,4,1,1,1]);
  const imported = await db.select().from(investments).where(eq(investments.householdId,householdId));
  expect(imported.find(i => i.id === manifest.ids.a)?.assetClassId).toBe(lookup.id);
  expect(imported.find(i => i.id === manifest.ids.b)?.assetClassId).toBeNull();
  expect(imported.find(i => i.id === manifest.ids.c)).toMatchObject({status:"closed",closedOn:"2026-01-01"});
  const legs = await db.select().from(movements).where(eq(movements.actionId,manifest.ids.t));
  expect(legs).toHaveLength(2); expect(legs.map(l => [l.role,l.direction,l.amount]).sort()).toEqual([["destination","in","5.00"],["source","out","5.00"]]);
  expect(await db.select().from(valuationMarks).where(eq(valuationMarks.id,manifest.ids.vb))).toMatchObject([{grossValue:"4.00",debt:"9.00"}]);
  const analytics = createAnalyticsService(createPostgresAnalyticsRepository(db));
  expect((await analytics.inception(householdId,"2026-01-01")).pnl).toEqual({status:"available",value:-4300n});
  expect((await analytics.inception(householdId,"2026-01-01")).cashFlows).toMatchObject({contributionsCents:16000n,distributionsCents:3200n});
  const after = await counts();
  await expect(service().apply(input)).rejects.toBeInstanceOf(MigrationError); expect(await counts()).toEqual(after);
  input.mapping.investments = {a:manifest.ids.a,b:manifest.ids.b,c:manifest.ids.c};
  expect((await service().preflight(input)).findings.map(f => f.code)).toContain("existing_history");
  await expect(service().apply(input)).rejects.toThrow("preflight failed"); expect(await counts()).toEqual(after);
});
it("unresolved owner, missing target and lifecycle failures occur before any write", async () => {
  input.mapping.owners.a = randomUUID();
  expect((await service().preflight(input)).findings.map(f => f.code)).toContain("unresolved_owner");
  await expect(service().apply(input)).rejects.toThrow("preflight failed"); expect(await counts()).toEqual([0,0,0,0,0,0,0,0]);
  input.mapping.householdId = randomUUID();
  expect((await service().preflight(input)).findings.map(f => f.code)).toContain("target_missing");
});
it("rolls back classifications, links and financial writes when a late database write fails", async () => {
  const db = connection!.db;
  // A temporary synthetic-only constraint demonstrates a real late PostgreSQL failure.
  await db.execute(sql`ALTER TABLE valuation_marks ADD CONSTRAINT synthetic_late_failure CHECK (gross_value <> 4) NOT VALID`);
  try {
    expect((await service().preflight(input)).findings).toEqual([]);
    await expect(service().apply(input)).rejects.toThrow("Migration transaction failed; no records were imported.");
    expect(await counts()).toEqual([0,0,0,0,0,0,0,0]);
  } finally {await db.execute(sql`ALTER TABLE valuation_marks DROP CONSTRAINT synthetic_late_failure`);}
  expect((await service().apply(input)).counts.valuations).toBe(6);
});
it("requires explicit mapping in populated targets and permits a compatible empty target investment", async () => {
  const db = connection!.db; const householdId = input.mapping.householdId;
  const existing = await createInvestment(db,{householdId,name:"Synthetic preconfigured",ownerIds:[input.mapping.owners.a]});
  expect((await service().preflight(input)).findings.map(f => f.code)).toContain("explicit_investment_mapping_required");
  input.mapping.investments = {a:existing.id,b:null,c:null};
  const [group] = await db.insert(customGroups).values({householdId,label:"Synthetic Group"}).returning();
  input.mapping.classifications.customGroup = {group:{canonicalId:group.id}};
  expect((await service().preflight(input)).findings).toEqual([]);
  const manifest = await service().apply(input); expect(manifest.ids.a).toBe(existing.id); expect(manifest.counts.existingInvestments).toBe(1);
  expect(await counts()).toEqual([3,6,7,6,3,0,1,1]);
  // Existing metadata remains unchanged; only the explicitly approved empty history is populated.
  const [unchanged] = await db.select().from(investments).where(eq(investments.id,existing.id));
  expect(unchanged.name).toBe("Synthetic preconfigured");
});

it("resolves only explicit investment mappings for opaque source keys", async () => {
  input.mapping.investments = {};
  const originalKey = "a";
  const sourceKey = "constructor";
  for (const record of input.dataset.records) {
    if (record.sourceKey === originalKey) record.sourceKey = sourceKey;
    if ("investmentKey" in record && record.investmentKey === originalKey) record.investmentKey = sourceKey;
    if (record.kind === "transfer" && record.sourceInvestmentKey === originalKey) record.sourceInvestmentKey = sourceKey;
  }
  input.dataset.scopes[0].investmentKeys[0] = sourceKey;
  expect((await service().preflight(input)).findings).toEqual([]);
  const manifest = await service().apply(input);
  expect(typeof manifest.ids[sourceKey]).toBe("string");
  expect(await counts()).toEqual([3,6,7,6,4,1,1,1]);
  await expect(service().apply(input)).rejects.toThrow("preflight failed");
});
