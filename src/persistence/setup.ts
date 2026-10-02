import "server-only";
import { sql } from "drizzle-orm";
import { WorkflowError } from "@/application/errors";
import type { HouseholdSetupRepository, HouseholdSetupState } from "@/application/setup";
import type { createDatabase } from "./database";
import { households, owners } from "./schema";

type Database = ReturnType<typeof createDatabase>["db"];
function state(rows: Array<{ id: string }>): HouseholdSetupState {
  if (rows.length === 0) return { status: "empty" };
  if (rows.length === 1) return { status: "configured", householdId: rows[0].id };
  return { status: "inconsistent" };
}
export function createPostgresHouseholdSetupRepository(db: Database): HouseholdSetupRepository {
  return {
    async getState() {
      return state(await db.select({ id: households.id }).from(households).limit(2));
    },
    initialize(input) {
      return db.transaction(async (tx) => {
        // Only the first-run command takes this lock. Serialize the empty-table
        // check and insert so overlapping retries cannot create two households.
        await tx.execute(sql`LOCK TABLE households IN EXCLUSIVE MODE`);
        const current = state(await tx.select({ id: households.id }).from(households).limit(2));
        if (current.status === "inconsistent") throw new WorkflowError("household_inconsistent");
        if (current.status === "configured") return { householdId: current.householdId };
        const [household] = await tx.insert(households).values({ name: input.name, currency: "USD" }).returning({ id: households.id });
        await tx.insert(owners).values(input.ownerNames.map((name) => ({ householdId: household.id, name })));
        return { householdId: household.id };
      });
    },
  };
}
