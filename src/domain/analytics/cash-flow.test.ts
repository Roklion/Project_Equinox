import { describe, expect, it } from "vitest";
import { calculateInception, calculatePeriod, classifyCashFlows, type AnalyticsAction, type CashFlowSources } from "./cash-flow";
import type { AnalyticsInvestment, AnalyticsMark } from "./snapshot";

function investment(id: string, closed = false): AnalyticsInvestment {
  return { id, name: "Example " + id, status: closed ? "closed" : "active", closedOn: closed ? "2026-01-31" : null,
    owners: [{ id: "owner", label: "Owner A" }], customGroups: [],
    classifications: { assetClass: null, accountType: null, taxStatus: null, liquidity: null, institution: null } };
}
function mark(investmentId: string, asOfDate: string, grossValue: string, debt = "0"): AnalyticsMark {
  return { id: investmentId + asOfDate, investmentId, asOfDate, grossValue, debt };
}
function external(id: string, investmentId: string, kind: "contribution" | "withdrawal", effectiveDate: string, amount: string): AnalyticsAction {
  return { id, kind, effectiveDate, amount,
    movements: [{ investmentId, role: "external", direction: kind === "contribution" ? "in" : "out", amount }] };
}
function transfer(effectiveDate = "2026-01-15", amount = "25.01"): AnalyticsAction {
  return { id: "transfer", kind: "transfer", effectiveDate, amount, movements: [
    { investmentId: "a", role: "source", direction: "out", amount },
    { investmentId: "b", role: "destination", direction: "in", amount },
  ] };
}
const start = "2026-01-01";
const end = "2026-01-31";

function expectIdentity(result: ReturnType<typeof calculatePeriod>) {
  expect(result.change.status).toBe("available");
  if (result.change.status !== "available") throw new Error("Expected complete period.");
  const value = result.change.value;
  expect(value.navChangeCents).toBe(value.netExternalCashFlowCents + value.investmentPerformanceEffectCents);
  expect(value.pnlCents).toBe(value.endingNavCents + result.cashFlows.distributionsCents
    - result.cashFlows.contributionsCents - value.beginningNavCents);
}

describe("boundary-relative cash flows and exact period changes", () => {
  it("separates contributions and partial distributions from investment performance", () => {
    const sources: CashFlowSources = { investments: [investment("a")],
      marks: [mark("a", start, "100"), mark("a", end, "135.05"), mark("a", "2026-02-01", "999")],
      actions: [external("add", "a", "contribution", "2026-01-10", "50.10"),
        external("partial", "a", "withdrawal", end, "20.02")] };
    const result = calculatePeriod(sources, start, end);
    expect(result.cashFlows).toEqual({ contributionsCents: 5010n, distributionsCents: 2002n, netExternalCashFlowCents: 3008n });
    expect(result.change).toEqual({ status: "available", value: { beginningNavCents: 10000n, endingNavCents: 13505n,
      navChangeCents: 3505n, netExternalCashFlowCents: 3008n, investmentPerformanceEffectCents: 497n, pnlCents: 497n } });
    expectIdentity(result);
  });

  it.each([
    [["a", "b"], 0n, 0n, 0n], [["a"], 0n, 2501n, 0n], [["b"], 2501n, 0n, 0n], [[], 0n, 0n, 0n],
  ] as const)("treats transfer boundary %j once and avoids fictitious performance", (ids, contributions, distributions, pnl) => {
    const sources: CashFlowSources = { investments: [investment("a"), investment("b")], actions: [transfer()],
      marks: [mark("a", start, "100"), mark("b", start, "0"), mark("a", end, "74.99"), mark("b", end, "25.01")] };
    const result = calculatePeriod(sources, start, end, { investmentIds: ids });
    expect(result.cashFlows).toEqual({ contributionsCents: contributions, distributionsCents: distributions,
      netExternalCashFlowCents: contributions - distributions });
    expect(result.change).toMatchObject({ status: "available", value: { pnlCents: pnl } });
    expectIdentity(result);
    // Household scope includes both investments, so even gross external totals exclude this transfer.
    expect(calculateInception(sources, end).cashFlows).toEqual({
      contributionsCents: 0n, distributionsCents: 0n, netExternalCashFlowCents: 0n });
  });

  it("excludes the start day, includes the end day, and excludes future actions", () => {
    const sources: CashFlowSources = { investments: [investment("a")], marks: [mark("a", start, "10")], actions: [
      external("opening", "a", "contribution", start, "10"),
      external("ending", "a", "withdrawal", end, "2"),
      external("future", "a", "contribution", "2026-02-01", "999"),
    ] };
    const result = calculatePeriod(sources, start, end);
    expect(result.flows.map((flow) => flow.actionId)).toEqual(["ending"]);
    expectIdentity(result);
    const inception = calculateInception(sources, end);
    expect(inception.netInvestedCapitalCents).toBe(800n);
    expect(inception.pnl).toEqual({ status: "available", value: 200n });
    const sameDay = calculatePeriod(sources, end, end);
    expect(sameDay.flows).toEqual([]);
    expect(sameDay.change).toMatchObject({ status: "available", value: { navChangeCents: 0n, pnlCents: 0n } });
    expectIdentity(sameDay);
  });

  it("retains fully realized closed history and cumulative distributions above contributions", () => {
    const sources: CashFlowSources = { investments: [investment("a", true)],
      marks: [mark("a", start, "100"), mark("a", end, "0")], actions: [
        external("capital", "a", "contribution", "2025-12-01", "100"),
        external("exit", "a", "withdrawal", end, "125.25"),
      ] };
    const period = calculatePeriod(sources, start, "2026-02-10");
    expect(period.change).toMatchObject({ status: "available", value: { endingNavCents: 0n, pnlCents: 2525n } });
    expectIdentity(period);
    expect(calculateInception(sources, "2026-02-10")).toMatchObject({
      netInvestedCapitalCents: -2525n, pnl: { status: "available", value: 2525n } });
  });

  it("preserves negative beginning and ending NAV and sums beyond safe numeric integer capacity", () => {
    const sources: CashFlowSources = { investments: [investment("a"), investment("b")],
      marks: [mark("a", start, "0", "20.02"), mark("b", start, "0"),
        mark("a", end, "0", "40.04"), mark("b", end, "0")], actions: [
        external("large-a", "a", "contribution", end, "9999999999999999.99"),
        external("large-b", "b", "contribution", end, "9999999999999999.99"),
        external("withdrawal", "a", "withdrawal", end, "0.01"),
      ] };
    const result = calculatePeriod(sources, start, end);
    expect(result.cashFlows.contributionsCents).toBe(1999999999999999998n);
    expect(result.change).toMatchObject({ status: "available", value: { beginningNavCents: -2002n,
      endingNavCents: -4004n, pnlCents: -2000000000000001999n } });
    expectIdentity(result);
  });

  it("reports incomplete endpoint coverage without losing cash-flow-only totals", () => {
    const sources: CashFlowSources = { investments: [investment("a"), investment("b")],
      marks: [mark("a", end, "100")], actions: [external("capital", "a", "contribution", end, "100")] };
    const result = calculatePeriod(sources, start, end);
    expect(result.beginning.coverage.missingInvestmentIds).toEqual(["a", "b"]);
    expect(result.ending.coverage.missingInvestmentIds).toEqual(["b"]);
    expect(result.change).toEqual({ status: "incomplete", reason: "missing_valuation", missingInvestmentIds: ["a", "b"] });
    expect(result.change).not.toHaveProperty("value");
    expect(result.cashFlows.contributionsCents).toBe(10000n);
    const inception = calculateInception(sources, end);
    expect(inception.pnl).toEqual({ status: "incomplete", reason: "missing_valuation", missingInvestmentIds: ["b"] });
    expect(inception.netInvestedCapitalCents).toBe(10000n);
    expect(calculateInception(sources, end, { investmentIds: ["a"] }).pnl).toEqual({ status: "available", value: 0n });
  });

  it("uses the snapshot selection for owner and overlapping custom-group scopes", () => {
    const a = investment("a");
    a.customGroups = [{ id: "one", label: "Group 1" }, { id: "two", label: "Group 2" }];
    const b = investment("b");
    b.owners = [{ id: "other", label: "Owner B" }];
    const sources: CashFlowSources = { investments: [a, b], actions: [transfer()],
      marks: [mark("a", start, "100"), mark("b", start, "0"), mark("a", end, "74.99"), mark("b", end, "25.01")] };
    const result = calculatePeriod(sources, start, end, { ownerIds: ["owner"], customGroupIds: ["one", "two"] });
    expect(result.ending.coverage.selectedCount).toBe(1);
    expect(result.cashFlows.distributionsCents).toBe(2501n);
    expectIdentity(result);
  });

  it("rejects invalid ranges and incomplete or mismatched canonical action records", () => {
    const empty = { investments: [], marks: [], actions: [] };
    expect(() => calculatePeriod(empty, end, start)).toThrow();
    expect(() => calculatePeriod(empty, start, "2026-02-30")).toThrow();
    expect(() => calculateInception(empty, "2026-2-1")).toThrow();
    const broken = transfer();
    broken.movements.pop();
    expect(() => classifyCashFlows([broken], new Set(["a"]))).toThrow("Incomplete canonical transfer");
    const mismatch = transfer();
    mismatch.movements[1].amount = "25.02";
    expect(() => classifyCashFlows([mismatch], new Set(["a", "b"]))).toThrow("amounts disagree");
    const missingExternal = external("broken", "a", "contribution", end, "1");
    missingExternal.movements = [];
    expect(() => classifyCashFlows([missingExternal], new Set(["a"]))).toThrow("Incomplete canonical external action");
  });
});
