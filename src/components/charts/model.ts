import type { calculateCompositionSeries, calculateValueSeries } from "@/domain/analytics/series";
import type { GroupingDimension, Snapshot, SnapshotMoney } from "@/domain/analytics/snapshot";
export type ValueSeries = ReturnType<typeof calculateValueSeries>;
export type CompositionSeries = ReturnType<typeof calculateCompositionSeries>;
export type Measure = keyof SnapshotMoney;
export type Range = "3M" | "1Y" | "All";
export const groupings: readonly { value: GroupingDimension; label: string }[] = [
  { value: "investment", label: "Investment" }, { value: "assetClass", label: "Asset class" },
  { value: "accountType", label: "Account type" }, { value: "taxStatus", label: "Tax status" },
  { value: "liquidity", label: "Liquidity" }, { value: "institution", label: "Institution" },
  { value: "ownerSet", label: "Owner set" },
];
export const measures: Record<Measure, string> = {
  navCents: "Net investment value", grossValueCents: "Gross value", debtCents: "Investment-linked debt",
};
export function visiblePoints<T extends Snapshot>(points: readonly T[], endDate: string, range: Range): T[] {
  const end = new Date(endDate + "T00:00:00Z");
  if (range !== "All") {
    const day = end.getUTCDate();
    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() - (range === "3M" ? 3 : 12));
    const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    end.setUTCDate(Math.min(day, lastDay));
  }
  const start = range === "All" ? "" : end.toISOString().slice(0, 10);
  return points.filter((point) => point.asOfDate >= start && point.asOfDate <= endDate)
    .toSorted((a, b) => a.asOfDate.localeCompare(b.asOfDate));
}
export const timestamp = (date: string) => Date.parse(date + "T00:00:00Z");
export function nearestPoint(points: readonly Snapshot[], fraction: number): number {
  if (points.length < 2) return 0;
  const first = timestamp(points[0].asOfDate);
  const target = first + Math.max(0, Math.min(1, fraction)) * (timestamp(points.at(-1)!.asOfDate) - first);
  return points.reduce((best, point, index) =>
    Math.abs(timestamp(point.asOfDate) - target) < Math.abs(timestamp(points[best].asOfDate) - target) ? index : best, 0);
}
export function selectedFraction(points: readonly Snapshot[], index: number): number {
  if (points.length < 2) return 0.5;
  return (timestamp(points[index].asOfDate) - timestamp(points[0].asOfDate))
    / (timestamp(points.at(-1)!.asOfDate) - timestamp(points[0].asOfDate));
}
/** Floating point is used for geometry only. Exact cents remain in summaries. */
export function trendData(points: readonly Snapshot[], measure: Measure) {
  return points.map((point) => [timestamp(point.asOfDate),
    point.totals.status === "available" ? Number(point.totals.value[measure]) / 100 : null]);
}
export function compositionData(points: CompositionSeries["points"], universe = points) {
  const segments = [...new Map(universe.flatMap((point) => point.breakdown.map((bucket) =>
    [bucket.key, { key: bucket.key, label: bucket.label }] as const))).values()]
    .toSorted((a, b) => a.key.localeCompare(b.key));
  const negative = points.some((point) => point.breakdown.some((bucket) =>
    bucket.totals.status === "available" && bucket.totals.value.navCents < 0n));
  return { negative, segments: segments.map((segment) => ({
    ...segment, data: points.map((point) => {
      const bucket = point.breakdown.find((item) => item.key === segment.key);
      // Absent membership is distinct from a missing valuation.
      const value = point.totals.status !== "available" ? null
        : !bucket ? 0 : bucket.totals.status === "available" ? Number(bucket.totals.value.navCents) / 100 : null;
      return [timestamp(point.asOfDate), value];
    }),
  })) };
}
