import "server-only";
import { createPortfolioService } from "@/application/portfolio";
import { getDatabase } from "@/persistence/database";
import { createPostgresPortfolioRepository } from "@/persistence/records";
import { households } from "@/persistence/schema";

/** The password-only MVP has one household and no household picker. */
export async function withEntryService<T>(
  run: (context: { householdId: string; service: ReturnType<typeof createPortfolioService> }) => Promise<T>,
): Promise<T | null> {
  const { db } = getDatabase();
  const rows = await db.select({ id: households.id }).from(households).limit(2);
  if (rows.length !== 1) return null;
  const householdId = rows[0].id;
  // Resolve the household on the server. A client-supplied ID must never select another one.
  return run({ householdId, service: createPortfolioService(createPostgresPortfolioRepository(db)) });
}
