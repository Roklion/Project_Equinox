import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { assertCalendarDate, formatCents, parseCents, type Provenance } from "@/domain/financial";
import type { PortfolioRepository, ReplaceValuationMark, StoredMovement } from "@/application/ports";
import type { createDatabase } from "./database";
import {
  actions, investmentOwners, investments, movements, valuationMarks,
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
    throw new Error("Investment is unavailable for activity on this date.");
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
  if (input.sourceInvestmentId === input.destinationInvestmentId) throw new Error("Transfer needs distinct investments.");
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
  if (!mark) throw new Error("Valuation mark not found for replacement.");
  return mark;
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
  const marks = await db.select({
    id: valuationMarks.id, asOfDate: valuationMarks.asOfDate,
    grossValue: valuationMarks.grossValue, debt: valuationMarks.debt,
    source: valuationMarks.source, sourceReference: valuationMarks.sourceReference, notes: valuationMarks.notes,
  }).from(valuationMarks).where(and(
    eq(valuationMarks.householdId, householdId), eq(valuationMarks.investmentId, investmentId),
  )).orderBy(asc(valuationMarks.asOfDate));
  // SQL checks constrain these text columns to the domain's closed unions.
  return { movements: movementRows as StoredMovement[], marks };
}

export function createPostgresPortfolioRepository(db: Database): PortfolioRepository {
  return {
    createInvestment: (input) => createInvestment(db, input),
    closeInvestment: (householdId, investmentId, closedOn) => closeInvestment(db, householdId, investmentId, closedOn),
    recordExternalAction: (input) => recordExternalAction(db, input),
    recordTransfer: (input) => recordTransfer(db, input),
    recordValuationMark: (input) => recordValuationMark(db, input),
    replaceValuationMark: (input) => replaceValuationMark(db, input),
    getInvestmentHistory: (householdId, investmentId) => getInvestmentHistory(db, householdId, investmentId),
  };
}
