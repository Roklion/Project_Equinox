import "server-only";
import { createSettingsService } from "@/application/settings";
import { createPostgresSettingsRepository } from "@/persistence/settings";
import { getDatabase } from "@/persistence/database";
import { householdSetupService } from "./setup-data";

export async function withSettingsService<T>(run: (context: { householdId: string; service: ReturnType<typeof createSettingsService> }) => Promise<T>): Promise<T | null> {
  const state = await householdSetupService().getState();
  if (state.status === "inconsistent") throw new Error("Household configuration is inconsistent.");
  if (state.status === "empty") return null;
  return run({ householdId: state.householdId, service: createSettingsService(createPostgresSettingsRepository(getDatabase().db)) });
}
