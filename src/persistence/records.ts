import "server-only";
import { and, eq } from "drizzle-orm";
import { assertCalendarDate, formatCents, parseCents, type Provenance } from "@/domain/financial";
import type { createDatabase } from "./database";
import {
  actions, investmentGroups, investmentOwners, investments, movements, valuationMarks,
} from "./schema";

type Database = ReturnType<typeof createDatabase>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function exactAmount(value: string, allowZero = false): string {
  return formatCents(parseCents(value, allowZero));
}

async function requireActiveInvestment(db: Transaction, householdId: string, investmentId: string) {
  const [investment] = await db.select({ status: investments.status }).from(investments)
    .where(and(eq(investments.householdId, householdId), eq(investments.id, investmentId)));
  if (!investment || investment.status !== "active") throw new Error("Investment is unavailable for new activity.");
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

export async function addInvestmentGroup(db: Database, householdId: string, investmentId: string, groupId: string) {
  await db.insert(investmentGroups).values({ householdId, investmentId, groupId });
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
    await requireActiveInvestment(tx, input.householdId, input.investmentId);
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
    await requireActiveInvestment(tx, input.householdId, input.sourceInvestmentId);
    await requireActiveInvestment(tx, input.householdId, input.destinationInvestmentId);
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
    await requireActiveInvestment(tx, input.householdId, input.investmentId);
    const [mark] = await tx.insert(valuationMarks).values({
      householdId: input.householdId, investmentId: input.investmentId, asOfDate: input.asOfDate,
      grossValue, debt, source: input.source, sourceReference: input.sourceReference, notes: input.notes,
    }).returning();
    return mark;
  });
}
