import "server-only";
import { and, asc, eq, lte } from "drizzle-orm";
import type { AnalyticsRepository } from "@/application/analytics-ports";
import type { AnalyticsAction } from "@/domain/analytics/cash-flow";
import type { AnalyticsInvestment } from "@/domain/analytics/snapshot";
import type { createDatabase } from "./database";
import { accountTypes, assetClasses, customGroups, institutions, investmentGroups, investmentOwners,
  actions, movements, investments, liquidities, owners, taxStatuses, valuationMarks } from "./schema";

type Database = ReturnType<typeof createDatabase>["db"];

/** Associations stay separate from marks so many-to-many joins never duplicate monetary inputs. */
export function createPostgresAnalyticsRepository(db: Database): AnalyticsRepository {
  async function readSources(householdId: string, throughDate: string, includeActions: boolean) {
    return db.transaction(async (tx) => {
      const investmentRows = await tx.select({
        id: investments.id, name: investments.name, status: investments.status, closedOn: investments.closedOn,
        assetClass: { id: assetClasses.id, label: assetClasses.label },
        accountType: { id: accountTypes.id, label: accountTypes.label },
        taxStatus: { id: taxStatuses.id, label: taxStatuses.label },
        liquidity: { id: liquidities.id, label: liquidities.label },
        institution: { id: institutions.id, label: institutions.label },
      }).from(investments)
        .leftJoin(assetClasses, eq(assetClasses.id, investments.assetClassId))
        .leftJoin(accountTypes, eq(accountTypes.id, investments.accountTypeId))
        .leftJoin(taxStatuses, eq(taxStatuses.id, investments.taxStatusId))
        .leftJoin(liquidities, eq(liquidities.id, investments.liquidityId))
        .leftJoin(institutions, eq(institutions.id, investments.institutionId))
        .where(eq(investments.householdId, householdId)).orderBy(asc(investments.id));
      const ownerRows = await tx.select({ investmentId: investmentOwners.investmentId,
        id: owners.id, label: owners.name }).from(investmentOwners)
        .innerJoin(owners, eq(owners.id, investmentOwners.ownerId))
        .where(eq(investmentOwners.householdId, householdId));
      const groupRows = await tx.select({ investmentId: investmentGroups.investmentId,
        id: customGroups.id, label: customGroups.label }).from(investmentGroups)
        .innerJoin(customGroups, eq(customGroups.id, investmentGroups.groupId))
        .where(eq(investmentGroups.householdId, householdId));
      const marks = await tx.select({ id: valuationMarks.id, investmentId: valuationMarks.investmentId,
        asOfDate: valuationMarks.asOfDate, grossValue: valuationMarks.grossValue, debt: valuationMarks.debt,
      }).from(valuationMarks).where(and(eq(valuationMarks.householdId, householdId),
        lte(valuationMarks.asOfDate, throughDate)));
      const selectedInvestments: AnalyticsInvestment[] = investmentRows.map((row) => ({
        id: row.id, name: row.name, status: row.status as AnalyticsInvestment["status"], closedOn: row.closedOn,
        owners: ownerRows.filter((owner) => owner.investmentId === row.id).map(({ id, label }) => ({ id, label })),
        customGroups: groupRows.filter((group) => group.investmentId === row.id).map(({ id, label }) => ({ id, label })),
        classifications: { assetClass: row.assetClass, accountType: row.accountType, taxStatus: row.taxStatus,
          liquidity: row.liquidity, institution: row.institution },
      }));
      const canonicalActions: AnalyticsAction[] = [];
      if (includeActions) {
        const actionRows = await tx.select({ id: actions.id, kind: actions.kind,
          effectiveDate: actions.effectiveDate, amount: actions.amount,
        }).from(actions).where(and(eq(actions.householdId, householdId), lte(actions.effectiveDate, throughDate)));
        // Read both legs before selecting a reporting scope. Association joins must not multiply flows.
        const movementRows = await tx.select({ actionId: movements.actionId, investmentId: movements.investmentId,
          role: movements.role, direction: movements.direction, amount: movements.amount,
        }).from(movements).innerJoin(actions, and(eq(actions.id, movements.actionId),
          eq(actions.householdId, movements.householdId)))
          .where(and(eq(movements.householdId, householdId), lte(actions.effectiveDate, throughDate)));
        const legs = new Map<string, AnalyticsAction["movements"]>();
        for (const row of movementRows) {
          const actionLegs = legs.get(row.actionId) ?? [];
          actionLegs.push({ investmentId: row.investmentId, amount: row.amount,
            role: row.role as AnalyticsAction["movements"][number]["role"],
            direction: row.direction as AnalyticsAction["movements"][number]["direction"] });
          legs.set(row.actionId, actionLegs);
        }
        for (const row of actionRows) canonicalActions.push({ ...row,
          kind: row.kind as AnalyticsAction["kind"], movements: legs.get(row.id) ?? [] });
      }
      return { investments: selectedInvestments, marks, actions: canonicalActions };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }
  return {
    getSnapshotSources: (householdId, throughDate) => readSources(householdId, throughDate, false),
    getCashFlowSources: (householdId, throughDate) => readSources(householdId, throughDate, true),
  };
}
