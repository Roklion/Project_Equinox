import { describe, expect, it } from "vitest";
import { calculateCompositionSeries, calculateValueSeries } from "./series";
import { calculateSnapshot, classificationDimensions, type AnalyticsInvestment, type AnalyticsMark,
  type GroupingDimension, type SnapshotSources } from "./snapshot";

function investment(id: string, overrides: Partial<AnalyticsInvestment> = {}): AnalyticsInvestment {
  return { id, name: "Example " + id, status: "active", closedOn: null,
    owners: [{ id: "owner-a", label: "Owner A" }], customGroups: [],
    classifications: { assetClass: null, accountType: null, taxStatus: null, liquidity: null, institution: null },
    ...overrides };
}
function mark(investmentId: string, asOfDate: string, grossValue: string, debt = "0"): AnalyticsMark {
  return { id: investmentId + asOfDate, investmentId, asOfDate, grossValue, debt };
}
const start = "2026-01-01";
const middle = "2026-01-10";
const end = "2026-01-20";
function mixedSources(): SnapshotSources {
  return { investments: [investment("a"), investment("b", { status: "closed", closedOn: middle })], marks: [
    mark("b", middle, "20", "30"), mark("a", end, "150", "10"),
    mark("a", start, "100", "10"), mark("a", middle, "120", "10"),
    mark("a", "2026-01-21", "999"), mark("unselected", "2026-01-12", "999"),
  ] };
}

describe("canonical observation-date series", () => {
  it("sorts and deduplicates relevant dates, exposes incomplete and mixed-date carried values without interpolation", () => {
    const sources = mixedSources();
    const series = calculateValueSeries(sources, start, end);
    expect(series.points.map((point) => point.asOfDate)).toEqual([start, middle, end]);
    expect(series.points[0].totals).toEqual({ status: "incomplete",
      reason: "missing_valuation", missingInvestmentIds: ["b"] });
    expect(series.points[0].coverage).toEqual({ selectedCount: 2, valuedCount: 1, missingInvestmentIds: ["b"] });
    expect(series.points[1].totals).toEqual({ status: "available",
      value: { grossValueCents: 14000n, debtCents: 4000n, navCents: 10000n } });
    expect(series.points[2].totals).toEqual({ status: "available",
      value: { grossValueCents: 17000n, debtCents: 4000n, navCents: 13000n } });
    expect(series.points[2].constituents[1]).toMatchObject({ investment: { id: "b", status: "closed" },
      valuation: { status: "available", value: { markAsOfDate: middle, ageDays: 10, navCents: -1000n } } });
    expect(calculateValueSeries({ investments: [...sources.investments].reverse(),
      marks: [...sources.marks].reverse() }, start, end)).toEqual(series);
  });

  it("filters dates inclusively while retaining marks before the range as carry-forward inputs", () => {
    const sources = mixedSources();
    sources.marks = sources.marks.filter((item) => item.id !== "a" + middle);
    const series = calculateValueSeries(sources, middle, end);
    expect(series.points.map((point) => point.asOfDate)).toEqual([middle, end]);
    expect(series.points[0].totals).toEqual({ status: "available",
      value: { grossValueCents: 12000n, debtCents: 4000n, navCents: 8000n } });
    expect(series.points[0].constituents[0].valuation).toMatchObject({
      status: "available", value: { markAsOfDate: start, ageDays: 9 } });
    expect(calculateValueSeries(sources, middle, middle).points.map((point) => point.asOfDate)).toEqual([middle]);
    expect(calculateValueSeries(sources, "2026-01-11", "2026-01-19").points).toEqual([]);
    expect(calculateValueSeries(sources, start, end, { investmentIds: [] }).points).toEqual([]);
    expect(calculateValueSeries({ investments: sources.investments, marks: [] }, start, end).points).toEqual([]);
  });

  it("uses scope-selected dates and current metadata, with overlapping groups as union filters only", () => {
    const sources = mixedSources();
    const groups = [{ id: "one", label: "Group 1" }, { id: "two", label: "Group 2" }];
    sources.investments[0].customGroups = groups;
    sources.investments[1].owners = [{ id: "owner-b", label: "Owner B" }];
    sources.investments[1].customGroups = [groups[1]];
    sources.investments[0].classifications.assetClass = { id: "class-a", label: "Class A" };
    sources.marks = sources.marks.filter((item) => item.id !== "a" + middle);
    const selected = calculateCompositionSeries(sources, start, end, "investment",
      { ownerIds: ["owner-a"], customGroupIds: ["one", "two"], classifications: { assetClass: ["class-a"] } });
    expect(selected.points.map((point) => point.asOfDate)).toEqual([start, end]); // b's date is excluded.
    expect(selected.points[0].coverage.selectedCount).toBe(1);
    expect(selected.points[0].breakdown.map((bucket) => bucket.investmentIds)).toEqual([["a"]]);
    const union = calculateCompositionSeries(sources, start, end, "investment", { customGroupIds: ["one", "two"] });
    expect(union.points[2].coverage.selectedCount).toBe(2);
    expect(union.points[2].totals).toMatchObject({ status: "available", value: { navCents: 13000n } });
  });

  it.each(["investment", ...classificationDimensions, "ownerSet"] as GroupingDimension[])(
    "reconciles exact gross/debt/NAV segment totals and headline snapshots at every complete point for %s", (groupBy) => {
      const sources = mixedSources();
      const jointOwners = [{ id: "owner-b", label: "Owner B" }, { id: "owner-a", label: "Owner A" }];
      sources.investments[0].owners = jointOwners;
      sources.investments[1].owners = [...jointOwners].reverse();
      for (const dimension of classificationDimensions) {
        sources.investments[0].classifications[dimension] = { id: dimension + "-a", label: "Same label" };
        sources.investments[1].classifications[dimension] = { id: dimension + "-b", label: "Same label" };
      }
      const total = calculateValueSeries(sources, start, end);
      const composition = calculateCompositionSeries(sources, start, end, groupBy);
      expect(composition.groupBy).toBe(groupBy);
      expect(composition.points.map(({ asOfDate, totals, coverage, constituents }) => ({ asOfDate, totals, coverage, constituents }))).toEqual(total.points);
      for (const point of composition.points) {
        expect(point.totals).toEqual(calculateSnapshot(sources, point.asOfDate).totals);
        expect(point.breakdown.flatMap((bucket) => bucket.investmentIds).sort()).toEqual(["a", "b"]);
        if (point.totals.status !== "available") continue;
        const sum = { grossValueCents: 0n, debtCents: 0n, navCents: 0n };
        for (const bucket of point.breakdown) {
          expect(bucket.totals.status).toBe("available");
          if (bucket.totals.status !== "available") throw new Error("Expected complete bucket.");
          for (const measure of ["grossValueCents", "debtCents", "navCents"] as const) sum[measure] += bucket.totals.value[measure];
        }
        expect(sum).toEqual(point.totals.value);
        if (groupBy === "ownerSet") {
          expect(point.breakdown).toHaveLength(1);
          expect(point.breakdown[0].label).toBe("Owner A + Owner B");
          expect(point.breakdown[0].investmentIds).toEqual(["a", "b"]);
        } else expect(point.breakdown).toHaveLength(2); // Stable identities, including equal classification labels.
      }
    });

  it("keeps partial bucket coverage visible without presenting a partial aggregate total", () => {
    const result = calculateCompositionSeries(mixedSources(), start, end, "investment").points[0];
    expect(result.totals).not.toHaveProperty("value");
    expect(result.breakdown[0].totals).toEqual({ status: "available",
      value: { grossValueCents: 10000n, debtCents: 1000n, navCents: 9000n } });
    expect(result.breakdown[1].totals).toEqual({ status: "incomplete",
      reason: "missing_valuation", missingInvestmentIds: ["b"] });
  });

  it("reflects corrections and deletions on the next calculation, including changed observation dates", () => {
    const sources = mixedSources();
    sources.marks.find((item) => item.id === "a" + end)!.asOfDate = "2026-01-19";
    sources.marks.find((item) => item.id === "a" + start)!.grossValue = "101.01";
    const changed = calculateValueSeries(sources, start, end);
    expect(changed.points.map((point) => point.asOfDate)).toEqual([start, middle, "2026-01-19"]);
    expect(changed.points[0].constituents[0].valuation).toMatchObject({
      status: "available", value: { grossValueCents: 10101n } });
    sources.marks = sources.marks.filter((item) => item.asOfDate !== middle);
    expect(calculateValueSeries(sources, start, end).points.map((point) => point.asOfDate)).toEqual([start, "2026-01-19"]);
    expect(calculateCompositionSeries(sources, start, end, "investment").points[1].totals.status).toBe("incomplete");
  });

  it("rejects invalid ranges and overlapping custom groups as an additive dimension", () => {
    expect(() => calculateValueSeries(mixedSources(), end, start)).toThrow();
    expect(() => calculateValueSeries(mixedSources(), "2026-02-30", end)).toThrow();
    expect(() => calculateCompositionSeries(mixedSources(), start, end, "customGroup" as GroupingDimension))
      .toThrow("Unsupported additive grouping dimension");
  });
});
