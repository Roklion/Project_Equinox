import "server-only";
import { createHouseholdSetupService } from "@/application/setup";
import { getDatabase } from "@/persistence/database";
import { createPostgresHouseholdSetupRepository } from "@/persistence/setup";

export function householdSetupService() {
  return createHouseholdSetupService(createPostgresHouseholdSetupRepository(getDatabase().db));
}
