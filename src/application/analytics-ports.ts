import type { SnapshotSources } from "@/domain/analytics/snapshot";

/** Read canonical records only; SQL and financial formulas are not part of this port. */
export interface AnalyticsRepository {
  getSnapshotSources(householdId: string, throughDate: string): Promise<SnapshotSources>;
}
