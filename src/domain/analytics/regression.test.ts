import { describe, expect, it } from "vitest";
import { calculateInception, calculatePeriod } from "./cash-flow";
import { calculateReturns } from "./returns";
import { calculateCompositionSeries, calculateValueSeries } from "./series";
import { calculateSnapshot, classificationDimensions, type GroupingDimension } from "./snapshot";
import { canonicalSources, endDate, expectedHousehold as household, expectedInvestments,
  external, fixtureId, groupA, groupB, ids, investment, middleDate, ownerA, startDate, transferSources } from "./testing/canonical-fixture";

const available = <T>(value: T) => ({ status: "available", value });

describe("EPIC 3 canonical cross-metric regressions", () => {
  it.each(expectedInvestments)("reconciles $id value, capital, P&L and returns", (expected) => {
    const sources = canonicalSources();
    const scope = { investmentIds: [expected.id] };
    const snapshot = calculateSnapshot(sources, endDate, scope);
    const inception = calculateInception(sources, endDate, scope);
    const period = calculatePeriod(sources, startDate, endDate, scope);
    const returns = calculateReturns(sources, endDate, scope);
    expect(snapshot.totals).toEqual(available({ grossValueCents: expected.gross,
      debtCents: expected.debt, navCents: expected.nav }));
    if (snapshot.totals.status === "available") {
      const value = snapshot.totals.value;
      expect(value.navCents).toBe(value.grossValueCents - value.debtCents);
    }
    expect(inception.cashFlows).toEqual({ contributionsCents: expected.contributions,
      distributionsCents: expected.distributions, netExternalCashFlowCents: expected.contributions - expected.distributions });
    expect(inception.pnl).toEqual(available(expected.pnl));
    expect(returns.pnl).toEqual(inception.pnl);
    expect(returns.moic).toEqual(available(expected.moic));
    if (expected.rate === null) expect(returns.xirr).toEqual({ status: "unavailable", reason: "no_sign_change" });
    else {
      expect(returns.xirr.status).toBe("available");
      if (returns.xirr.status === "available") expect(returns.xirr.value).toBeCloseTo(expected.rate, 9);
    }
    expect(period.change.status).toBe("available");
    if (period.change.status === "available") {
      const change = period.change.value;
      expect(change.pnlCents).toBe(expected.pnl);
      expect(change.navChangeCents).toBe(change.netExternalCashFlowCents + change.investmentPerformanceEffectCents);
      expect(change.pnlCents).toBe(change.endingNavCents + period.cashFlows.distributionsCents
        - period.cashFlows.contributionsCents - change.beginningNavCents);
    }
  });

  it("reconciles household capital and period change with independently totaled values", () => {
    const sources = canonicalSources();
    const returns = calculateReturns(sources, endDate);
    expect(returns.snapshot.totals).toEqual(available({ grossValueCents: household.gross,
      debtCents: household.debt, navCents: household.nav }));
    expect(returns.cashFlows).toEqual({ contributionsCents: household.contributions,
      distributionsCents: household.distributions, netExternalCashFlowCents: 54000n });
    expect(returns.pnl).toEqual(available(household.pnl));
    expect(returns.moic).toEqual(available(91780 / 85000));
    const period = calculatePeriod(sources, startDate, endDate);
    expect(period.flows.map((flow) => flow.actionId)).toEqual([fixtureId(35), fixtureId(36), fixtureId(37)]);
    expect(period.change).toEqual(available({ beginningNavCents: household.beginningNav,
      endingNavCents: household.nav, navChangeCents: household.navChange,
      netExternalCashFlowCents: household.periodNetFlow,
      investmentPerformanceEffectCents: household.pnl, pnlCents: household.pnl }));
    expect(calculatePeriod(sources, startDate, startDate).cashFlows.netExternalCashFlowCents).toBe(0n);
  });

  it("solves aggregate returns once rather than averaging either child ratios or rates", () => {
    const sources = canonicalSources();
    const result = calculateReturns(sources, endDate, { investmentIds: [ids.active, ids.closed] });
    // -300 at inception, +409 two years later: (1+r)^2 = 409/300.
    expect(result.moic).toEqual(available(409 / 300));
    expect(result.moic).not.toEqual(available((1.21 + 1.44) / 2));
    expect(result.xirr.status).toBe("available");
    if (result.xirr.status === "available") {
      expect(result.xirr.value).toBeCloseTo(Math.sqrt(409 / 300) - 1, 9);
      expect(result.xirr.value).not.toBeCloseTo((0.1 + 0.2) / 2, 5);
      expect(result.xirr.value).not.toBeCloseTo((100 * 0.1 + 200 * 0.2) / 300, 5);
    }
  });

  it.each([
    { scope: {}, contributions: 10000n, distributions: 0n, net: 0n, nav: 10000n },
    { scope: { investmentIds: [ids.active] }, contributions: 10000n, distributions: 4000n, net: -4000n, nav: 6000n },
    { scope: { investmentIds: [ids.leveraged] }, contributions: 4000n, distributions: 0n, net: 4000n, nav: 4000n },
  ])("shares transfer boundary semantics across all metrics: $nav cents", (expected) => {
    const sources = transferSources();
    const returns = calculateReturns(sources, endDate, expected.scope);
    const period = calculatePeriod(sources, startDate, endDate, expected.scope);
    expect(returns.cashFlows.contributionsCents).toBe(expected.contributions);
    expect(returns.cashFlows.distributionsCents).toBe(expected.distributions);
    expect(returns.pnl).toEqual(available(0n));
    expect(returns.moic).toEqual(available(1));
    expect(returns.xirr.status).toBe("available");
    if (returns.xirr.status === "available") expect(returns.xirr.value).toBeCloseTo(0, 9);
    expect(period.change).toMatchObject(available({ navChangeCents: expected.net,
      netExternalCashFlowCents: expected.net, investmentPerformanceEffectCents: 0n, pnlCents: 0n }));
    expect(returns.snapshot.totals).toMatchObject(available({ navCents: expected.nav }));
  });

  const dimensions: GroupingDimension[] = ["investment", ...classificationDimensions, "ownerSet"];
  it.each(dimensions)("reconciles historical %s composition with headline snapshots", (dimension) => {
    const sources = canonicalSources();
    const value = calculateValueSeries(sources, startDate, endDate);
    const composition = calculateCompositionSeries(sources, startDate, endDate, dimension);
    expect(value.points.map((point) => point.asOfDate)).toEqual([startDate, middleDate, endDate]);
    expect(value.points.map((point) => point.totals)).toEqual([
      available({ grossValueCents: 85000n, debtCents: 10000n, navCents: 75000n }),
      available({ grossValueCents: 85000n, debtCents: 10000n, navCents: 75000n }),
      available({ grossValueCents: 74780n, debtCents: 14000n, navCents: 60780n }),
    ]);
    for (const [index, point] of composition.points.entries()) {
      expect(point.totals).toEqual(value.points[index].totals);
      expect(point.totals).toEqual(calculateSnapshot(sources, point.asOfDate).totals);
      const sums = { grossValueCents: 0n, debtCents: 0n, navCents: 0n };
      for (const bucket of point.breakdown) {
        expect(bucket.totals.status).toBe("available");
        if (bucket.totals.status === "available") {
          for (const measure of ["grossValueCents", "debtCents", "navCents"] as const) sums[measure] += bucket.totals.value[measure];
        }
      }
      expect(available(sums)).toEqual(point.totals);
    }
    const leveraged = value.points[2].constituents.find((item) => item.investment.id === ids.leveraged)!;
    expect(leveraged.valuation).toMatchObject(available({ markAsOfDate: middleDate, ageDays: 365, navCents: 30000n }));
    if (dimension === "ownerSet") {
      expect(composition.points[2].breakdown).toHaveLength(2);
      expect(composition.points[2].breakdown.find((bucket) => bucket.label === "Owner A + Owner B"))
        .toMatchObject({ investmentIds: [ids.active, ids.partial], totals: available({ navCents: 32780n }) });
    }
    expect(calculateSnapshot(sources, endDate, { ownerIds: [ownerA.id] }).totals).toEqual(value.points[2].totals);
    expect(calculateSnapshot(sources, endDate, { customGroupIds: [groupA.id, groupB.id] }).totals)
      .toEqual(available({ grossValueCents: 12100n, debtCents: 0n, navCents: 12100n }));
  });

  it("keeps capital available but all dependent metrics incomplete with a future-only mark", () => {
    const sources = canonicalSources();
    sources.investments.push(investment(ids.missing));
    sources.marks.push({ id: fixtureId(50), investmentId: ids.missing, asOfDate: "2023-01-02", grossValue: "10", debt: "0" });
    const incomplete = { status: "incomplete", reason: "missing_valuation", missingInvestmentIds: [ids.missing] };
    const result = calculateReturns(sources, endDate);
    expect(result.snapshot.totals).toEqual(incomplete);
    expect(result.pnl).toEqual(incomplete);
    expect(result.moic).toEqual(incomplete);
    expect(result.xirr).toEqual(incomplete);
    expect(result.cashFlows.contributionsCents).toBe(household.contributions);
    expect(calculatePeriod(sources, startDate, endDate).change).toEqual(incomplete);
    const composition = calculateCompositionSeries(sources, startDate, endDate, "investment");
    for (const point of composition.points) {
      expect(point.totals).toEqual(incomplete);
      expect(point.coverage).toEqual({ selectedCount: 6, valuedCount: 5, missingInvestmentIds: [ids.missing] });
      expect(point.breakdown.filter((bucket) => bucket.totals.status === "available")).toHaveLength(5);
    }
  });

  it.each([
    { name: "zero contributions", contribution: null, withdrawal: null, nav: "10", debt: "0", moic: null, reason: "no_sign_change" },
    { name: "root outside supported domain", contribution: "1", withdrawal: null, nav: "10000000000000", debt: "0", moic: 10000000000000, reason: "no_root" },
    // -100 + 230/(1+r) - 132/(1+r)^2 has roots 10% and 20%.
    { name: "ambiguous roots", contribution: "100", withdrawal: "230", nav: "0", debt: "132", moic: 0.98, reason: "multiple_roots" },
  ])("preserves explicit return states: $name", (scenario) => {
    const id = ids.active;
    const sources = { investments: [investment(id)],
      marks: [{ id: fixtureId(60), investmentId: id, asOfDate: endDate, grossValue: scenario.nav, debt: scenario.debt }],
      actions: [
        ...(scenario.contribution ? [external(fixtureId(61), id, "contribution", startDate, scenario.contribution)] : []),
        ...(scenario.withdrawal ? [external(fixtureId(62), id, "withdrawal", middleDate, scenario.withdrawal)] : []),
      ] };
    const result = calculateReturns(sources, endDate);
    expect(result.moic).toEqual(scenario.moic === null ? { status: "unavailable", reason: "zero_contributions" } : available(scenario.moic));
    expect(result.xirr).toEqual({ status: "unavailable", reason: scenario.reason });
  });
});
