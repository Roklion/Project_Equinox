import { assertPeriod } from "./cash-flow";
import { assertGroupingDimension, calculateSnapshot, groupSnapshot,
  type GroupingDimension, type SnapshotScope, type SnapshotSources } from "./snapshot";

/** Inclusive observation-date range. Older marks remain inputs for carry-forward,
 * but only selected investments' persisted observations create series points.
 * No synthetic endpoints, daily sampling, or interpolated values.
 */
export function calculateValueSeries(
  sources: SnapshotSources, startDate: string, endDate: string, scope: SnapshotScope = {},
) {
  assertPeriod(startDate, endDate);
  const selected = calculateSnapshot(sources, endDate, scope);
  const includedIds = new Set(selected.constituents.map((item) => item.investment.id));
  const dates = [...new Set(sources.marks
    .filter((mark) => includedIds.has(mark.investmentId) && startDate <= mark.asOfDate && mark.asOfDate <= endDate)
    .map((mark) => mark.asOfDate))].sort();
  const points = dates.map((date) => date === endDate ? selected : calculateSnapshot(sources, date, scope));
  return { startDate, endDate, points };
}

/** All segments and headline totals come from the same snapshot at each date. */
export function calculateCompositionSeries(
  sources: SnapshotSources, startDate: string, endDate: string, groupBy: GroupingDimension, scope: SnapshotScope = {},
) {
  assertGroupingDimension(groupBy);
  const series = calculateValueSeries(sources, startDate, endDate, scope);
  return { ...series, groupBy, points: series.points.map((snapshot) => ({
    ...snapshot, breakdown: groupSnapshot(snapshot, groupBy),
  })) };
}
