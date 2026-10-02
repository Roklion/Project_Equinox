import { describe, expect, it } from "vitest";
import { calculateValueSeries, calculateCompositionSeries } from "@/domain/analytics/series";
import { canonicalSources, startDate, endDate, ids } from "@/domain/analytics/testing/canonical-fixture";
import { compositionData, groupings, nearestPoint, trendData, visiblePoints } from "./model";

describe("authoritative chart mapping", () => {
  const sources = canonicalSources();
  const value = calculateValueSeries(sources, startDate, endDate);
  it("orders irregular observations without generating endpoints and selects nearest calendar date", () => {
    const points = visiblePoints([...value.points].reverse(), endDate, "All");
    expect(points.map((point) => point.asOfDate)).toEqual(["2021-01-01", "2022-01-01", "2023-01-01"]);
    expect(nearestPoint(points, 0.6)).toBe(1);
    expect(visiblePoints(points, endDate, "3M").map((point) => point.asOfDate)).toEqual([endDate]);
    expect(trendData(points, "navCents").map((item) => item[1])).toEqual([750, 750, 607.8]);
  });
  it("preserves negative NAV, one observation and no observations", () => {
    const series = calculateValueSeries(sources, endDate, endDate, { investmentIds: [ids.negative] });
    expect(trendData(series.points, "navCents")[0][1]).toBe(-20);
    expect(nearestPoint(series.points, 1)).toBe(0);
    expect(visiblePoints([], endDate, "All")).toEqual([]);
  });
  it("maps every additive grouping including a joint owner bucket to supplied values", () => {
    for (const { value: dimension } of groupings) {
      const composition = calculateCompositionSeries(sources, startDate, endDate, dimension);
      const mapped = compositionData(composition.points);
      for (const [index, expected] of [750, 750, 607.8].entries()) {
        expect(mapped.segments.reduce((sum, segment) => sum + (segment.data[index][1] ?? 0), 0)).toBeCloseTo(expected);
      }
      for (const segment of mapped.segments) {
        const bucket = composition.points.at(-1)!.breakdown.find((item) => item.key === segment.key)!;
        expect(bucket.totals.status).toBe("available");
        if (bucket.totals.status === "available") expect(segment.data.at(-1)![1]).toBe(Number(bucket.totals.value.navCents) / 100);
      }
      if (dimension === "ownerSet") expect(mapped.segments.some((segment) => segment.label === "Owner A + Owner B")).toBe(true);
    }
    expect(groupings.map((group) => group.value)).not.toContain("customGroup");
  });
  it("does not plot complete-looking segments at an incomplete point; missing membership is separate", () => {
    const missing = { ...sources, marks: sources.marks.filter((mark) => mark.investmentId !== ids.partial) };
    const composition = calculateCompositionSeries(missing, startDate, endDate, "investment");
    expect(trendData(composition.points, "navCents").every((item) => item[1] === null)).toBe(true);
    expect(compositionData(composition.points).segments.every((segment) => segment.data.every((item) => item[1] === null))).toBe(true);
    const complete = calculateCompositionSeries(sources, startDate, endDate, "investment");
    const narrower = calculateCompositionSeries(sources, startDate, endDate, "investment",
      { investmentIds: sources.investments.filter((item) => item.id !== ids.active).map((item) => item.id) });
    const altered = complete.points.map((point, index) => index === 1 ? narrower.points[index] : point);
    const mapped = compositionData(altered);
    expect(mapped.segments.find((segment) => segment.key === ids.active)!.data.map((item) => item[1])).toEqual([100, 0, 121]);
    expect(mapped.negative).toBe(true);
  });
});

it("keeps categorical identity stable across time-range changes", () => {
  const composition = calculateCompositionSeries(canonicalSources(), startDate, endDate, "investment");
  const latest = composition.points.at(-1)!;
  const range = calculateCompositionSeries(canonicalSources(), latest.asOfDate, latest.asOfDate, "investment",
    { investmentIds: [ids.negative] }).points;
  expect(compositionData(range, composition.points).segments.map((segment) => segment.key))
    .toEqual(compositionData(composition.points).segments.map((segment) => segment.key));
});
it("includes month-end and leap-day boundaries without calendar overflow", () => {
  const base = calculateValueSeries(canonicalSources(), startDate, endDate).points[0];
  const points = [{ ...base, asOfDate: "2025-02-28" }, { ...base, asOfDate: "2025-03-01" }];
  expect(visiblePoints(points, "2025-05-31", "3M").map((point) => point.asOfDate))
    .toEqual(["2025-02-28", "2025-03-01"]);
  expect(visiblePoints([{ ...base, asOfDate: "2023-02-28" }], "2024-02-29", "1Y")).toHaveLength(1);
});
