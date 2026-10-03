import "server-only";
import { eq } from "drizzle-orm";
import type { MigrationRepository, ImportCatalog } from "@/application/migration-ports";
import { classificationDimensions } from "@/domain/migration/validate";
import type { createDatabase } from "./database";
import { createInvestment, createPostgresPortfolioRepository } from "./records";
import { households, owners, investments, movements, valuationMarks, assetClasses, accountTypes, taxStatuses, liquidities, institutions, customGroups } from "./schema";

type Database = ReturnType<typeof createDatabase>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const tables = { assetClass: assetClasses, accountType: accountTypes, taxStatus: taxStatuses, liquidity: liquidities, institution: institutions, customGroup: customGroups };
async function catalog(db: Database | Transaction, householdId: string): Promise<ImportCatalog> {
  const homes = await db.select({ id: households.id }).from(households).where(eq(households.id,householdId));
  const ownerRows = await db.select({ id: owners.id }).from(owners).where(eq(owners.householdId,householdId));
  const investmentRows = await db.select().from(investments).where(eq(investments.householdId,householdId));
  const legs = await db.select({ investmentId: movements.investmentId }).from(movements).where(eq(movements.householdId,householdId));
  const marks = await db.select({ investmentId: valuationMarks.investmentId }).from(valuationMarks).where(eq(valuationMarks.householdId,householdId));
  const historyIds = new Set([...legs,...marks].map(r => r.investmentId));
  const result: ImportCatalog = { exists: homes.length === 1, householdId, ownerIds: ownerRows.map(r => r.id), classificationIds: {}, classifications: [], investments: investmentRows.map(r => ({ id: r.id, status: r.status as "active" | "closed", closedOn: r.closedOn, hasHistory: historyIds.has(r.id) })) };
  for (const dimension of classificationDimensions) {
    const table = tables[dimension];
    const rows = await db.select({id: table.id,label: table.label}).from(table).where(eq(table.householdId,householdId));
    result.classificationIds[dimension] = rows.map(r => r.id);
    result.classifications.push(...rows.map(r => ({...r,dimension})));
  }
  return result;
}
export function createPostgresMigrationRepository(db: Database): MigrationRepository {
  return {
    catalog: householdId => db.transaction(tx => catalog(tx,householdId), { isolationLevel: "repeatable read", accessMode: "read only" }),
    transaction: work => db.transaction(tx => work({
      catalog: householdId => catalog(tx,householdId),
      portfolio: createPostgresPortfolioRepository(tx),
      createInvestment: (input,id) => createInvestment(tx,input,id),
      createClassification: async (householdId,dimension,label) => {
        const [row] = await tx.insert(tables[dimension]).values({ householdId,label }).returning({ id: tables[dimension].id });
        return row.id;
      },
    })),
  };
}
