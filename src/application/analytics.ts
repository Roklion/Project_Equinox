import { calculateValueSeries, calculateCompositionSeries } from "@/domain/analytics/series";
import { calculateReturns } from "@/domain/analytics/returns";
import { assertPeriod, calculatePeriod, calculateInception } from "@/domain/analytics/cash-flow";
import { assertCalendarDate } from "@/domain/financial";
import { assertGroupingDimension, calculateSnapshot, groupSnapshot, classificationDimensions, type GroupingDimension, type SnapshotScope } from "@/domain/analytics/snapshot";
import { WorkflowError } from "./errors";
import type { AnalyticsRepository } from "./analytics-ports";

export function createAnalyticsService(repository: AnalyticsRepository) {
  return {
    /** One source read keeps both complementary series and all grouping views aligned. */
    async historicalSeries(householdId: string, startDate: string, endDate: string, scope: SnapshotScope = {}) {
      try { assertPeriod(startDate, endDate); } catch { throw new WorkflowError("invalid_date"); }
      const sources = await repository.getSnapshotSources(householdId, endDate);
      const dimensions: GroupingDimension[] = ["investment", ...classificationDimensions, "ownerSet"];
      const compositionSeries = Object.fromEntries(dimensions.map((dimension) =>
        [dimension, calculateCompositionSeries(sources, startDate, endDate, dimension, scope)])) as
        Record<GroupingDimension, ReturnType<typeof calculateCompositionSeries>>;
      return { valueSeries: calculateValueSeries(sources, startDate, endDate, scope), compositionSeries };
    },
    async valueSeries(householdId: string, startDate: string, endDate: string, scope: SnapshotScope = {}) {
      try { assertPeriod(startDate, endDate); } catch { throw new WorkflowError("invalid_date"); }
      const sources = await repository.getSnapshotSources(householdId, endDate);
      return calculateValueSeries(sources, startDate, endDate, scope);
    },
    async compositionSeries(householdId: string, startDate: string, endDate: string,
      groupBy: GroupingDimension, scope: SnapshotScope = {}) {
      try { assertPeriod(startDate, endDate); } catch { throw new WorkflowError("invalid_date"); }
      try { assertGroupingDimension(groupBy); } catch { throw new WorkflowError("invalid_grouping"); }
      const sources = await repository.getSnapshotSources(householdId, endDate);
      return calculateCompositionSeries(sources, startDate, endDate, groupBy, scope);
    },
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
