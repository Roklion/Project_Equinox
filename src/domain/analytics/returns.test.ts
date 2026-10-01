import { describe, expect, it } from "vitest";
import { calculateReturns } from "./returns";
import type { AnalyticsAction, CashFlowSources } from "./cash-flow";
import type { AnalyticsInvestment, AnalyticsMark } from "./snapshot";
import type { MetricResult } from "./contracts";

const start = "2021-01-01";
const middle = "2022-01-01";
const end = "2023-01-01";
function investment(id: string, closed = false): AnalyticsInvestment {
  return { id, name: "Example " + id, status: closed ? "closed" : "active", closedOn: closed ? end : null,
    owners: [{ id: id, label: "Owner " + id }], customGroups: [],
    classifications: { assetClass: null, accountType: null, taxStatus: null, liquidity: null, institution: null } };
}
function mark(investmentId: string, grossValue: string, debt = "0", asOfDate = end): AnalyticsMark {
  return { id: investmentId + asOfDate, investmentId, asOfDate, grossValue, debt };
}
function external(id: string, investmentId: string, kind: "contribution" | "withdrawal",
  effectiveDate: string, amount: string): AnalyticsAction {
  return { id, kind, effectiveDate, amount,
    movements: [{ investmentId, role: "external", direction: kind === "contribution" ? "in" : "out", amount }] };
}
function number(result: MetricResult<number>): number {
  expect(result.status).toBe("available");
  if (result.status !== "available") throw new Error("Expected available metric.");
  return result.value;
}

describe("inception returns from canonical scope inputs", () => {
  it("recomputes aggregate ratios and XIRR instead of averaging children", () => {
    const sources: CashFlowSources = { investments: [investment("a"), investment("b")],
      actions: [external("a", "a", "contribution", middle, "100"),
        external("b", "b", "contribution", middle, "900")],
      marks: [mark("a", "200"), mark("b", "990")] };
    const aggregate = calculateReturns(sources, end);
    const a = calculateReturns(sources, end, { investmentIds: ["a"] });
    const b = calculateReturns(sources, end, { investmentIds: ["b"] });
    expect(number(aggregate.moic)).toBe(1.19);
    expect(number(aggregate.xirr)).toBeCloseTo(0.19, 10);
    expect(number(a.xirr)).toBeCloseTo(1, 10);
    expect(number(b.xirr)).toBeCloseTo(0.1, 10);
    expect(number(aggregate.xirr)).not.toBeCloseTo((number(a.xirr) + number(b.xirr)) / 2, 3);

    // Different inception dates also defeat value/contribution-weighted child rates:
    // 100*q^2 + 100*q = 231 -> q=1.1.
    sources.actions[0].effectiveDate = start;
    sources.actions[1].amount = sources.actions[1].movements[0].amount = "100";
    sources.marks = [mark("a", "121"), mark("b", "110")];
    const portfolioRate = number(calculateReturns(sources, end).xirr);
    expect(portfolioRate).toBeCloseTo(0.1, 10);
    // Change individual marks without changing aggregate NAV: same portfolio rate.
    sources.marks = [mark("a", "150"), mark("b", "81")];
    expect(number(calculateReturns(sources, end).xirr)).toBeCloseTo(portfolioRate, 10);
    const childA = number(calculateReturns(sources, end, { investmentIds: ["a"] }).xirr);
    const childB = number(calculateReturns(sources, end, { investmentIds: ["b"] }).xirr);
    expect(portfolioRate).not.toBeCloseTo((childA + childB) / 2, 3);
    expect(portfolioRate).not.toBeCloseTo((150 * childA + 81 * childB) / 231, 3);
  });

  it("shares transfer cancellation and both one-sided boundary treatments", () => {
    const transfer: AnalyticsAction = { id: "transfer", kind: "transfer", effectiveDate: middle, amount: "50",
      movements: [{ investmentId: "a", role: "source", direction: "out", amount: "50" },
        { investmentId: "b", role: "destination", direction: "in", amount: "50" }] };
    const sources = { investments: [investment("a"), investment("b")], marks: [mark("a", "66"), mark("b", "55")],
      actions: [external("capital", "a", "contribution", start, "100"), transfer] };
    const all = calculateReturns(sources, end);
    expect(all.flows.map((flow) => flow.actionId)).toEqual(["capital"]);
    expect(number(all.moic)).toBe(1.21);
    expect(number(all.xirr)).toBeCloseTo(0.1, 10);
    const source = calculateReturns(sources, end, { ownerIds: ["a"] });
    expect(source.cashFlows.distributionsCents).toBe(5000n);
    expect(number(source.moic)).toBe(1.16);
    expect(number(source.xirr)).toBeCloseTo(0.1, 10);
    const destination = calculateReturns(sources, end, { investmentIds: ["b"] });
    expect(destination.cashFlows.contributionsCents).toBe(5000n);
    expect(number(destination.moic)).toBe(1.1);
    expect(number(destination.xirr)).toBeCloseTo(0.1, 10);
  });

  it("includes partial and fully realized closed history, carrying terminal marks to measurement date", () => {
    const sources = { investments: [investment("a", true)], marks: [mark("a", "66")],
      actions: [external("capital", "a", "contribution", start, "100"),
        external("partial", "a", "withdrawal", middle, "50")] };
    expect(number(calculateReturns(sources, end).moic)).toBe(1.16);
    expect(number(calculateReturns(sources, end).xirr)).toBeCloseTo(0.1, 10);
    sources.marks = [mark("a", "0")];
    sources.actions[1] = external("exit", "a", "withdrawal", end, "121");
    expect(number(calculateReturns(sources, end).moic)).toBe(1.21);
    expect(number(calculateReturns(sources, end).xirr)).toBeCloseTo(0.1, 10);
    expect(number(calculateReturns(sources, "2024-01-01").xirr)).toBeCloseTo(0.1, 10);
  });

  it("preserves negative NAV, zero-contribution MOIC, and incomplete coverage explicitly", () => {
    const sources: CashFlowSources = { investments: [investment("a")], marks: [mark("a", "0", "20")],
      actions: [external("capital", "a", "contribution", start, "100")] };
    expect(calculateReturns(sources, end)).toMatchObject({
      moic: { status: "available", value: -0.2 }, xirr: { status: "unavailable", reason: "no_sign_change" } });
    sources.actions = [];
    expect(calculateReturns(sources, end).moic).toEqual({ status: "unavailable", reason: "zero_contributions" });
    sources.marks = [];
    const incomplete = { status: "incomplete", reason: "missing_valuation", missingInvestmentIds: ["a"] };
    expect(calculateReturns(sources, end)).toMatchObject({ moic: incomplete, xirr: incomplete });
    expect(calculateReturns(sources, end, { investmentIds: [] })).toMatchObject({
      moic: { status: "unavailable", reason: "zero_contributions" },
      xirr: { status: "unavailable", reason: "no_sign_change" } });
  });

  it("recalculates corrections and excludes future cash flows and valuations", () => {
    const sources = { investments: [investment("a")], marks: [mark("a", "121"), mark("a", "999", "0", "2024-01-01")],
      actions: [external("capital", "a", "contribution", start, "100"),
        external("future", "a", "contribution", "2024-01-01", "999")] };
    expect(number(calculateReturns(sources, end).xirr)).toBeCloseTo(0.1, 10);
    sources.marks[0].grossValue = "144";
    expect(number(calculateReturns(sources, end).xirr)).toBeCloseTo(0.2, 10);
    sources.actions[0].amount = sources.actions[0].movements[0].amount = "144";
    expect(number(calculateReturns(sources, end).moic)).toBe(1);
    expect(number(calculateReturns(sources, end).xirr)).toBeCloseTo(0, 10);
    sources.actions = [];
    expect(calculateReturns(sources, end).moic).toEqual({ status: "unavailable", reason: "zero_contributions" });
  });

  it("keeps exact numerator addition even beyond safe numeric integer capacity", () => {
    const sources = { investments: [investment("a"), investment("b")],
      marks: [mark("a", "9999999999999999.99"), mark("b", "9999999999999999.99")],
      actions: [external("a", "a", "contribution", start, "9999999999999999.99"),
        external("b", "b", "contribution", start, "9999999999999999.99"),
        external("distribution", "a", "withdrawal", middle, "0.01")] };
    const result = calculateReturns(sources, end);
    expect(result.cashFlows.contributionsCents).toBe(1999999999999999998n);
    expect(number(result.moic)).toBe(1); // Sub-double precision difference; ratio is intentionally floating point.
    expect(result.snapshot.totals).toMatchObject({ status: "available", value: { navCents: 1999999999999999998n } });
  });
});

it("places a carried-forward terminal NAV on the measurement date", () => {
  const sources = { investments: [investment("a")], marks: [mark("a", "121", "0", middle)],
    actions: [external("capital", "a", "contribution", start, "100")] };
  const result = calculateReturns(sources, end);
  expect(number(result.xirr)).toBeCloseTo(0.1, 10); // Two years, despite the one-year-old mark.
  expect(result.snapshot.constituents[0].valuation).toMatchObject({
    status: "available", value: { markAsOfDate: middle, ageDays: 365 } });
});

it("appends signed negative aggregate NAV when earlier distributions make a root usable", () => {
  const sources = { investments: [investment("a")], marks: [mark("a", "0", "110", middle)],
    actions: [external("capital", "a", "contribution", start, "100"),
      external("distribution", "a", "withdrawal", start, "200")] };
  const result = calculateReturns(sources, middle);
  expect(number(result.moic)).toBe(0.9);
  expect(number(result.xirr)).toBeCloseTo(0.1, 10);
});
