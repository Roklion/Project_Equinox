import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, ne, or } from "drizzle-orm";
import { assertCalendarDate, formatCents, parseCents, type Provenance } from "@/domain/financial";
import { WorkflowError } from "@/application/errors";
import type { EditExternalAction, EditTransfer, PortfolioRepository, ReplaceValuationMark, SaveValuationBatch, StoredMovement, WriteValuationMark } from "@/application/ports";
import type { createDatabase } from "./database";
import {
  accountTypes, actions, assetClasses, institutions, investmentOwners, investments, liquidities, movements, taxStatuses, valuationMarks,
} from "./schema";

type PoolDatabase = ReturnType<typeof createDatabase>["db"];
type Transaction = Parameters<Parameters<PoolDatabase["transaction"]>[0]>[0];
type Database = PoolDatabase | Transaction;

function exactAmount(value: string, allowZero = false): string {
  return formatCents(parseCents(value, allowZero));
}

async function requireValidActivityDate(
  db: Transaction, householdId: string, investmentId: string, activityDate: string,
) {
  const [investment] = await db.select({ status: investments.status, closedOn: investments.closedOn }).from(investments)
    .where(and(eq(investments.householdId, householdId), eq(investments.id, investmentId)));
  if (!investment || (investment.status === "closed" &&
    (!investment.closedOn || activityDate > investment.closedOn))) {
    throw new WorkflowError("investment_unavailable");
  }
}

/** Create an investment and all owner links together, with no ownerless committed row. */
export async function createInvestment(db: Database, input: {
  householdId: string; name: string; ownerIds: string[];
  assetClassId?: string; accountTypeId?: string; taxStatusId?: string;
  liquidityId?: string; institutionId?: string;
}) {
  const ownerIds = [...new Set(input.ownerIds)];
  if (ownerIds.length === 0) throw new Error("An investment needs an owner.");
  return db.transaction(async (tx) => {
    const [investment] = await tx.insert(investments).values({
      householdId: input.householdId, name: input.name,
      assetClassId: input.assetClassId, accountTypeId: input.accountTypeId,
      taxStatusId: input.taxStatusId, liquidityId: input.liquidityId, institutionId: input.institutionId,
    }).returning();
    await tx.insert(investmentOwners).values(ownerIds.map((ownerId) => ({
      householdId: input.householdId, investmentId: investment.id, ownerId,
    })));
    return investment;
  });
}

export async function closeInvestment(db: Database, householdId: string, investmentId: string, closedOn: string) {
  assertCalendarDate(closedOn);
  const [closed] = await db.update(investments).set({ status: "closed", closedOn })
    .where(and(eq(investments.householdId, householdId), eq(investments.id, investmentId), eq(investments.status, "active")))
    .returning();
  if (!closed) throw new Error("Active investment not found.");
  return closed;
}

export async function recordExternalAction(db: Database, input: {
  householdId: string; investmentId: string; kind: "contribution" | "withdrawal";
  effectiveDate: string; amount: string;
} & Provenance) {
  assertCalendarDate(input.effectiveDate);
  const amount = exactAmount(input.amount);
  return db.transaction(async (tx) => {
    await requireValidActivityDate(tx, input.householdId, input.investmentId, input.effectiveDate);
    const [action] = await tx.insert(actions).values({
      householdId: input.householdId, kind: input.kind, effectiveDate: input.effectiveDate,
      amount, source: input.source, sourceReference: input.sourceReference, notes: input.notes,
    }).returning();
    await tx.insert(movements).values({
      householdId: input.householdId, actionId: action.id, investmentId: input.investmentId,
      role: "external", direction: input.kind === "contribution" ? "in" : "out", amount,
    });
    return action;
  });
}

export async function recordTransfer(db: Database, input: {
  householdId: string; sourceInvestmentId: string; destinationInvestmentId: string;
  effectiveDate: string; amount: string;
} & Provenance) {
  assertCalendarDate(input.effectiveDate);
  const amount = exactAmount(input.amount);
  if (input.sourceInvestmentId === input.destinationInvestmentId) throw new WorkflowError("invalid_transfer");
  return db.transaction(async (tx) => {
    await requireValidActivityDate(tx, input.householdId, input.sourceInvestmentId, input.effectiveDate);
    await requireValidActivityDate(tx, input.householdId, input.destinationInvestmentId, input.effectiveDate);
    const [action] = await tx.insert(actions).values({
      householdId: input.householdId, kind: "transfer", effectiveDate: input.effectiveDate,
      amount, source: input.source, sourceReference: input.sourceReference, notes: input.notes,
    }).returning();
    await tx.insert(movements).values([
      { householdId: input.householdId, actionId: action.id, investmentId: input.sourceInvestmentId,
        role: "source", direction: "out", amount },
      { householdId: input.householdId, actionId: action.id, investmentId: input.destinationInvestmentId,
        role: "destination", direction: "in", amount },
    ]);
    return action;
  });
}

export async function recordValuationMark(db: Database, input: {
  householdId: string; investmentId: string; asOfDate: string;
  grossValue: string; debt?: string;
} & Provenance) {
  assertCalendarDate(input.asOfDate);
  const grossValue = exactAmount(input.grossValue, true);
  const debt = exactAmount(input.debt ?? "0", true);
  return db.transaction(async (tx) => {
    await requireValidActivityDate(tx, input.householdId, input.investmentId, input.asOfDate);
    const [existing] = await tx.select({ id: valuationMarks.id }).from(valuationMarks).where(and(
      eq(valuationMarks.householdId, input.householdId), eq(valuationMarks.investmentId, input.investmentId),
      eq(valuationMarks.asOfDate, input.asOfDate)));
    if (existing) throw new WorkflowError("mark_already_exists");
    const [mark] = await tx.insert(valuationMarks).values({
      householdId: input.householdId, investmentId: input.investmentId, asOfDate: input.asOfDate,
      grossValue, debt, source: input.source, sourceReference: input.sourceReference, notes: input.notes,
    }).returning();
    return mark;
  });
}

/** Correct a known mark in place. The investment/date identity and row ID remain stable. */
export async function replaceValuationMark(db: Database, input: ReplaceValuationMark) {
  assertCalendarDate(input.asOfDate);
  if ([input.grossValue, input.debt, input.source, input.sourceReference, input.notes]
    .every((value) => value === undefined)) throw new Error("A mark correction needs a changed field.");
  const [mark] = await db.update(valuationMarks).set({
    grossValue: input.grossValue === undefined ? undefined : exactAmount(input.grossValue, true),
    debt: input.debt === undefined ? undefined : exactAmount(input.debt, true),
    source: input.source, sourceReference: input.sourceReference, notes: input.notes,
  }).where(and(
    eq(valuationMarks.householdId, input.householdId),
    eq(valuationMarks.investmentId, input.investmentId),
    eq(valuationMarks.asOfDate, input.asOfDate),
  )).returning();
  if (!mark) throw new WorkflowError("mark_not_found");
  return mark;
}

async function requireAction(tx: Transaction, householdId: string, actionId: string, kinds: string[]) {
  const [action] = await tx.select({ id: actions.id, kind: actions.kind }).from(actions)
    .where(and(eq(actions.householdId, householdId), eq(actions.id, actionId)));
  if (!action || !kinds.includes(action.kind)) throw new WorkflowError("action_not_found");
  return action;
}

export async function editExternalAction(db: Database, input: EditExternalAction) {
  return db.transaction(async (tx) => {
    await requireAction(tx, input.householdId, input.actionId, ["contribution", "withdrawal"]);
    await requireValidActivityDate(tx, input.householdId, input.investmentId, input.effectiveDate);
    // Replacing the leg is required when the investment changes; the deferred shape check sees the final pair.
    await tx.delete(movements).where(and(eq(movements.householdId, input.householdId), eq(movements.actionId, input.actionId)));
    const [action] = await tx.update(actions).set({ kind: input.kind, effectiveDate: input.effectiveDate,
      amount: input.amount, source: input.source, sourceReference: input.sourceReference, notes: input.notes })
      .where(and(eq(actions.householdId, input.householdId), eq(actions.id, input.actionId))).returning();
    await tx.insert(movements).values({ householdId: input.householdId, actionId: input.actionId,
      investmentId: input.investmentId, role: "external", direction: input.kind === "contribution" ? "in" : "out", amount: input.amount });
    return action;
  });
}

export async function deleteExternalAction(db: Database, householdId: string, actionId: string) {
  await db.transaction(async (tx) => {
    await requireAction(tx, householdId, actionId, ["contribution", "withdrawal"]);
    await tx.delete(movements).where(and(eq(movements.householdId, householdId), eq(movements.actionId, actionId)));
    await tx.delete(actions).where(and(eq(actions.householdId, householdId), eq(actions.id, actionId)));
  });
}

export async function editTransfer(db: Database, input: EditTransfer) {
  if (input.sourceInvestmentId === input.destinationInvestmentId) throw new WorkflowError("invalid_transfer");
  return db.transaction(async (tx) => {
    await requireAction(tx, input.householdId, input.actionId, ["transfer"]);
    await requireValidActivityDate(tx, input.householdId, input.sourceInvestmentId, input.effectiveDate);
    await requireValidActivityDate(tx, input.householdId, input.destinationInvestmentId, input.effectiveDate);
    await tx.delete(movements).where(and(eq(movements.householdId, input.householdId), eq(movements.actionId, input.actionId)));
    const [action] = await tx.update(actions).set({ effectiveDate: input.effectiveDate, amount: input.amount,
      source: input.source, sourceReference: input.sourceReference, notes: input.notes })
      .where(and(eq(actions.householdId, input.householdId), eq(actions.id, input.actionId))).returning();
    await tx.insert(movements).values([
      { householdId: input.householdId, actionId: input.actionId, investmentId: input.sourceInvestmentId,
        role: "source", direction: "out", amount: input.amount },
      { householdId: input.householdId, actionId: input.actionId, investmentId: input.destinationInvestmentId,
        role: "destination", direction: "in", amount: input.amount },
    ]);
    return action;
  });
}

export async function deleteTransfer(db: Database, householdId: string, actionId: string) {
  await db.transaction(async (tx) => {
    await requireAction(tx, householdId, actionId, ["transfer"]);
    await tx.delete(movements).where(and(eq(movements.householdId, householdId), eq(movements.actionId, actionId)));
    await tx.delete(actions).where(and(eq(actions.householdId, householdId), eq(actions.id, actionId)));
  });
}

export async function deleteValuationMark(db: Database, householdId: string, investmentId: string, asOfDate: string) {
  const [deleted] = await db.delete(valuationMarks).where(and(eq(valuationMarks.householdId, householdId),
    eq(valuationMarks.investmentId, investmentId), eq(valuationMarks.asOfDate, asOfDate))).returning({ id: valuationMarks.id });
  if (!deleted) throw new WorkflowError("mark_not_found");
}

export async function saveValuationBatch(db: Database, input: SaveValuationBatch) {
  return db.transaction(async (tx) => {
    const seen = new Set<string>();
    for (const row of input.rows) {
      if (seen.has(row.investmentId)) throw new WorkflowError("duplicate_batch_investment");
      seen.add(row.investmentId);
      if (row.operation === "create") await requireValidActivityDate(tx, input.householdId, row.investmentId, input.asOfDate);
      const [existing] = await tx.select({ id: valuationMarks.id }).from(valuationMarks).where(and(
        eq(valuationMarks.householdId, input.householdId), eq(valuationMarks.investmentId, row.investmentId),
        eq(valuationMarks.asOfDate, input.asOfDate)));
      if (row.operation === "create" && existing) throw new WorkflowError("mark_already_exists");
      if (row.operation === "replace" && !existing) throw new WorkflowError("mark_not_found");
    }
    const saved = [];
    for (const row of input.rows) {
      const command = { ...row, householdId: input.householdId, asOfDate: input.asOfDate };
      saved.push(row.operation === "create"
        ? await recordValuationMark(tx, command as WriteValuationMark)
        : await replaceValuationMark(tx, command as ReplaceValuationMark));
    }
    return saved;
  });
}

export async function getEligibleInvestments(db: Database, householdId: string, asOfDate: string) {
  return db.select({ id: investments.id, name: investments.name, status: investments.status,
    closedOn: investments.closedOn, assetClass: assetClasses.label, accountType: accountTypes.label,
    taxStatus: taxStatuses.label, liquidity: liquidities.label, institution: institutions.label,
  }).from(investments)
    .leftJoin(assetClasses, and(eq(assetClasses.householdId, investments.householdId), eq(assetClasses.id, investments.assetClassId)))
    .leftJoin(accountTypes, and(eq(accountTypes.householdId, investments.householdId), eq(accountTypes.id, investments.accountTypeId)))
    .leftJoin(taxStatuses, and(eq(taxStatuses.householdId, investments.householdId), eq(taxStatuses.id, investments.taxStatusId)))
    .leftJoin(liquidities, and(eq(liquidities.householdId, investments.householdId), eq(liquidities.id, investments.liquidityId)))
    .leftJoin(institutions, and(eq(institutions.householdId, investments.householdId), eq(institutions.id, investments.institutionId)))
    .where(and(eq(investments.householdId, householdId),
    or(eq(investments.status, "active"), and(eq(investments.status, "closed"),
      // A historical date on/before closure is eligible for new dated activity.
      // SQL date comparison preserves calendar-day semantics.
      gte(investments.closedOn, asOfDate))))).orderBy(asc(investments.name), asc(investments.id));
}

export async function getLatestValuationMarks(db: Database, householdId: string) {
  const rows = await db.select({ investmentId: valuationMarks.investmentId, id: valuationMarks.id,
    asOfDate: valuationMarks.asOfDate, grossValue: valuationMarks.grossValue, debt: valuationMarks.debt,
    source: valuationMarks.source, sourceReference: valuationMarks.sourceReference, notes: valuationMarks.notes,
  }).from(valuationMarks).where(eq(valuationMarks.householdId, householdId))
    .orderBy(asc(valuationMarks.investmentId), desc(valuationMarks.asOfDate));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!latest.has(row.investmentId)) latest.set(row.investmentId, row);
  return [...latest.values()];
}

export async function getValuationContext(db: Database, householdId: string, investmentId: string, asOfDate: string) {
  const rows = await db.select({ id: valuationMarks.id, asOfDate: valuationMarks.asOfDate,
    grossValue: valuationMarks.grossValue, debt: valuationMarks.debt, source: valuationMarks.source,
    sourceReference: valuationMarks.sourceReference, notes: valuationMarks.notes,
  }).from(valuationMarks).where(and(eq(valuationMarks.householdId, householdId),
    eq(valuationMarks.investmentId, investmentId), lt(valuationMarks.asOfDate, asOfDate)))
    .orderBy(desc(valuationMarks.asOfDate)).limit(1);
  const [existing] = await db.select({ id: valuationMarks.id, asOfDate: valuationMarks.asOfDate,
    grossValue: valuationMarks.grossValue, debt: valuationMarks.debt, source: valuationMarks.source,
    sourceReference: valuationMarks.sourceReference, notes: valuationMarks.notes,
  }).from(valuationMarks).where(and(eq(valuationMarks.householdId, householdId),
    eq(valuationMarks.investmentId, investmentId), eq(valuationMarks.asOfDate, asOfDate)));
  return { existing: existing ?? null, previous: rows[0] ?? null };
}

export async function getInvestmentHistory(db: Database, householdId: string, investmentId: string) {
  const movementRows = await db.select({
    actionId: actions.id, kind: actions.kind, effectiveDate: actions.effectiveDate,
    investmentId: movements.investmentId, role: movements.role,
    direction: movements.direction, amount: movements.amount,
    source: actions.source, sourceReference: actions.sourceReference, notes: actions.notes,
  }).from(movements).innerJoin(actions, eq(movements.actionId, actions.id))
    .where(and(eq(movements.householdId, householdId), eq(movements.investmentId, investmentId)))
    .orderBy(asc(actions.effectiveDate));
  const transferIds = movementRows.filter((row) => row.kind === "transfer").map((row) => row.actionId);
  const counterparts = transferIds.length === 0 ? [] : await db.select({
    actionId: movements.actionId, investmentId: movements.investmentId,
  }).from(movements).where(and(eq(movements.householdId, householdId),
    inArray(movements.actionId, transferIds), ne(movements.investmentId, investmentId)));
  const counterpartyByAction = new Map(counterparts.map((row) => [row.actionId, row.investmentId]));
  const marks = await db.select({
    id: valuationMarks.id, asOfDate: valuationMarks.asOfDate,
    grossValue: valuationMarks.grossValue, debt: valuationMarks.debt,
    source: valuationMarks.source, sourceReference: valuationMarks.sourceReference, notes: valuationMarks.notes,
  }).from(valuationMarks).where(and(
    eq(valuationMarks.householdId, householdId), eq(valuationMarks.investmentId, investmentId),
  )).orderBy(asc(valuationMarks.asOfDate));
  // SQL checks constrain these text columns to the domain's closed unions.
  return { movements: movementRows.map((row) => ({ ...row,
    counterpartyInvestmentId: counterpartyByAction.get(row.actionId) ?? null })) as StoredMovement[], marks };
}

export function createPostgresPortfolioRepository(db: Database): PortfolioRepository {
  return {
    createInvestment: (input) => createInvestment(db, input),
    closeInvestment: (householdId, investmentId, closedOn) => closeInvestment(db, householdId, investmentId, closedOn),
    recordExternalAction: (input) => recordExternalAction(db, input),
    editExternalAction: (input) => editExternalAction(db, input),
    deleteExternalAction: ({ householdId, actionId }) => deleteExternalAction(db, householdId, actionId),
    recordTransfer: (input) => recordTransfer(db, input),
    editTransfer: (input) => editTransfer(db, input),
    deleteTransfer: ({ householdId, actionId }) => deleteTransfer(db, householdId, actionId),
    recordValuationMark: (input) => recordValuationMark(db, input),
    replaceValuationMark: (input) => replaceValuationMark(db, input),
    deleteValuationMark: (householdId, investmentId, asOfDate) => deleteValuationMark(db, householdId, investmentId, asOfDate),
    saveValuationBatch: (input) => saveValuationBatch(db, input),
    getEligibleInvestments: async (householdId, asOfDate) =>
      await getEligibleInvestments(db, householdId, asOfDate) as Awaited<ReturnType<PortfolioRepository["getEligibleInvestments"]>>,
    getLatestValuationMarks: (householdId) => getLatestValuationMarks(db, householdId),
    getValuationContext: (householdId, investmentId, asOfDate) => getValuationContext(db, householdId, investmentId, asOfDate),
    getInvestmentHistory: (householdId, investmentId) => getInvestmentHistory(db, householdId, investmentId),
  };
}
