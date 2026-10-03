import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { WorkflowError } from "@/application/errors";
import type { SettingsCommand, SettingsRepository } from "@/application/settings";
import type { createDatabase } from "./database";
import { getInvestmentChoices } from "./records";
import { accountTypes, assetClasses, customGroups, households, institutions, investmentGroups, investmentOwners, investments, liquidities, owners, taxStatuses } from "./schema";

type Database = ReturnType<typeof createDatabase>["db"];
const lookupTables = { assetClasses, accountTypes, taxStatuses, liquidities, institutions, customGroups };
const investmentColumns = { assetClasses: investments.assetClassId, accountTypes: investments.accountTypeId,
  taxStatuses: investments.taxStatusId, liquidities: investments.liquidityId, institutions: investments.institutionId };

function constraintCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return constraintCode(error.cause);
}

async function write(db: Database, input: SettingsCommand) {
  try {
    await db.transaction(async (tx) => {
      const householdFilter = eq(households.id, input.householdId);
      const [household] = await tx.select({ id: households.id }).from(households).where(householdFilter);
      if (!household) throw new WorkflowError("invalid_association");
      if (input.dimension === "household") {
        await tx.update(households).set({ name: input.label! }).where(householdFilter);
        return;
      }
      if (input.dimension === "owners") {
        if (input.operation === "create") {
          // Canonical owners may share a display name; IDs distinguish their associations.
          await tx.insert(owners).values({ householdId: input.householdId, name: input.label! });
          return;
        }
        const filter = and(eq(owners.householdId, input.householdId), eq(owners.id, input.id!));
        const [owner] = await tx.select({ id: owners.id }).from(owners).where(filter);
        if (!owner) throw new WorkflowError("invalid_association");
        if (input.operation === "rename") await tx.update(owners).set({ name: input.label! }).where(filter);
        else {
          const links = await tx.select({ id: investmentOwners.investmentId }).from(investmentOwners)
            .where(and(eq(investmentOwners.householdId, input.householdId), eq(investmentOwners.ownerId, input.id!))).limit(1);
          if (links.length) throw new WorkflowError("record_in_use");
          await tx.delete(owners).where(filter);
        }
        return;
      }
      const table = lookupTables[input.dimension];
      const scope = eq(table.householdId, input.householdId);
      const filter = and(scope, eq(table.id, input.id!));
      if (input.operation !== "create") {
        const [row] = await tx.select({ id: table.id }).from(table).where(filter);
        if (!row) throw new WorkflowError("invalid_association");
      }
      if (input.operation === "remove") {
        const links = input.dimension === "customGroups"
          ? await tx.select({ id: investmentGroups.investmentId }).from(investmentGroups)
            .where(and(eq(investmentGroups.householdId, input.householdId), eq(investmentGroups.groupId, input.id!))).limit(1)
          : await tx.select({ id: investments.id }).from(investments)
            .where(and(eq(investments.householdId, input.householdId), eq(investmentColumns[input.dimension], input.id!))).limit(1);
        if (links.length) throw new WorkflowError("record_in_use");
        await tx.delete(table).where(filter);
        return;
      }
      const duplicates = await tx.select({ id: table.id }).from(table)
        .where(and(scope, eq(table.label, input.label!), input.operation === "rename" ? ne(table.id, input.id!) : undefined)).limit(1);
      if (duplicates.length) throw new WorkflowError("duplicate_label", "label");
      if (input.operation === "create") await tx.insert(table).values({ householdId: input.householdId, label: input.label! });
      else await tx.update(table).set({ label: input.label! }).where(filter);
    });
  } catch (error) {
    // Foreign keys remain a backstop; never expose driver messages or clear associations.
    if (constraintCode(error) === "23503") throw new WorkflowError("record_in_use");
    if (constraintCode(error) === "23505") throw new WorkflowError("duplicate_label", "label");
    throw error;
  }
}

export function createPostgresSettingsRepository(db: Database): SettingsRepository {
  return {
    async getSettings(householdId) {
      const [household] = await db.select().from(households).where(eq(households.id, householdId));
      if (!household) throw new WorkflowError("invalid_association");
      return { household, choices: await getInvestmentChoices(db, householdId) };
    },
    write: (input) => write(db, input),
  };
}
