import { assertCalendarDate } from "@/domain/financial";
import { calculateSnapshot, groupSnapshot, type GroupingDimension, type SnapshotScope } from "@/domain/analytics/snapshot";
import { WorkflowError } from "./errors";
import type { AnalyticsRepository } from "./analytics-ports";

export function createAnalyticsService(repository: AnalyticsRepository) {
  return {
    async snapshot(householdId: string, asOfDate: string, scope: SnapshotScope = {}, groupBy?: GroupingDimension) {
      try { assertCalendarDate(asOfDate); } catch { throw new WorkflowError("invalid_date"); }
      const sources = await repository.getSnapshotSources(householdId, asOfDate);
      const snapshot = calculateSnapshot(sources, asOfDate, scope);
      return { ...snapshot, breakdown: groupBy === undefined ? null : groupSnapshot(snapshot, groupBy) };
    },
  };
}
