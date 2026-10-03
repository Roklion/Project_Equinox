import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, lte, ne, or } from "drizzle-orm";
import { assertCalendarDate, formatCents, parseCents, type Provenance } from "@/domain/financial";
import { WorkflowError } from "@/application/errors";
import type { CreateInvestment, EditInvestment, InvestmentMetadata, EditExternalAction, EditTransfer, EditValuationMark, PortfolioRepository, ReplaceValuationMark, SaveValuationBatch, StoredMovement } from "@/application/ports";
import type { createDatabase } from "./database";
import {
  accountTypes, actions, assetClasses, customGroups, institutions, investmentGroups, investmentOwners, investments, liquidities, movements, owners, taxStatuses, valuationMarks,
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
export async function createInvestment(db: Database, input: CreateInvestment, canonicalId?: string) {
  const ownerIds = [...new Set(input.ownerIds)];
  if (ownerIds.length === 0) throw new Error("An investment needs an owner.");
  return db.transaction(async (tx) => {
    await validateInvestmentAssociations(tx, input);
    const [investment] = await tx.insert(investments).values({
      id: canonicalId, householdId: input.householdId, name: input.name,
      assetClassId: input.assetClassId, accountTypeId: input.accountTypeId,
      taxStatusId: input.taxStatusId, liquidityId: input.liquidityId, institutionId: input.institutionId,
    }).returning();
    await tx.insert(investmentOwners).values(ownerIds.map((ownerId) => ({
      householdId: input.householdId, investmentId: investment.id, ownerId,
    })));
    const groupIds = [...new Set(input.groupIds ?? [])];
    if (groupIds.length) await tx.insert(investmentGroups).values(groupIds.map((groupId) => ({
      householdId: input.householdId, investmentId: investment.id, groupId,
    })));
    return investment;
  });
}

export async function closeInvestment(db: Database, householdId: string, investmentId: string, closedOn: string) {
  assertCalendarDate(closedOn);
  return db.transaction(async (tx) => {
    const investment = await getInvestmentMetadata(tx, householdId, investmentId);
    if (investment.status !== "active") throw new WorkflowError("investment_unavailable");
    const laterMarks = await tx.select({ id: valuationMarks.id }).from(valuationMarks).where(and(
      eq(valuationMarks.householdId, householdId), eq(valuationMarks.investmentId, investmentId), gt(valuationMarks.asOfDate, closedOn))).limit(1);
    const laterActions = await tx.select({ id: actions.id }).from(movements).innerJoin(actions, eq(actions.id, movements.actionId)).where(and(
      eq(movements.householdId, householdId), eq(movements.investmentId, investmentId), gt(actions.effectiveDate, closedOn))).limit(1);
    if (laterMarks.length || laterActions.length) throw new WorkflowError("close_date_conflict", "closedOn");
    const [closed] = await tx.update(investments).set({ status: "closed", closedOn })
      .where(and(eq(investments.householdId, householdId), eq(investments.id, investmentId), eq(investments.status, "active")))
      .returning();
    if (!closed) throw new WorkflowError("investment_unavailable");
    return closed;
  });
}

export async function getInvestmentChoices(db: Database, householdId: string) {
  const ownerRows = await db.select({ id: owners.id, label: owners.name }).from(owners)
    .where(eq(owners.householdId, householdId)).orderBy(asc(owners.name), asc(owners.id));
  const lookup = (table: typeof assetClasses | typeof accountTypes | typeof taxStatuses | typeof liquidities | typeof institutions | typeof customGroups) => db.select({ id: table.id, label: table.label }).from(table)
    .where(eq(table.householdId, householdId)).orderBy(asc(table.label), asc(table.id));
  // This also runs inside a write transaction, whose pg connection executes one query at a time.
  const assetClassRows = await lookup(assetClasses);
  const accountTypeRows = await lookup(accountTypes);
  const taxStatusRows = await lookup(taxStatuses);
  const liquidityRows = await lookup(liquidities);
  const institutionRows = await lookup(institutions);
  const groupRows = await lookup(customGroups);
  return { owners: ownerRows, assetClasses: assetClassRows, accountTypes: accountTypeRows,
    taxStatuses: taxStatusRows, liquidities: liquidityRows, institutions: institutionRows, customGroups: groupRows };
}

async function validateInvestmentAssociations(db: Database, input: CreateInvestment) {
  const choices = await getInvestmentChoices(db, input.householdId);
  const associations: Array<[string, string[], Array<{ id: string }>]> = [
    ["ownerIds", input.ownerIds, choices.owners], ["groupIds", input.groupIds ?? [], choices.customGroups],
    ["assetClassId", input.assetClassId ? [input.assetClassId] : [], choices.assetClasses],
    ["accountTypeId", input.accountTypeId ? [input.accountTypeId] : [], choices.accountTypes],
    ["taxStatusId", input.taxStatusId ? [input.taxStatusId] : [], choices.taxStatuses],
    ["liquidityId", input.liquidityId ? [input.liquidityId] : [], choices.liquidities],
    ["institutionId", input.institutionId ? [input.institutionId] : [], choices.institutions],
  ];
  for (const [field, ids, valid] of associations) {
    if (ids.some((id) => !valid.some((choice) => choice.id === id))) throw new WorkflowError("invalid_association", field);
  }
}

export async function getInvestmentMetadata(db: Database, householdId: string, investmentId: string): Promise<InvestmentMetadata> {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(investmentId)) {
    throw new WorkflowError("investment_unavailable");
  }
  const [row] = await db.select().from(investments).where(and(
    eq(investments.householdId, householdId), eq(investments.id, investmentId)));
  if (!row) throw new WorkflowError("investment_unavailable");
  const ownerLinks = await db.select().from(investmentOwners).where(and(eq(investmentOwners.householdId, householdId), eq(investmentOwners.investmentId, investmentId)));
  const groupLinks = await db.select().from(investmentGroups).where(and(eq(investmentGroups.householdId, householdId), eq(investmentGroups.investmentId, investmentId)));
  return { id: row.id, name: row.name, status: row.status as "active" | "closed", closedOn: row.closedOn,
    assetClassId: row.assetClassId, accountTypeId: row.accountTypeId, taxStatusId: row.taxStatusId,
    liquidityId: row.liquidityId, institutionId: row.institutionId,
    ownerIds: ownerLinks.map((link) => link.ownerId), groupIds: groupLinks.map((link) => link.groupId) };
}

export async function editInvestment(db: Database, input: EditInvestment) {
  return db.transaction(async (tx) => {
    await getInvestmentMetadata(tx, input.householdId, input.investmentId);
    await validateInvestmentAssociations(tx, input);
    const [investment] = await tx.update(investments).set({ name: input.name,
      assetClassId: input.assetClassId ?? null, accountTypeId: input.accountTypeId ?? null,
      taxStatusId: input.taxStatusId ?? null, liquidityId: input.liquidityId ?? null, institutionId: input.institutionId ?? null,
    }).where(and(eq(investments.householdId, input.householdId), eq(investments.id, input.investmentId))).returning();
    await tx.delete(investmentOwners).where(and(eq(investmentOwners.householdId, input.householdId), eq(investmentOwners.investmentId, input.investmentId)));
    await tx.insert(investmentOwners).values([...new Set(input.ownerIds)].map((ownerId) => ({
      householdId: input.householdId, investmentId: input.investmentId, ownerId,
    })));
    await tx.delete(investmentGroups).where(and(eq(investmentGroups.householdId, input.householdId), eq(investmentGroups.investmentId, input.investmentId)));
    const groupIds = [...new Set(input.groupIds ?? [])];
    if (groupIds.length) await tx.insert(investmentGroups).values(groupIds.map((groupId) => ({
      householdId: input.householdId, investmentId: input.investmentId, groupId,
    })));
    return investment;
  });
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

/** Correct a mark, including its date, without replacing a different mark on the new date. */
export async function editValuationMark(db: Database, input: EditValuationMark) {
  return db.transaction(async (tx) => {
    await requireValidActivityDate(tx, input.householdId, input.investmentId, input.asOfDate);
    const whereMark = and(eq(valuationMarks.householdId, input.householdId),
      eq(valuationMarks.investmentId, input.investmentId));
    const [original] = await tx.select({ id: valuationMarks.id }).from(valuationMarks)
      .where(and(whereMark, eq(valuationMarks.asOfDate, input.originalAsOfDate)));
    if (!original) throw new WorkflowError("mark_not_found");
    if (input.asOfDate !== input.originalAsOfDate) {
      const [collision] = await tx.select({ id: valuationMarks.id }).from(valuationMarks)
        .where(and(whereMark, eq(valuationMarks.asOfDate, input.asOfDate)));
      if (collision) throw new WorkflowError("mark_already_exists");
    }
    const [mark] = await tx.update(valuationMarks).set({ asOfDate: input.asOfDate,
      grossValue: exactAmount(input.grossValue, true), debt: exactAmount(input.debt ?? "0", true),
      source: input.source, sourceReference: input.sourceReference, notes: input.notes,
    }).where(and(whereMark, eq(valuationMarks.id, original.id))).returning();
    return mark;
  });
}

async function requireAction(tx: Transaction, householdId: string, actionId: string, kinds: string[]) {
  const [action] = await tx.select({ id: actions.id, kind: actions.kind }).from(actions)
    .where(and(eq(actions.householdId, householdId), eq(actions.id, actionId)));
  if (!action || !kinds.includes(action.kind)) throw new WorkflowError("action_not_found");
  return action;
}

export async function editExternalAction(db: Database, input: EditExternalAction) {
  const amount = exactAmount(input.amount);
  return db.transaction(async (tx) => {
    await requireAction(tx, input.householdId, input.actionId, ["contribution", "withdrawal"]);
    await requireValidActivityDate(tx, input.householdId, input.investmentId, input.effectiveDate);
    // Replacing the leg is required when the investment changes; the deferred shape check sees the final pair.
    await tx.delete(movements).where(and(eq(movements.householdId, input.householdId), eq(movements.actionId, input.actionId)));
    const [action] = await tx.update(actions).set({ kind: input.kind, effectiveDate: input.effectiveDate,
      amount, source: input.source, sourceReference: input.sourceReference, notes: input.notes })
      .where(and(eq(actions.householdId, input.householdId), eq(actions.id, input.actionId))).returning();
    await tx.insert(movements).values({ householdId: input.householdId, actionId: input.actionId,
      investmentId: input.investmentId, role: "external", direction: input.kind === "contribution" ? "in" : "out", amount });
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
  const amount = exactAmount(input.amount);
  return db.transaction(async (tx) => {
    await requireAction(tx, input.householdId, input.actionId, ["transfer"]);
    await requireValidActivityDate(tx, input.householdId, input.sourceInvestmentId, input.effectiveDate);
    await requireValidActivityDate(tx, input.householdId, input.destinationInvestmentId, input.effectiveDate);
    await tx.delete(movements).where(and(eq(movements.householdId, input.householdId), eq(movements.actionId, input.actionId)));
    const [action] = await tx.update(actions).set({ effectiveDate: input.effectiveDate, amount,
      source: input.source, sourceReference: input.sourceReference, notes: input.notes })
      .where(and(eq(actions.householdId, input.householdId), eq(actions.id, input.actionId))).returning();
    await tx.insert(movements).values([
      { householdId: input.householdId, actionId: input.actionId, investmentId: input.sourceInvestmentId,
        role: "source", direction: "out", amount },
      { householdId: input.householdId, actionId: input.actionId, investmentId: input.destinationInvestmentId,
        role: "destination", direction: "in", amount },
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
  assertCalendarDate(asOfDate);
  const [deleted] = await db.delete(valuationMarks).where(and(eq(valuationMarks.householdId, householdId),
    eq(valuationMarks.investmentId, investmentId), eq(valuationMarks.asOfDate, asOfDate))).returning({ id: valuationMarks.id });
  if (!deleted) throw new WorkflowError("mark_not_found");
}

export async function saveValuationBatch(db: Database, input: SaveValuationBatch) {
  assertCalendarDate(input.asOfDate);
  const rows = input.rows.map((row) => {
    if (row.operation === "create") return { ...row,
      grossValue: exactAmount(row.grossValue, true), debt: exactAmount(row.debt ?? "0", true) };
    if ([row.grossValue, row.debt, row.source, row.sourceReference, row.notes]
      .every((value) => value === undefined)) throw new WorkflowError("empty_correction");
    return { ...row,
      grossValue: row.grossValue === undefined ? undefined : exactAmount(row.grossValue, true),
      debt: row.debt === undefined ? undefined : exactAmount(row.debt, true) };
  });
  if (rows.length === 0) return [];

  return db.transaction(async (tx) => {
    const seen = new Set<string>();
    const investmentIds = rows.map((row) => {
      if (seen.has(row.investmentId)) throw new WorkflowError("duplicate_batch_investment");
      seen.add(row.investmentId);
      return row.investmentId;
    });
    const [investmentRows, existingRows] = await Promise.all([
      tx.select({ id: investments.id, status: investments.status, closedOn: investments.closedOn })
        .from(investments).where(and(eq(investments.householdId, input.householdId), inArray(investments.id, investmentIds))),
      tx.select({ id: valuationMarks.id, investmentId: valuationMarks.investmentId }).from(valuationMarks).where(and(
        eq(valuationMarks.householdId, input.householdId), eq(valuationMarks.asOfDate, input.asOfDate),
        inArray(valuationMarks.investmentId, investmentIds))),
    ]);
    const investmentsById = new Map(investmentRows.map((investment) => [investment.id, investment]));
    const existingByInvestment = new Map(existingRows.map((mark) => [mark.investmentId, mark]));

    for (const row of rows) {
      const investment = investmentsById.get(row.investmentId);
      if (!investment || (investment.status === "closed" &&
        (!investment.closedOn || input.asOfDate > investment.closedOn))) {
        throw new WorkflowError("investment_unavailable");
      }
      if (row.operation === "create" && existingByInvestment.has(row.investmentId)) {
        throw new WorkflowError("mark_already_exists");
      }
      if (row.operation === "replace" && !existingByInvestment.has(row.investmentId)) {
        throw new WorkflowError("mark_not_found");
      }
    }

    const saved = [];
    for (const row of rows) {
      if (row.operation === "create") {
        const [mark] = await tx.insert(valuationMarks).values({
          householdId: input.householdId, investmentId: row.investmentId, asOfDate: input.asOfDate,
          grossValue: row.grossValue, debt: row.debt,
          source: row.source, sourceReference: row.sourceReference, notes: row.notes,
        }).returning();
        saved.push(mark);
      } else {
        const [mark] = await tx.update(valuationMarks).set({
          grossValue: row.grossValue, debt: row.debt,
          source: row.source, sourceReference: row.sourceReference, notes: row.notes,
        }).where(and(
          eq(valuationMarks.householdId, input.householdId),
          eq(valuationMarks.investmentId, row.investmentId),
          eq(valuationMarks.asOfDate, input.asOfDate),
        )).returning();
        if (!mark) throw new WorkflowError("mark_not_found");
        saved.push(mark);
      }
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

export async function getInvestments(db: Database, householdId: string) {
  return db.select({ id: investments.id, name: investments.name, status: investments.status,
    closedOn: investments.closedOn, assetClass: assetClasses.label, accountType: accountTypes.label,
    taxStatus: taxStatuses.label, liquidity: liquidities.label, institution: institutions.label,
  }).from(investments)
    .leftJoin(assetClasses, and(eq(assetClasses.householdId, investments.householdId), eq(assetClasses.id, investments.assetClassId)))
    .leftJoin(accountTypes, and(eq(accountTypes.householdId, investments.householdId), eq(accountTypes.id, investments.accountTypeId)))
    .leftJoin(taxStatuses, and(eq(taxStatuses.householdId, investments.householdId), eq(taxStatuses.id, investments.taxStatusId)))
    .leftJoin(liquidities, and(eq(liquidities.householdId, investments.householdId), eq(liquidities.id, investments.liquidityId)))
    .leftJoin(institutions, and(eq(institutions.householdId, investments.householdId), eq(institutions.id, investments.institutionId)))
    .where(eq(investments.householdId, householdId)).orderBy(asc(investments.name), asc(investments.id));
}

export async function getLatestValuationMarks(db: Database, householdId: string) {
  return db.selectDistinctOn([valuationMarks.investmentId], { investmentId: valuationMarks.investmentId, id: valuationMarks.id,
    asOfDate: valuationMarks.asOfDate, grossValue: valuationMarks.grossValue, debt: valuationMarks.debt,
    source: valuationMarks.source, sourceReference: valuationMarks.sourceReference, notes: valuationMarks.notes,
  }).from(valuationMarks).where(eq(valuationMarks.householdId, householdId))
    .orderBy(asc(valuationMarks.investmentId), desc(valuationMarks.asOfDate));
}

export async function getValuationContext(db: Database, householdId: string, investmentId: string, asOfDate: string) {
  const rows = await db.select({ id: valuationMarks.id, asOfDate: valuationMarks.asOfDate,
    grossValue: valuationMarks.grossValue, debt: valuationMarks.debt, source: valuationMarks.source,
    sourceReference: valuationMarks.sourceReference, notes: valuationMarks.notes,
  }).from(valuationMarks).where(and(eq(valuationMarks.householdId, householdId),
    eq(valuationMarks.investmentId, investmentId), lte(valuationMarks.asOfDate, asOfDate)))
    .orderBy(desc(valuationMarks.asOfDate)).limit(2);
  const existing = rows[0]?.asOfDate === asOfDate ? rows[0] : null;
  const previous = existing ? rows[1] : rows[0];
  return { existing: existing ?? null, previous: previous ?? null };
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
    editInvestment: (input) => editInvestment(db, input),
    getInvestmentMetadata: (householdId, investmentId) => getInvestmentMetadata(db, householdId, investmentId),
    getInvestmentChoices: (householdId) => getInvestmentChoices(db, householdId),
    closeInvestment: (householdId, investmentId, closedOn) => closeInvestment(db, householdId, investmentId, closedOn),
    recordExternalAction: (input) => recordExternalAction(db, input),
    editExternalAction: (input) => editExternalAction(db, input),
    deleteExternalAction: ({ householdId, actionId }) => deleteExternalAction(db, householdId, actionId),
    recordTransfer: (input) => recordTransfer(db, input),
    editTransfer: (input) => editTransfer(db, input),
    deleteTransfer: ({ householdId, actionId }) => deleteTransfer(db, householdId, actionId),
    recordValuationMark: (input) => recordValuationMark(db, input),
    replaceValuationMark: (input) => replaceValuationMark(db, input),
    editValuationMark: (input) => editValuationMark(db, input),
    deleteValuationMark: (householdId, investmentId, asOfDate) => deleteValuationMark(db, householdId, investmentId, asOfDate),
    saveValuationBatch: (input) => saveValuationBatch(db, input),
    getEligibleInvestments: async (householdId, asOfDate) =>
      await getEligibleInvestments(db, householdId, asOfDate) as Awaited<ReturnType<PortfolioRepository["getEligibleInvestments"]>>,
    getInvestments: async (householdId) =>
      await getInvestments(db, householdId) as Awaited<ReturnType<PortfolioRepository["getInvestments"]>>,
    getLatestValuationMarks: (householdId) => getLatestValuationMarks(db, householdId),
    getValuationContext: (householdId, investmentId, asOfDate) => getValuationContext(db, householdId, investmentId, asOfDate),
    getInvestmentHistory: (householdId, investmentId) => getInvestmentHistory(db, householdId, investmentId),
  };
}
