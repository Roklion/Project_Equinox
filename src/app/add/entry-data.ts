import "server-only";
import { createAnalyticsService } from "@/application/analytics";
import { createPostgresAnalyticsRepository } from "@/persistence/analytics";
import { createPortfolioService } from "@/application/portfolio";
import { getDatabase } from "@/persistence/database";
import { createPostgresPortfolioRepository } from "@/persistence/records";
import { householdSetupService } from "@/app/setup-data";

/** The password-only MVP has one household and no household picker. */
export async function withEntryService<T>(
  run: (context: { householdId: string; service: ReturnType<typeof createPortfolioService> }) => Promise<T>,
): Promise<T | null> {
  const { db } = getDatabase();
  const state = await householdSetupService().getState();
  if (state.status !== "configured") return null;
  const householdId = state.householdId;
  // Resolve the household on the server. A client-supplied ID must never select another one.
  return run({ householdId, service: createPortfolioService(createPostgresPortfolioRepository(db)) });
}

export async function withAnalyticsService<T>(
  run: (context: { householdId: string; analytics: ReturnType<typeof createAnalyticsService>; service: ReturnType<typeof createPortfolioService> }) => Promise<T>,
): Promise<T | null> {
  return withEntryService(({ householdId, service }) => run({ householdId, service,
    analytics: createAnalyticsService(createPostgresAnalyticsRepository(getDatabase().db)) }));
}
