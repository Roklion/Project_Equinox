import "server-only";
import { eq } from "drizzle-orm";
import type { ExportRepository } from "@/application/export";
import type { ExportData } from "@/domain/portability/bundle";
import type { Provenance } from "@/domain/financial";
import type { createDatabase } from "./database";
import { accountTypes, actions, assetClasses, customGroups, households, institutions, investmentGroups, investmentOwners, investments, liquidities, movements, owners, taxStatuses, valuationMarks } from "./schema";

type Database = ReturnType<typeof createDatabase>["db"];
const provenance = (row: { source: string | null; sourceReference: string | null; notes: string | null }): Provenance => ({
  ...(row.source !== null ? { source: row.source as Provenance["source"] } : {}),
  ...(row.sourceReference !== null ? { sourceReference: row.sourceReference } : {}),
  ...(row.notes !== null ? { notes: row.notes } : {}),
});

export function createPostgresExportRepository(db: Database): ExportRepository {
  return { readHousehold: (householdId) => db.transaction(async (tx): Promise<ExportData> => {
    const [household] = await tx.select().from(households).where(eq(households.id, householdId));
    if (!household) throw new Error("Export household does not exist.");
    const ownerRows = await tx.select({ id: owners.id, name: owners.name }).from(owners).where(eq(owners.householdId, householdId));
    const classifications: ExportData["classifications"] = [];
    const lookups = [ ["assetClass", assetClasses], ["accountType", accountTypes], ["taxStatus", taxStatuses], ["liquidity", liquidities], ["institution", institutions], ["customGroup", customGroups] ] as const;
    for (const [dimension, table] of lookups) {
      const rows = await tx.select({ id: table.id, label: table.label }).from(table).where(eq(table.householdId, householdId));
      classifications.push(...rows.map((row) => ({ ...row, dimension })));
    }
    const investmentRows = await tx.select().from(investments).where(eq(investments.householdId, householdId));
    const ownerLinks = await tx.select().from(investmentOwners).where(eq(investmentOwners.householdId, householdId));
    const groupLinks = await tx.select().from(investmentGroups).where(eq(investmentGroups.householdId, householdId));
    const actionRows = await tx.select().from(actions).where(eq(actions.householdId, householdId));
    const legs = await tx.select({ id: movements.id, actionId: movements.actionId, investmentId: movements.investmentId, role: movements.role, direction: movements.direction, amount: movements.amount }).from(movements).where(eq(movements.householdId, householdId));
    const markRows = await tx.select().from(valuationMarks).where(eq(valuationMarks.householdId, householdId));
    return {
      household: { id: household.id, name: household.name, currency: household.currency as "USD" }, owners: ownerRows, classifications,
      investments: investmentRows.map((i) => ({ id: i.id, name: i.name, status: i.status as "active" | "closed", closedOn: i.closedOn,
        ownerIds: ownerLinks.filter((l) => l.investmentId === i.id).map((l) => l.ownerId), groupIds: groupLinks.filter((l) => l.investmentId === i.id).map((l) => l.groupId),
        classifications: Object.fromEntries(([ ["assetClass", i.assetClassId], ["accountType", i.accountTypeId], ["taxStatus", i.taxStatusId], ["liquidity", i.liquidityId], ["institution", i.institutionId] ] as const).filter(([, id]) => id !== null)) })),
      actions: actionRows.map((a) => ({ id: a.id, kind: a.kind as ExportData["actions"][number]["kind"], effectiveDate: a.effectiveDate, amount: a.amount, ...provenance(a),
        movements: legs.filter((m) => m.actionId === a.id).map((m) => ({ id: m.id, investmentId: m.investmentId, role: m.role as "external" | "source" | "destination", direction: m.direction as "in" | "out", amount: m.amount })) })),
      marks: markRows.map((m) => ({ id: m.id, investmentId: m.investmentId, asOfDate: m.asOfDate, grossValue: m.grossValue, debt: m.debt, ...provenance(m) })),
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" }) };
}
