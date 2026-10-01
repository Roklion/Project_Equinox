import { calculateReturns } from "@/domain/analytics/returns";
import { assertPeriod, calculatePeriod, calculateInception } from "@/domain/analytics/cash-flow";
import { assertCalendarDate } from "@/domain/financial";
import { calculateSnapshot, groupSnapshot, type GroupingDimension, type SnapshotScope } from "@/domain/analytics/snapshot";
import { WorkflowError } from "./errors";
import type { AnalyticsRepository } from "./analytics-ports";

export function createAnalyticsService(repository: AnalyticsRepository) {
  return {
    async returns(householdId: string, asOfDate: string, scope: SnapshotScope = {}) {
      try { assertCalendarDate(asOfDate); } catch { throw new WorkflowError("invalid_date"); }
      const sources = await repository.getCashFlowSources(householdId, asOfDate);
      return calculateReturns(sources, asOfDate, scope);
    },
    async period(householdId: string, startDate: string, endDate: string, scope: SnapshotScope = {}) {
      try { assertPeriod(startDate, endDate); } catch { throw new WorkflowError("invalid_date"); }
      const sources = await repository.getCashFlowSources(householdId, endDate);
      return calculatePeriod(sources, startDate, endDate, scope);
    },
    async inception(householdId: string, asOfDate: string, scope: SnapshotScope = {}) {
      try { assertCalendarDate(asOfDate); } catch { throw new WorkflowError("invalid_date"); }
      const sources = await repository.getCashFlowSources(householdId, asOfDate);
      return calculateInception(sources, asOfDate, scope);
    },
    async snapshot(householdId: string, asOfDate: string, scope: SnapshotScope = {}, groupBy?: GroupingDimension) {
      try { assertCalendarDate(asOfDate); } catch { throw new WorkflowError("invalid_date"); }
      const sources = await repository.getSnapshotSources(householdId, asOfDate);
      const snapshot = calculateSnapshot(sources, asOfDate, scope);
      return { ...snapshot, breakdown: groupBy === undefined ? null : groupSnapshot(snapshot, groupBy) };
    },
  };
}
