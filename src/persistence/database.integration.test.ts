import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPortfolioService } from "@/application/portfolio";
import { createDatabase } from "@/persistence/database";
import { readDatabaseUrl } from "@/persistence/environment";
import { migrateDatabase, migrationsFolder } from "@/persistence/migrate";
import { createInvestment, closeInvestment, createPostgresPortfolioRepository, recordExternalAction, recordTransfer, recordValuationMark, saveValuationBatch } from "@/persistence/records";
import { actions, assetClasses, households, investmentOwners, investments, movements, owners, valuationMarks } from "@/persistence/schema";

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
      asOfDate: "2026-04-01", grossValue: "100.00", source: "manual", sourceReference: "synthetic-ref", notes: "Synthetic note" });
    await service.closeInvestment(home.id, investment.id, "2026-04-02");
    const replacement = await service.replaceValuationMark({ householdId: home.id, investmentId: investment.id,
      asOfDate: "2026-04-01", debt: "125.00", source: null, sourceReference: null, notes: null });
    expect(replacement.id).toBe(original.id);
    const history = await service.getInvestmentHistory(home.id, investment.id);
    expect(history.marks).toEqual([expect.objectContaining({ id: original.id, asOfDate: "2026-04-01",
      grossValue: "100.00", debt: "125.00", netValue: "-25.00",
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
    const a = await service.createInvestment({ householdId: home.id, name: "A", ownerIds: [owner.id] });
    const b = await service.createInvestment({ householdId: home.id, name: "B", ownerIds: [owner.id] });
    const c = await service.createInvestment({ householdId: home.id, name: "C", ownerIds: [owner.id] });
    const old = await service.recordValuationMark({ householdId: home.id, investmentId: b.id,
      asOfDate: "2026-07-01", grossValue: "20", debt: "25" });
    await service.closeInvestment(home.id, c.id, "2026-07-01");
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
    const context = await service.previewValuationDelta(home.id, b.id, "2026-07-02", "25", "40");
    expect(context).toMatchObject({ previous: { id: old.id, netValue: "5.00" },
      enteredNetValue: "-15.00", enteredDelta: "-20.00" });
    expect(await service.getEligibleInvestments(home.id, "2026-07-02"))
      .toEqual(expect.not.arrayContaining([expect.objectContaining({ id: c.id })]));
    await service.deleteValuationMark(home.id, a.id, "2026-07-01");
    await expect(service.deleteValuationMark(home.id, a.id, "2026-07-01"))
      .rejects.toMatchObject({ code: "mark_not_found" });
  });
});
