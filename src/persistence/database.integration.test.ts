import { canonicalSources, endDate, expectedHousehold, fixtureId, groupA, groupB, ids, middleDate, ownerA, ownerB, startDate } from "@/domain/analytics/testing/canonical-fixture";
import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAnalyticsService } from "@/application/analytics";
import { createPostgresAnalyticsRepository } from "@/persistence/analytics";
import { createPortfolioService } from "@/application/portfolio";
import { createDatabase } from "@/persistence/database";
import { readDatabaseUrl } from "@/persistence/environment";
import { migrateDatabase, migrationsFolder } from "@/persistence/migrate";
import { createInvestment, closeInvestment, createPostgresPortfolioRepository, deleteValuationMark, editExternalAction, editTransfer, recordExternalAction, recordTransfer, recordValuationMark, saveValuationBatch } from "@/persistence/records";
import { accountTypes, actions, assetClasses, customGroups, investmentGroups, households, institutions, investmentOwners, investments, liquidities, movements, owners, taxStatuses, valuationMarks } from "@/persistence/schema";

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

  it("keeps ownership and classification within a household, including after closure", async () => {
    const { db } = connection!;
    const [home, other] = await db.insert(households).values([
      { name: "Sample household" }, { name: "Other sample household" },
    ]).returning();
    const [first, second, outsider] = await db.insert(owners).values([
      { householdId: home.id, name: "Owner A" },
      { householdId: home.id, name: "Owner B" },
      { householdId: other.id, name: "Owner C" },
    ]).returning();
    const [assetClass] = await db.insert(assetClasses).values({ householdId: home.id, label: "Other asset" }).returning();
    const [otherClass] = await db.insert(assetClasses).values({ householdId: other.id, label: "Other category" }).returning();
    const investment = await createInvestment(db, {
      householdId: home.id, name: "Sample investment", ownerIds: [first.id, second.id], assetClassId: assetClass.id,
    });
    expect(await db.select().from(investmentOwners).where(eq(investmentOwners.investmentId, investment.id))).toHaveLength(2);
    await db.update(assetClasses).set({ label: "Renamed asset" }).where(eq(assetClasses.id, assetClass.id));
    const [unchanged] = await db.select().from(investments).where(eq(investments.id, investment.id));
    expect(unchanged.assetClassId).toBe(assetClass.id);
    await expect(createInvestment(db, {
      householdId: home.id, name: "Invalid owner", ownerIds: [outsider.id],
    })).rejects.toThrow();
    await expect(createInvestment(db, {
      householdId: home.id, name: "Invalid classification", ownerIds: [first.id], assetClassId: otherClass.id,
    })).rejects.toThrow();
    await expect(db.insert(investments).values({ householdId: home.id, name: "Ownerless" })).rejects.toThrow();

    await recordExternalAction(db, { householdId: home.id, investmentId: investment.id,
      kind: "contribution", effectiveDate: "2026-01-02", amount: "10.25" });
    await recordExternalAction(db, { householdId: home.id, investmentId: investment.id,
      kind: "withdrawal", effectiveDate: "2026-01-03", amount: "2.00" });
    await recordValuationMark(db, { householdId: home.id, investmentId: investment.id,
      asOfDate: "2026-01-02", grossValue: "12.00" });
    await expect(closeInvestment(db, home.id, investment.id, "2026-01-01")).rejects.toThrow();
    await closeInvestment(db, home.id, investment.id, "2026-01-04");
    expect(await db.select().from(actions)).toHaveLength(2);
    expect(await db.select().from(valuationMarks).where(eq(valuationMarks.investmentId, investment.id))).toHaveLength(1);
    const history = await createPortfolioService(createPostgresPortfolioRepository(db))
      .getInvestmentHistory(home.id, investment.id);
    expect(history.movements).toEqual([
      expect.objectContaining({ kind: "contribution", effectiveDate: "2026-01-02", direction: "in", amount: "10.25" }),
      expect.objectContaining({ kind: "withdrawal", effectiveDate: "2026-01-03", direction: "out", amount: "2.00" }),
    ]);
    expect(history.marks).toEqual([expect.objectContaining({
      asOfDate: "2026-01-02", grossValue: "12.00", debt: "0.00", netValue: "12.00",
    })]);
    await expect(recordExternalAction(db, { householdId: home.id, investmentId: investment.id,
      kind: "contribution", effectiveDate: "2026-01-05", amount: "1.00" })).rejects.toThrow();
  });

  it("writes complete transfer legs atomically and keeps marks separate", async () => {
    const { db } = connection!;
    const [home] = await db.insert(households).values({ name: "Transfer sample" }).returning();
    const [owner] = await db.insert(owners).values({ householdId: home.id, name: "Owner" }).returning();
    const source = await createInvestment(db, { householdId: home.id, name: "Source", ownerIds: [owner.id] });
    const destination = await createInvestment(db, { householdId: home.id, name: "Destination", ownerIds: [owner.id] });
    const transfer = await recordTransfer(db, { householdId: home.id, sourceInvestmentId: source.id,
      destinationInvestmentId: destination.id, effectiveDate: "2026-02-03", amount: "125.25" });
    expect(await db.select({ role: movements.role, direction: movements.direction, amount: movements.amount })
      .from(movements).where(eq(movements.actionId, transfer.id)).orderBy(asc(movements.role))).toEqual([
      { role: "destination", direction: "in", amount: "125.25" },
      { role: "source", direction: "out", amount: "125.25" },
    ]);
    await expect(recordTransfer(db, { householdId: home.id, sourceInvestmentId: source.id,
      destinationInvestmentId: source.id, effectiveDate: "2026-02-04", amount: "1.00" })).rejects.toThrow();
    const beforeMalformed = await db.select({ id: actions.id }).from(actions).where(eq(actions.householdId, home.id));
    await expect(db.transaction(async (tx) => {
      const [partial] = await tx.insert(actions).values({ householdId: home.id, kind: "transfer",
        effectiveDate: "2026-02-04", amount: "2.00" }).returning();
      await tx.insert(movements).values({ householdId: home.id, actionId: partial.id,
        investmentId: source.id, role: "source", direction: "out", amount: "2.00" });
    })).rejects.toThrow();
    expect(await db.select({ id: actions.id }).from(actions).where(eq(actions.householdId, home.id)))
      .toEqual(beforeMalformed);
    await expect(db.insert(actions).values({ householdId: home.id, kind: "transfer",
      effectiveDate: "2026-02-04", amount: "2.00" })).rejects.toThrow();

    const mark = await recordValuationMark(db, { householdId: home.id, investmentId: source.id,
      asOfDate: "2026-02-04", grossValue: "100.00", debt: "125.25" });
    expect(mark.grossValue).toBe("100.00");
    expect(await db.select().from(actions).where(eq(actions.id, transfer.id))).toHaveLength(1);
    await expect(recordValuationMark(db, { householdId: home.id, investmentId: source.id,
      asOfDate: "2026-02-04", grossValue: "101.00" })).rejects.toThrow();
    expect(await db.select().from(valuationMarks).where(eq(valuationMarks.investmentId, source.id))).toHaveLength(1);
  });

  it("allows historical backfills on closed investments but rejects activity after closure", async () => {
    const { db } = connection!;
    const service = createPortfolioService(createPostgresPortfolioRepository(db));
    const [home] = await db.insert(households).values({ name: "Historical backfill sample" }).returning();
    const [owner] = await db.insert(owners).values({ householdId: home.id, name: "Owner" }).returning();
    const closed = await service.createInvestment({ householdId: home.id, name: "Closed sample", ownerIds: [owner.id] });
    const active = await service.createInvestment({ householdId: home.id, name: "Active sample", ownerIds: [owner.id] });
    await service.closeInvestment(home.id, closed.id, "2026-05-10");

    await service.recordExternalAction({ householdId: home.id, investmentId: closed.id,
      kind: "contribution", effectiveDate: "2026-05-09", amount: "10.00" });
    await service.recordTransfer({ householdId: home.id, sourceInvestmentId: closed.id,
      destinationInvestmentId: active.id, effectiveDate: "2026-05-10", amount: "3.00" });
    await service.recordValuationMark({ householdId: home.id, investmentId: closed.id,
      asOfDate: "2026-05-08", grossValue: "20.00" });

    const history = await service.getInvestmentHistory(home.id, closed.id);
    expect(history.movements).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "contribution", effectiveDate: "2026-05-09" }),
      expect.objectContaining({ kind: "transfer", effectiveDate: "2026-05-10", role: "source" }),
    ]));
    expect(history.marks).toEqual([expect.objectContaining({ asOfDate: "2026-05-08", grossValue: "20.00" })]);

    await expect(service.recordExternalAction({ householdId: home.id, investmentId: closed.id,
      kind: "contribution", effectiveDate: "2026-05-11", amount: "1.00" })).rejects.toThrow();
    await expect(service.recordTransfer({ householdId: home.id, sourceInvestmentId: closed.id,
      destinationInvestmentId: active.id, effectiveDate: "2026-05-11", amount: "1.00" })).rejects.toThrow();
    await expect(service.recordValuationMark({ householdId: home.id, investmentId: closed.id,
      asOfDate: "2026-05-11", grossValue: "21.00" })).rejects.toThrow();
  });

  it("corrects one historical mark in place through the application boundary", async () => {
    const { db } = connection!;
    const service = createPortfolioService(createPostgresPortfolioRepository(db));
    const [home] = await db.insert(households).values({ name: "Correction sample" }).returning();
    const [owner] = await db.insert(owners).values({ householdId: home.id, name: "Owner" }).returning();
    const investment = await service.createInvestment({ householdId: home.id, name: "Sample holding", ownerIds: [owner.id] });
    const original = await service.recordValuationMark({ householdId: home.id, investmentId: investment.id,
      asOfDate: "2026-04-01", grossValue: "100.00", debt: "25.00",
      source: "manual", sourceReference: "synthetic-ref", notes: "Synthetic note" });
    await service.closeInvestment(home.id, investment.id, "2026-04-02");
    const replacement = await service.replaceValuationMark({ householdId: home.id, investmentId: investment.id,
      asOfDate: "2026-04-01", grossValue: "110.00", source: null, sourceReference: null, notes: null });
    expect(replacement.id).toBe(original.id);
    const history = await service.getInvestmentHistory(home.id, investment.id);
    expect(history.marks).toEqual([expect.objectContaining({ id: original.id, asOfDate: "2026-04-01",
      grossValue: "110.00", debt: "25.00", netValue: "85.00",
      source: null, sourceReference: null, notes: null })]);
    expect(history.movements).toEqual([]);
    await expect(service.recordValuationMark({ householdId: home.id, investmentId: investment.id,
      asOfDate: "2026-04-01", grossValue: "1.00" })).rejects.toThrow();
    await expect(service.replaceValuationMark({ householdId: home.id, investmentId: investment.id,
      asOfDate: "2026-04-02", grossValue: "1.00" })).rejects.toThrow();
  });

  it("edits and deletes external actions and whole transfers without orphan legs", async () => {
    const { db } = connection!;
    const service = createPortfolioService(createPostgresPortfolioRepository(db));
    const [home] = await db.insert(households).values({ name: "Workflow actions" }).returning();
    const [owner] = await db.insert(owners).values({ householdId: home.id, name: "Owner" }).returning();
    const a = await service.createInvestment({ householdId: home.id, name: "A", ownerIds: [owner.id] });
    const b = await service.createInvestment({ householdId: home.id, name: "B", ownerIds: [owner.id] });
    const c = await service.createInvestment({ householdId: home.id, name: "C", ownerIds: [owner.id] });
    const external = await service.recordExternalAction({ householdId: home.id, investmentId: a.id,
      kind: "contribution", effectiveDate: "2026-06-01", amount: "10", notes: "Synthetic original" });
    await service.editExternalAction({ householdId: home.id, actionId: external.id, investmentId: b.id,
      kind: "withdrawal", effectiveDate: "2026-06-02", amount: "4.50", notes: "Synthetic correction" });
    expect((await service.getInvestmentHistory(home.id, a.id)).movements).toHaveLength(0);
    expect((await service.getInvestmentHistory(home.id, b.id)).movements).toEqual([
      expect.objectContaining({ actionId: external.id, kind: "withdrawal", direction: "out", amount: "4.50" }),
    ]);
    await expect(editExternalAction(db, { householdId: home.id, actionId: external.id, investmentId: b.id,
      kind: "withdrawal", effectiveDate: "2026-06-02", amount: "4.505" })).rejects.toThrow();
    expect(await db.select({ amount: actions.amount }).from(actions).where(eq(actions.id, external.id)))
      .toEqual([{ amount: "4.50" }]);
    expect(await db.select({ amount: movements.amount }).from(movements).where(eq(movements.actionId, external.id)))
      .toEqual([{ amount: "4.50" }]);
    const transfer = await service.recordTransfer({ householdId: home.id, sourceInvestmentId: a.id,
      destinationInvestmentId: b.id, effectiveDate: "2026-06-03", amount: "3" });
    await service.editTransfer({ householdId: home.id, actionId: transfer.id, sourceInvestmentId: b.id,
      destinationInvestmentId: c.id, effectiveDate: "2026-06-04", amount: "5" });
    expect(await db.select({ investmentId: movements.investmentId, direction: movements.direction, amount: movements.amount })
      .from(movements).where(eq(movements.actionId, transfer.id)).orderBy(asc(movements.role))).toEqual([
      { investmentId: c.id, direction: "in", amount: "5.00" },
      { investmentId: b.id, direction: "out", amount: "5.00" },
    ]);
    expect((await service.getInvestmentHistory(home.id, b.id)).movements).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionId: transfer.id, counterpartyInvestmentId: c.id }),
    ]));
    await expect(editTransfer(db, { householdId: home.id, actionId: transfer.id, sourceInvestmentId: b.id,
      destinationInvestmentId: c.id, effectiveDate: "2026-06-04", amount: "5.005" })).rejects.toThrow();
    expect(await db.select({ amount: actions.amount }).from(actions).where(eq(actions.id, transfer.id)))
      .toEqual([{ amount: "5.00" }]);
    expect(await db.select({ role: movements.role, amount: movements.amount }).from(movements)
      .where(eq(movements.actionId, transfer.id)).orderBy(asc(movements.role))).toEqual([
      { role: "destination", amount: "5.00" }, { role: "source", amount: "5.00" },
    ]);
    await service.closeInvestment(home.id, b.id, "2026-06-04");
    await service.editExternalAction({ householdId: home.id, actionId: external.id, investmentId: b.id,
      kind: "withdrawal", effectiveDate: "2026-06-02", amount: "4", notes: null });
    expect((await service.getInvestmentHistory(home.id, b.id)).movements).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionId: external.id, notes: null }),
    ]));
    await expect(service.editTransfer({ householdId: home.id, actionId: transfer.id, sourceInvestmentId: b.id,
      destinationInvestmentId: c.id, effectiveDate: "2026-06-05", amount: "5" }))
      .rejects.toMatchObject({ code: "investment_unavailable" });
    expect((await db.select().from(movements).where(eq(movements.actionId, transfer.id)))).toHaveLength(2);
    await service.deleteExternalAction(home.id, external.id);
    await service.deleteTransfer(home.id, transfer.id);
    expect(await db.select().from(actions).where(eq(actions.householdId, home.id))).toHaveLength(0);
    expect(await db.select().from(movements).where(eq(movements.householdId, home.id))).toHaveLength(0);
    await expect(service.deleteTransfer(home.id, transfer.id)).rejects.toMatchObject({ code: "action_not_found" });
  });

  it("validates a batch before writes and rolls back a failed write", async () => {
    const { db } = connection!;
    const service = createPortfolioService(createPostgresPortfolioRepository(db));
    const [home] = await db.insert(households).values({ name: "Batch valuation" }).returning();
    const [owner] = await db.insert(owners).values({ householdId: home.id, name: "Owner" }).returning();
    const [assetClass] = await db.insert(assetClasses).values({ householdId: home.id, label: "Example class" }).returning();
    const [institution] = await db.insert(institutions).values({ householdId: home.id, label: "Example institution" }).returning();
    const a = await service.createInvestment({ householdId: home.id, name: "Same name", ownerIds: [owner.id],
      assetClassId: assetClass.id, institutionId: institution.id });
    const b = await service.createInvestment({ householdId: home.id, name: "Same name", ownerIds: [owner.id] });
    const c = await service.createInvestment({ householdId: home.id, name: "C", ownerIds: [owner.id] });
    const prior = await service.recordValuationMark({ householdId: home.id, investmentId: b.id,
      asOfDate: "2026-06-01", grossValue: "10" });
    const old = await service.recordValuationMark({ householdId: home.id, investmentId: b.id,
      asOfDate: "2026-07-01", grossValue: "20", debt: "25" });
    await service.closeInvestment(home.id, c.id, "2026-07-01");
    // The database also rejects a close date before an existing later mark. The
    // batch still checks lifecycle before the missing-mark correction result.
    await expect(service.saveValuationBatch({ householdId: home.id, asOfDate: "2026-07-02", rows: [
      { operation: "create", investmentId: a.id, grossValue: "10" },
      { operation: "replace", investmentId: c.id, grossValue: "50" },
    ] })).rejects.toMatchObject({ code: "investment_unavailable" });
    expect(await db.select().from(valuationMarks).where(eq(valuationMarks.investmentId, a.id))).toHaveLength(0);
    expect(await db.select().from(valuationMarks).where(eq(valuationMarks.investmentId, c.id))).toHaveLength(0);
    await expect(service.saveValuationBatch({ householdId: home.id, asOfDate: "2026-07-02", rows: [
      { operation: "create", investmentId: a.id, grossValue: "10" },
      { operation: "create", investmentId: c.id, grossValue: "10" },
    ] })).rejects.toMatchObject({ code: "investment_unavailable" });
    expect(await db.select().from(valuationMarks).where(eq(valuationMarks.investmentId, a.id))).toHaveLength(0);
    await expect(service.saveValuationBatch({ householdId: home.id, asOfDate: "2026-07-01", rows: [
      { operation: "create", investmentId: a.id, grossValue: "10" },
      { operation: "create", investmentId: b.id, grossValue: "30" },
    ] })).rejects.toMatchObject({ code: "mark_already_exists" });
    expect(await db.select().from(valuationMarks).where(eq(valuationMarks.investmentId, a.id))).toHaveLength(0);
    await expect(saveValuationBatch(db, { householdId: home.id, asOfDate: "2026-07-01", rows: [
      { operation: "create", investmentId: a.id, grossValue: "10" },
      { operation: "create", investmentId: c.id, grossValue: "10000000000000000" },
    ] })).rejects.toThrow();
    expect(await db.select().from(valuationMarks).where(eq(valuationMarks.investmentId, a.id))).toHaveLength(0);
    const saved = await service.saveValuationBatch({ householdId: home.id, asOfDate: "2026-07-01", rows: [
      { operation: "create", investmentId: a.id, grossValue: "10", debt: "12" },
      { operation: "replace", investmentId: b.id, grossValue: "30" },
    ] });
    expect(saved).toHaveLength(2);
    expect(saved[1].id).toBe(old.id);
    const latest = await service.getLatestValuationMarks(home.id);
    expect(latest).toEqual(expect.arrayContaining([
      expect.objectContaining({ investmentId: a.id, netValue: "-2.00" }),
      expect.objectContaining({ investmentId: b.id, netValue: "5.00" }),
    ]));
    const corrected = await service.editValuationMark({ householdId: home.id, investmentId: b.id,
      originalAsOfDate: "2026-06-01", asOfDate: "2026-06-02", grossValue: "8", debt: "12" });
    expect(corrected.id).toBe(prior.id);
    await expect(service.editValuationMark({ householdId: home.id, investmentId: b.id,
      originalAsOfDate: "2026-06-02", asOfDate: "2026-07-01", grossValue: "9", debt: "0" }))
      .rejects.toMatchObject({ code: "mark_already_exists" });
    expect((await service.getInvestmentHistory(home.id, b.id)).marks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: prior.id, asOfDate: "2026-06-02", netValue: "-4.00" }),
      expect.objectContaining({ id: old.id, asOfDate: "2026-07-01", netValue: "5.00" }),
    ]));
    await expect(deleteValuationMark(db, home.id, a.id, "2026-7-1")).rejects.toThrow();
    expect(await db.select({ id: valuationMarks.id }).from(valuationMarks).where(eq(valuationMarks.id, saved[0].id)))
      .toEqual([{ id: saved[0].id }]);
    const context = await service.previewValuationDelta(home.id, b.id, "2026-07-02", "25", "40");
    expect(context).toMatchObject({ previous: { id: old.id, netValue: "5.00" },
      enteredNetValue: "-15.00", enteredDelta: "-20.00" });
    const eligible = await service.getEligibleInvestments(home.id, "2026-07-02");
    expect(eligible.map(({ id }) => id)).toEqual([a.id, b.id].sort());
    expect(eligible).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: a.id, assetClass: "Example class", institution: "Example institution" }),
      expect.objectContaining({ id: b.id, assetClass: null, institution: null }),
    ]));
    expect(eligible).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: c.id })]));
    await expect(service.getValuationContext(home.id, b.id, "2026-07-01")).resolves.toMatchObject({
      existing: { id: old.id }, previous: { id: prior.id },
    });
    await service.deleteValuationMark(home.id, a.id, "2026-07-01");
    await expect(service.deleteValuationMark(home.id, a.id, "2026-07-01"))
      .rejects.toMatchObject({ code: "mark_not_found" });
  });
  it("reads household-scoped canonical analytics without association fan-out and recomputes corrected marks", async () => {
    const { db } = connection!;
    const [home, other] = await db.insert(households).values([
      { name: "Analytics sample" }, { name: "Other analytics sample" },
    ]).returning();
    const [a, b, outsider] = await db.insert(owners).values([
      { householdId: home.id, name: "Owner A" }, { householdId: home.id, name: "Owner B" },
      { householdId: other.id, name: "Other owner" },
    ]).returning();
    const [assetClass] = await db.insert(assetClasses).values({ householdId: home.id, label: "Example class" }).returning();
    const [g1, g2] = await db.insert(customGroups).values([
      { householdId: home.id, label: "Group 1" }, { householdId: home.id, label: "Group 2" },
    ]).returning();
    const joint = await createInvestment(db, { householdId: home.id, name: "Joint example",
      ownerIds: [b.id, a.id], assetClassId: assetClass.id });
    const solo = await createInvestment(db, { householdId: home.id, name: "Solo example", ownerIds: [a.id] });
    const missing = await createInvestment(db, { householdId: home.id, name: "Future-only example", ownerIds: [a.id] });
    const foreign = await createInvestment(db, { householdId: other.id, name: "Other example", ownerIds: [outsider.id] });
    await db.insert(investmentGroups).values([
      { householdId: home.id, investmentId: joint.id, groupId: g1.id },
      { householdId: home.id, investmentId: joint.id, groupId: g2.id },
    ]);
    const workflow = createPortfolioService(createPostgresPortfolioRepository(db));
    await workflow.recordValuationMark({ householdId: home.id, investmentId: joint.id,
      asOfDate: "2026-01-01", grossValue: "10.01", debt: "20.02" });
    await workflow.recordValuationMark({ householdId: home.id, investmentId: solo.id,
      asOfDate: "2026-01-02", grossValue: "30.03" });
    await workflow.recordValuationMark({ householdId: home.id, investmentId: missing.id,
      asOfDate: "2026-02-01", grossValue: "100" });
    await workflow.recordValuationMark({ householdId: other.id, investmentId: foreign.id,
      asOfDate: "2026-01-01", grossValue: "999" });
    await workflow.closeInvestment(home.id, joint.id, "2026-01-03");
    const repository = createPostgresAnalyticsRepository(db);
    const sources = await repository.getSnapshotSources(home.id, "2026-01-02");
    expect(sources.investments).toHaveLength(3);
    expect(sources.marks).toHaveLength(2);
    expect(sources.investments.find((item) => item.id === joint.id)).toMatchObject({
      status: "closed", closedOn: "2026-01-03",
      classifications: { assetClass: { id: assetClass.id, label: "Example class" }, accountType: null },
    });
    const service = createAnalyticsService(repository);
    const incomplete = await service.snapshot(home.id, "2026-01-02");
    expect(incomplete.totals).toEqual({ status: "incomplete", reason: "missing_valuation",
      missingInvestmentIds: [missing.id] });
    const selected = await service.snapshot(home.id, "2026-01-02", { investmentIds: [joint.id, solo.id] }, "ownerSet");
    expect(selected.totals).toEqual({ status: "available",
      value: { grossValueCents: 4004n, debtCents: 2002n, navCents: 2002n } });
    expect(selected.breakdown?.flatMap((bucket) => bucket.investmentIds).sort()).toEqual([joint.id, solo.id].sort());
    const groupScope = await service.snapshot(home.id, "2026-01-02", { customGroupIds: [g1.id, g2.id] });
    expect(groupScope.coverage.selectedCount).toBe(1);
    expect(groupScope.totals).toEqual({ status: "available",
      value: { grossValueCents: 1001n, debtCents: 2002n, navCents: -1001n } });
    await workflow.replaceValuationMark({ householdId: home.id, investmentId: joint.id,
      asOfDate: "2026-01-01", grossValue: "25.02" });
    expect((await service.snapshot(home.id, "2026-01-02", { investmentIds: [joint.id] })).totals)
      .toEqual({ status: "available", value: { grossValueCents: 2502n, debtCents: 2002n, navCents: 500n } });
    await workflow.deleteValuationMark(home.id, joint.id, "2026-01-01");
    expect((await service.snapshot(home.id, "2026-01-02", { investmentIds: [joint.id] })).totals.status).toBe("incomplete");
  });
  it("reads complete household actions and recomputes boundary flows and P&L after corrections", async () => {
    const { db } = connection!;
    const [home, other] = await db.insert(households).values([
      { name: "Cash-flow example" }, { name: "Other cash-flow example" },
    ]).returning();
    const [ownerA, ownerB, outsider] = await db.insert(owners).values([
      { householdId: home.id, name: "Owner A" }, { householdId: home.id, name: "Owner B" },
      { householdId: other.id, name: "Other owner" },
    ]).returning();
    const workflow = createPortfolioService(createPostgresPortfolioRepository(db));
    const a = await workflow.createInvestment({ householdId: home.id, name: "Joint example", ownerIds: [ownerA.id, ownerB.id] });
    const b = await workflow.createInvestment({ householdId: home.id, name: "Other holding", ownerIds: [ownerB.id] });
    const foreign = await workflow.createInvestment({ householdId: other.id, name: "Other example", ownerIds: [outsider.id] });
    const [g1, g2] = await db.insert(customGroups).values([
      { householdId: home.id, label: "Example group 1" }, { householdId: home.id, label: "Example group 2" },
    ]).returning();
    await db.insert(investmentGroups).values([
      { householdId: home.id, investmentId: a.id, groupId: g1.id },
      { householdId: home.id, investmentId: a.id, groupId: g2.id },
    ]);
    for (const investment of [a, b]) {
      await workflow.recordValuationMark({ householdId: home.id, investmentId: investment.id,
        asOfDate: "2026-01-01", grossValue: investment.id === a.id ? "100" : "0" });
    }
    const capital = await workflow.recordExternalAction({ householdId: home.id, investmentId: a.id,
      kind: "contribution", effectiveDate: "2026-01-01", amount: "100" });
    const transfer = await workflow.recordTransfer({ householdId: home.id, sourceInvestmentId: a.id,
      destinationInvestmentId: b.id, effectiveDate: "2026-01-15", amount: "25" });
    await workflow.recordExternalAction({ householdId: home.id, investmentId: a.id,
      kind: "withdrawal", effectiveDate: "2026-01-31", amount: "10" });
    await workflow.recordExternalAction({ householdId: home.id, investmentId: b.id,
      kind: "contribution", effectiveDate: "2026-02-01", amount: "999" });
    await workflow.recordExternalAction({ householdId: other.id, investmentId: foreign.id,
      kind: "contribution", effectiveDate: "2026-01-15", amount: "999" });
    await workflow.recordValuationMark({ householdId: home.id, investmentId: a.id, asOfDate: "2026-01-31", grossValue: "70" });
    await workflow.recordValuationMark({ householdId: home.id, investmentId: b.id, asOfDate: "2026-01-31", grossValue: "25" });
    await workflow.closeInvestment(home.id, a.id, "2026-01-31");
    const repository = createPostgresAnalyticsRepository(db);
    const sources = await repository.getCashFlowSources(home.id, "2026-01-31");
    expect(sources.actions).toHaveLength(3);
    expect(sources.actions.find((action) => action.id === transfer.id)?.movements).toHaveLength(2);
    expect(sources.actions.find((action) => action.id === capital.id)?.movements).toHaveLength(1);
    const analytics = createAnalyticsService(repository);
    const household = await analytics.period(home.id, "2026-01-01", "2026-01-31");
    expect(household.cashFlows).toEqual({ contributionsCents: 0n, distributionsCents: 1000n, netExternalCashFlowCents: -1000n });
    expect(household.change).toMatchObject({ status: "available", value: { navChangeCents: -500n, pnlCents: 500n } });
    const groupScope = { ownerIds: [ownerA.id], customGroupIds: [g1.id, g2.id] };
    const selected = await analytics.period(home.id, "2026-01-01", "2026-01-31", groupScope);
    expect(selected.ending.coverage.selectedCount).toBe(1);
    expect(selected.cashFlows.distributionsCents).toBe(3500n);
    expect(selected.change).toMatchObject({ status: "available", value: { pnlCents: 500n } });
    const destination = await analytics.period(home.id, "2026-01-01", "2026-01-31", { investmentIds: [b.id] });
    expect(destination.cashFlows.contributionsCents).toBe(2500n);
    expect(destination.change).toMatchObject({ status: "available", value: { pnlCents: 0n } });
    expect((await analytics.inception(home.id, "2026-01-31")).pnl).toEqual({ status: "available", value: 500n });
    await workflow.editTransfer({ householdId: home.id, actionId: transfer.id, sourceInvestmentId: a.id,
      destinationInvestmentId: b.id, effectiveDate: "2026-01-15", amount: "20" });
    expect((await analytics.period(home.id, "2026-01-01", "2026-01-31", groupScope)).cashFlows.distributionsCents).toBe(3000n);
    await workflow.deleteTransfer(home.id, transfer.id);
    expect((await analytics.period(home.id, "2026-01-01", "2026-01-31", groupScope)).cashFlows.distributionsCents).toBe(1000n);
    await workflow.editExternalAction({ householdId: home.id, actionId: capital.id, investmentId: a.id,
      kind: "contribution", effectiveDate: "2026-01-01", amount: "90" });
    expect((await analytics.inception(home.id, "2026-01-31")).netInvestedCapitalCents).toBe(8000n);
    await workflow.deleteExternalAction(home.id, capital.id);
    expect((await analytics.inception(home.id, "2026-01-31")).netInvestedCapitalCents).toBe(-1000n);
    await workflow.deleteValuationMark(home.id, a.id, "2026-01-01");
    const incomplete = await analytics.period(home.id, "2026-01-01", "2026-01-31", groupScope);
    expect(incomplete.change).toEqual({ status: "incomplete", reason: "missing_valuation", missingInvestmentIds: [a.id] });
    expect(incomplete.cashFlows.distributionsCents).toBe(1000n);
  });

  it("reconciles canonical ledger returns and historical series through PostgreSQL reads", async () => {
    const { db } = connection!;
    const sources = canonicalSources();
    const [home] = await db.insert(households).values({ name: "Canonical analytics fixture" }).returning();
    await db.transaction(async (tx) => {
      await tx.insert(owners).values([ownerA, ownerB].map((owner) => ({ id: owner.id, householdId: home.id, name: owner.label })));
      await tx.insert(customGroups).values([groupA, groupB].map((group) => ({ ...group, householdId: home.id })));
      await tx.insert(assetClasses).values([
        { id: fixtureId(70), householdId: home.id, label: "Example market assets" },
        { id: fixtureId(71), householdId: home.id, label: "Example property assets" },
      ]);
      await tx.insert(investments).values(sources.investments.map((item) => ({ id: item.id, householdId: home.id,
        name: item.name, status: item.status, closedOn: item.closedOn, assetClassId: item.classifications.assetClass?.id })));
      await tx.insert(investmentOwners).values(sources.investments.flatMap((item) => item.owners.map((owner) => ({
        householdId: home.id, investmentId: item.id, ownerId: owner.id }))));
      await tx.insert(investmentGroups).values(sources.investments.flatMap((item) => item.customGroups.map((group) => ({
        householdId: home.id, investmentId: item.id, groupId: group.id }))));
      await tx.insert(valuationMarks).values(sources.marks.map((mark) => ({ ...mark, householdId: home.id })));
      await tx.insert(actions).values(sources.actions.map((action) => ({ id: action.id, kind: action.kind, effectiveDate: action.effectiveDate, amount: action.amount, householdId: home.id })));
      await tx.insert(movements).values(sources.actions.flatMap((action) => action.movements.map((leg) => ({
        ...leg, householdId: home.id, actionId: action.id }))));
    });
    const repository = createPostgresAnalyticsRepository(db);
    const read = await repository.getCashFlowSources(home.id, endDate);
    expect(read.actions).toHaveLength(8);
    expect(read.marks).toHaveLength(10);
    expect(read.investments.find((item) => item.id === ids.active)?.owners).toHaveLength(2);
    const service = createAnalyticsService(repository);
    const scope = { investmentIds: [ids.active, ids.closed] };
    const returns = await service.returns(home.id, endDate, scope);
    expect(returns.cashFlows).toEqual({ contributionsCents: 30000n, distributionsCents: 28800n, netExternalCashFlowCents: 1200n });
    expect(returns.moic).toEqual({ status: "available", value: 409 / 300 });
    expect(returns.xirr.status).toBe("available");
    if (returns.xirr.status === "available") expect(returns.xirr.value).toBeCloseTo(Math.sqrt(409 / 300) - 1, 9);
    expect((await service.inception(home.id, endDate)).pnl).toEqual({ status: "available", value: expectedHousehold.pnl });
    expect((await service.period(home.id, startDate, endDate)).change)
      .toMatchObject({ status: "available", value: { navChangeCents: -14220n, netExternalCashFlowCents: -21000n, pnlCents: 6780n } });
    const value = await service.valueSeries(home.id, startDate, endDate);
    const composition = await service.compositionSeries(home.id, startDate, endDate, "ownerSet");
    expect(value.points.map((point) => point.asOfDate)).toEqual([startDate, middleDate, endDate]);
    expect(composition.points.map((point) => point.totals)).toEqual(value.points.map((point) => point.totals));
    expect(value.points.at(-1)?.totals).toEqual({ status: "available", value: {
      grossValueCents: 74780n, debtCents: 14000n, navCents: 60780n } });
    expect(composition.points.at(-1)?.breakdown.find((bucket) => bucket.label === "Owner A + Owner B")?.totals)
      .toMatchObject({ status: "available", value: { navCents: 32780n } });
    expect((await service.returns(home.id, endDate, { customGroupIds: [groupA.id, groupB.id] })).moic)
      .toEqual({ status: "available", value: 1.21 });

    // The same fresh-read contract must update returns and series, not only snapshots.
    await createPortfolioService(createPostgresPortfolioRepository(db)).replaceValuationMark({ householdId: home.id,
      investmentId: ids.active, asOfDate: endDate, grossValue: "132" });
    expect((await service.returns(home.id, endDate, scope)).moic).toEqual({ status: "available", value: 1.4 });
    expect((await service.valueSeries(home.id, startDate, endDate)).points.at(-1)?.totals)
      .toMatchObject({ status: "available", value: { navCents: 61880n } });
    await deleteValuationMark(db, home.id, ids.closed, endDate);
    // Closure does not invent a zero terminal NAV: the old $200 mark carries forward.
    expect((await service.returns(home.id, endDate, scope)).moic).toEqual({ status: "available", value: 620 / 300 });
    expect((await service.compositionSeries(home.id, startDate, endDate, "investment")).points.at(-1)?.totals)
      .toMatchObject({ status: "available", value: { navCents: 81880n } });
  });

  it("manages metadata atomically while preserving history and household boundaries", async () => {
    const { db } = connection!;
    const [home, other] = await db.insert(households).values([{ name: "Lifecycle example" }, { name: "Other lifecycle example" }]).returning();
    const [first, second] = await db.insert(owners).values([{ householdId: home.id, name: "Owner A" }, { householdId: home.id, name: "Owner B" }]).returning();
    const [outsider] = await db.insert(owners).values({ householdId: other.id, name: "Other owner" }).returning();
    const lookup = async (table: typeof assetClasses | typeof accountTypes | typeof taxStatuses | typeof liquidities | typeof institutions | typeof customGroups) =>
      (await db.insert(table).values({ householdId: home.id, label: "Synthetic classification" }).returning())[0];
    const [asset, account, tax, liquidity, institution, group] = await Promise.all([
      lookup(assetClasses), lookup(accountTypes), lookup(taxStatuses), lookup(liquidities), lookup(institutions), lookup(customGroups),
    ]);
    const [foreignClass] = await db.insert(assetClasses).values({ householdId: other.id, label: "Foreign class" }).returning();
    const [foreignGroup] = await db.insert(customGroups).values({ householdId: other.id, label: "Foreign group" }).returning();
    const service = createPortfolioService(createPostgresPortfolioRepository(db));
    const metadata = { householdId: home.id, name: "Synthetic managed investment", ownerIds: [first.id],
      assetClassId: asset.id, accountTypeId: account.id, taxStatusId: tax.id, liquidityId: liquidity.id, institutionId: institution.id, groupIds: [group.id] };
    const investment = await service.createInvestment(metadata);
    const created = await service.getInvestmentMetadata(home.id, investment.id);
    expect(created).toMatchObject({ name: metadata.name, ownerIds: [first.id], groupIds: [group.id],
      assetClassId: asset.id, accountTypeId: account.id, taxStatusId: tax.id, liquidityId: liquidity.id, institutionId: institution.id });
    const choices = await service.getInvestmentChoices(home.id);
    expect(choices.owners.map((owner) => owner.id)).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(choices.owners.map((owner) => owner.id)).not.toContain(outsider.id);
    await service.recordExternalAction({ householdId: home.id, investmentId: investment.id, kind: "contribution", effectiveDate: "2026-02-01", amount: "10" });
    await service.recordValuationMark({ householdId: home.id, investmentId: investment.id, asOfDate: "2026-02-02", grossValue: "20", debt: "30" });
    const before = await service.getInvestmentHistory(home.id, investment.id);
    await service.editInvestment({ ...metadata, investmentId: investment.id, name: "Renamed example", ownerIds: [first.id, second.id], assetClassId: null, groupIds: [] });
    const edited = await service.getInvestmentMetadata(home.id, investment.id);
    expect(edited).toMatchObject({ id: investment.id, name: "Renamed example", assetClassId: null, groupIds: [] });
    expect(edited.ownerIds).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(await service.getInvestmentHistory(home.id, investment.id)).toEqual(before);
    for (const invalid of [{ ownerIds: [outsider.id] }, { assetClassId: foreignClass.id }, { groupIds: [foreignGroup.id] }]) {
      await expect(service.editInvestment({ ...metadata, investmentId: investment.id, ...invalid })).rejects.toMatchObject({ code: "invalid_association" });
      await expect(service.createInvestment({ ...metadata, ...invalid })).rejects.toMatchObject({ code: "invalid_association" });
      expect(await service.getInvestmentMetadata(home.id, investment.id)).toEqual(edited);
    }
    await expect(service.getInvestmentMetadata(other.id, investment.id)).rejects.toMatchObject({ code: "investment_unavailable" });
    await expect(service.closeInvestment(home.id, investment.id, "2026-01-31")).rejects.toMatchObject({ code: "close_date_conflict" });
    await expect(service.closeInvestment(home.id, investment.id, "2026-02-01")).rejects.toMatchObject({ code: "close_date_conflict" });
    await service.closeInvestment(home.id, investment.id, "2026-02-02");
    expect(await service.getInvestmentHistory(home.id, investment.id)).toEqual(before);
    await expect(service.recordExternalAction({ householdId: home.id, investmentId: investment.id, kind: "contribution", effectiveDate: "2026-02-03", amount: "1" })).rejects.toMatchObject({ code: "investment_unavailable" });
    await expect(service.recordValuationMark({ householdId: home.id, investmentId: investment.id, asOfDate: "2026-02-03", grossValue: "1" })).rejects.toMatchObject({ code: "investment_unavailable" });
    await service.editInvestment({ ...metadata, investmentId: investment.id, name: "Closed renamed example" });
    expect(await service.getInvestmentMetadata(home.id, investment.id)).toMatchObject({ status: "closed", closedOn: "2026-02-02" });
    await expect(service.closeInvestment(home.id, investment.id, "2026-02-04")).rejects.toMatchObject({ code: "investment_unavailable" });
    expect(await db.select().from(investmentGroups).where(eq(investmentGroups.investmentId, investment.id))).toHaveLength(1);
  });
});
