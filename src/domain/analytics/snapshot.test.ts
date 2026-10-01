import { describe, expect, it } from "vitest";
import { calculateSnapshot, classificationDimensions, groupSnapshot,
  type AnalyticsInvestment, type AnalyticsMark, type GroupingDimension } from "./snapshot";

const ownerA = { id: "owner-a", label: "Owner A" };
const ownerB = { id: "owner-b", label: "Owner B" };
function investment(id: string, overrides: Partial<AnalyticsInvestment> = {}): AnalyticsInvestment {
  return { id, name: "Sample " + id, status: "active", closedOn: null,
    owners: [ownerA], customGroups: [],
    classifications: { assetClass: null, accountType: null, taxStatus: null, liquidity: null, institution: null },
    ...overrides };
}
function mark(investmentId: string, asOfDate: string, grossValue = "100.00", debt = "0.00"): AnalyticsMark {
  return { id: investmentId + asOfDate, investmentId, asOfDate, grossValue, debt };
}

describe("point-in-time valuation snapshots", () => {
  it("selects latest on-or-before marks independent of input order and exposes mixed dates and negative NAV", () => {
    const snapshot = calculateSnapshot({
      investments: [investment("a"), investment("b", { status: "closed", closedOn: "2026-03-08" })],
      marks: [mark("a", "2026-03-10", "999.00"), mark("a", "2026-03-09", "0.30", "0.10"),
        mark("a", "2026-03-01", "1.00"), mark("b", "2026-03-07", "10.01", "20.02")],
    }, "2026-03-09");
    expect(snapshot.totals).toEqual({ status: "available",
      value: { grossValueCents: 1031n, debtCents: 2012n, navCents: -981n } });
    expect(snapshot.coverage).toEqual({ selectedCount: 2, valuedCount: 2, missingInvestmentIds: [] });
    expect(snapshot.constituents.map((item) => item.valuation)).toEqual([
      { status: "available", value: { markId: "a2026-03-09", markAsOfDate: "2026-03-09", ageDays: 0,
        grossValueCents: 30n, debtCents: 10n, navCents: 20n } },
      { status: "available", value: { markId: "b2026-03-07", markAsOfDate: "2026-03-07", ageDays: 2,
        grossValueCents: 1001n, debtCents: 2002n, navCents: -1001n } },
    ]);
  });

  it("keeps missing/future-only valuations explicit at aggregate and bucket level", () => {
    const snapshot = calculateSnapshot({ investments: [investment("a"), investment("b"), investment("c")],
      marks: [mark("a", "2026-01-01"), mark("b", "2026-02-01")] }, "2026-01-15");
    expect(snapshot.totals).toEqual({ status: "incomplete", reason: "missing_valuation", missingInvestmentIds: ["b", "c"] });
    expect(snapshot.coverage).toEqual({ selectedCount: 3, valuedCount: 1, missingInvestmentIds: ["b", "c"] });
    expect(groupSnapshot(snapshot, "assetClass")[0].totals).toEqual(snapshot.totals);
    const buckets = groupSnapshot(snapshot, "investment");
    expect(buckets[0].totals).toEqual({ status: "available",
      value: { grossValueCents: 10000n, debtCents: 0n, navCents: 10000n } });
    expect(buckets[1].totals.status).toBe("incomplete");
    expect(buckets[2].totals.status).toBe("incomplete");
  });

  it("retains closed history at historical and later dates without synthesizing zero on closure", () => {
    const sources = { investments: [investment("a", { status: "closed", closedOn: "2026-01-15" })],
      marks: [mark("a", "2026-01-01", "5.00"), mark("a", "2026-01-15", "0.00")] };
    expect(calculateSnapshot(sources, "2026-01-10").totals).toEqual({ status: "available",
      value: { grossValueCents: 500n, debtCents: 0n, navCents: 500n } });
    expect(calculateSnapshot(sources, "2026-01-20").totals).toEqual({ status: "available",
      value: { grossValueCents: 0n, debtCents: 0n, navCents: 0n } });
  });

  it("sums beyond safe floating-point integer capacity without losing cents", () => {
    const snapshot = calculateSnapshot({ investments: [investment("a"), investment("b")],
      marks: [mark("a", "2026-01-01", "9999999999999999.99"), mark("b", "2026-01-01", "0.02")] }, "2026-01-01");
    expect(snapshot.totals).toEqual({ status: "available",
      value: { grossValueCents: 1000000000000000001n, debtCents: 0n, navCents: 1000000000000000001n } });
  });

  it.each(["investment", ...classificationDimensions, "ownerSet"] as GroupingDimension[])(
    "assigns each investment once and reconciles all money measures for %s", (dimension) => {
      const joint = investment("a", { owners: [ownerB, ownerA], classifications: {
        assetClass: { id: "class-a", label: "Shared label" }, accountType: { id: "type", label: "Type" },
        taxStatus: { id: "tax", label: "Tax" }, liquidity: { id: "liquid", label: "Liquid" },
        institution: { id: "institution", label: "Institution" },
      } });
      const reversed = { ...joint, id: "b", owners: [ownerA, ownerB] };
      const solo = investment("c", { classifications: { ...joint.classifications,
        assetClass: { id: "class-b", label: "Shared label" } } });
      const snapshot = calculateSnapshot({ investments: [joint, reversed, solo, investment("d")],
        marks: [mark("a", "2026-01-01", "2.01"), mark("b", "2026-01-01", "3.02", "4.00"),
          mark("c", "2026-01-01", "5.03"), mark("d", "2026-01-01", "1.00")] }, "2026-01-01");
      const buckets = groupSnapshot(snapshot, dimension);
      expect(buckets.flatMap((bucket) => bucket.investmentIds).sort()).toEqual(["a", "b", "c", "d"]);
      const sum = { grossValueCents: 0n, debtCents: 0n, navCents: 0n };
      for (const bucket of buckets) {
        expect(bucket.totals.status).toBe("available");
        if (bucket.totals.status === "available") {
          sum.grossValueCents += bucket.totals.value.grossValueCents;
          sum.debtCents += bucket.totals.value.debtCents;
          sum.navCents += bucket.totals.value.navCents;
        }
      }
      expect(snapshot.totals).toEqual({ status: "available", value: sum });
      if (dimension === "ownerSet") {
        expect(buckets).toHaveLength(2);
        expect(buckets.find((bucket) => bucket.label === "Owner A + Owner B")?.investmentIds).toEqual(["a", "b"]);
      }
      if (dimension === "investment") expect(buckets).toHaveLength(4);
      if (dimension === "assetClass") {
        expect(buckets).toHaveLength(3); // Identity, not label, owns grouping.
        expect(buckets.find((bucket) => bucket.key === JSON.stringify("class-a"))?.investmentIds).toEqual(["a", "b"]);
        expect(buckets.find((bucket) => bucket.key === JSON.stringify("class-b"))?.investmentIds).toEqual(["c"]);
      }
      if (classificationDimensions.includes(dimension as typeof classificationDimensions[number]) && dimension !== "assetClass") {
        expect(buckets).toHaveLength(2);
        expect(buckets.find((bucket) => bucket.label !== "Unclassified")?.investmentIds).toEqual(["a", "b", "c"]);
      }
    },
  );

  it("selects by stable classification identities and intersects multiple dimensions", () => {
    const classA = { id: "class-a", label: "Shared label" };
    const classB = { id: "class-b", label: "Shared label" };
    const account = { id: "account", label: "Account" };
    const first = investment("a");
    const second = investment("b");
    const third = investment("c");
    first.classifications = { ...first.classifications, assetClass: classA, accountType: account };
    second.classifications = { ...second.classifications, assetClass: classB, accountType: account };
    third.classifications = { ...third.classifications, assetClass: classA };
    const sources = { investments: [first, second, third], marks: ["a", "b", "c"].map((id) => mark(id, "2026-01-01")) };
    const snapshot = calculateSnapshot(sources, "2026-01-01", {
      classifications: { assetClass: ["class-a", "class-b"], accountType: ["account"] },
    });
    expect(snapshot.constituents.map((item) => item.investment.id)).toEqual(["a", "b"]);
    expect(calculateSnapshot(sources, "2026-01-01", { classifications: { assetClass: ["class-a"] } })
      .constituents.map((item) => item.investment.id)).toEqual(["a", "c"]);
  });
  it("uses overlapping custom groups as union filters, and combines dimensions by intersection", () => {
    const groups = [{ id: "g1", label: "Group 1" }, { id: "g2", label: "Group 2" }];
    const sources = { investments: [investment("a", { customGroups: groups }),
      investment("b", { owners: [ownerB], customGroups: [groups[1]] }), investment("c")],
      marks: ["a", "b", "c"].map((id) => mark(id, "2026-01-01")) };
    const union = calculateSnapshot(sources, "2026-01-01", { customGroupIds: ["g1", "g2"] });
    expect(union.coverage.selectedCount).toBe(2);
    expect(union.totals).toEqual({ status: "available", value: { grossValueCents: 20000n, debtCents: 0n, navCents: 20000n } });
    expect(calculateSnapshot(sources, "2026-01-01",
      { customGroupIds: ["g2"], ownerIds: ["owner-a"] }).constituents.map((item) => item.investment.id)).toEqual(["a"]);
    expect(calculateSnapshot(sources, "2026-01-01", { investmentIds: [] }).totals).toEqual({ status: "available",
      value: { grossValueCents: 0n, debtCents: 0n, navCents: 0n } });
    expect(calculateSnapshot(sources, "2026-01-01",
      { classifications: { assetClass: ["unknown"] } }).coverage.selectedCount).toBe(0);
  });
});
