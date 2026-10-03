import { expect, it } from "vitest";
import { createAnalyticsService } from "@/application/analytics";
import { queryOverview } from "@/application/overview";
import { canonicalSources, transferSources, investment, ids, ownerB, groupA, groupB,
  fixtureId, startDate, endDate } from "@/domain/analytics/testing/canonical-fixture";
import { classificationDimensions } from "@/domain/analytics/snapshot";
import { scopeSelection, snapshotScope } from "@/components/overview/reporting-scope";

function analytics(sources = canonicalSources()) {
  return createAnalyticsService({ getCashFlowSources: async () => sources, getSnapshotSources: async () => sources });
}
async function overview(query: Parameters<typeof scopeSelection>[0], sources = canonicalSources()) {
  return queryOverview(analytics(sources), "home", endDate, startDate, snapshotScope(scopeSelection(query)));
}
it("defaults to household and scopes joint-owner values, returns and both histories once", async () => {
  const household = await overview({});
  expect(household.snapshot.totals).toMatchObject({ status: "available", value: { navCents: 60780n } });
  const scoped = await overview({ owner: ownerB.id });
  expect(scoped.snapshot.constituents.map((item) => item.investment.id)).toEqual([ids.active, ids.partial]);
  expect(scoped.snapshot.totals).toMatchObject({ status: "available", value: { navCents: 32780n } });
  expect(scoped.returns.pnl).toEqual({ status: "available", value: 4980n });
  expect(scoped.returns.moic).toEqual({ status: "available", value: 1.166 });
  expect(scoped.returns.xirr.status).toBe("available");
  if (scoped.returns.xirr.status === "available") expect(scoped.returns.xirr.value).toBeCloseTo(0.1, 10);
  expect(scoped.history.valueSeries.points.at(-1)?.totals).toEqual(scoped.snapshot.totals);
  for (const series of Object.values(scoped.history.compositionSeries)) {
    expect(series.points.at(-1)?.totals).toEqual(scoped.snapshot.totals);
    expect(series.points.at(-1)?.constituents.map((item) => item.investment.id)).toEqual([ids.active, ids.partial]);
  }
});
it("unions overlapping custom groups without duplicating their investment", async () => {
  const scoped = await overview({ group: [groupA.id, groupB.id] });
  expect(scoped.snapshot.coverage.selectedCount).toBe(1);
  expect(scoped.snapshot.totals).toMatchObject({ value: { navCents: 12100n } });
  expect(scoped.returns.moic).toEqual({ status: "available", value: 1.21 });
  expect(Object.keys(scoped.history.compositionSeries)).not.toContain("customGroup");
});
it.each(classificationDimensions)("feeds the %s scope and intersections into all outputs", async (dimension) => {
  const sources = canonicalSources();
  sources.investments[0].classifications[dimension] = { id: fixtureId(90), label: "Synthetic classification" };
  const scoped = await overview({ [dimension]: fixtureId(90), owner: ownerB.id, group: groupA.id }, sources);
  expect(scoped.snapshot.constituents.map((item) => item.investment.id)).toEqual([ids.active]);
  expect(scoped.snapshot.totals).toMatchObject({ value: { navCents: 12100n } });
  expect(scoped.period.change).toMatchObject({ status: "available", value: { pnlCents: 2100n } });
  expect(scoped.returns.moic).toEqual({ status: "available", value: 1.21 });
  expect(scoped.history.valueSeries.points.at(-1)?.totals).toEqual(scoped.snapshot.totals);
  expect(scoped.history.compositionSeries[dimension].points.at(-1)?.totals).toEqual(scoped.snapshot.totals);
  expect((await overview({ [dimension]: fixtureId(90), group: "unused-group" }, sources)).snapshot.coverage.selectedCount).toBe(0);
});
it("uses authoritative boundary-relative transfer flows for investment sets", async () => {
  const sources = transferSources();
  for (const [selected, netFlow] of [
    [[ids.active, ids.leveraged], 0n], [[ids.active], -4000n], [[ids.leveraged], 4000n],
  ] as const) {
    const scoped = await overview({ investment: [...selected] }, sources);
    expect(scoped.period.cashFlows.netExternalCashFlowCents).toBe(netFlow);
    expect(scoped.period.change).toMatchObject({ status: "available", value: { pnlCents: 0n } });
    expect(scoped.returns.moic).toEqual({ status: "available", value: 1 });
    expect(scoped.returns.xirr).toMatchObject({ status: "available" });
  }
});
it("retains negative NAV, missing coverage, empty scopes and unavailable returns", async () => {
  const negative = await overview({ investment: ids.negative });
  expect(negative.snapshot.totals).toMatchObject({ value: { navCents: -2000n } });
  expect(negative.returns.moic).toEqual({ status: "available", value: -0.4 });
  expect(negative.returns.xirr).toEqual({ status: "unavailable", reason: "no_sign_change" });
  const sources = canonicalSources();
  const missing = investment(ids.missing); missing.customGroups = [groupA];
  sources.investments.push(missing);
  const incomplete = await overview({ group: groupA.id }, sources);
  expect(incomplete.snapshot.totals).toMatchObject({ status: "incomplete", missingInvestmentIds: [ids.missing] });
  expect(incomplete.returns.moic.status).toBe("incomplete");
  expect(incomplete.returns.xirr.status).toBe("incomplete");
  expect(incomplete.history.valueSeries.points.at(-1)?.totals.status).toBe("incomplete");
  const empty = await overview({ owner: "unused-owner" });
  expect(empty.snapshot.coverage.selectedCount).toBe(0);
  expect(empty.returns.moic).toEqual({ status: "unavailable", reason: "zero_contributions" });
  expect(empty.returns.xirr).toEqual({ status: "unavailable", reason: "no_sign_change" });
  expect(empty.history.valueSeries.points).toEqual([]);
});
