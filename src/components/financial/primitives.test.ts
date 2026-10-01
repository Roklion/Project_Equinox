import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatDate, formatMoney } from "./format";
import { AsOfDate, ChartFrame, HeadlineValue, MetadataRows, PerformanceBreakdown, ReturnMetric,
  SignedDelta, SurfaceState, ValueBreakdown, ValuationAge } from "./primitives";
import { InvestmentRow } from "./investment-row";
import { calculateSnapshot } from "@/domain/analytics/snapshot";
import { canonicalSources } from "@/domain/analytics/testing/canonical-fixture";

const incomplete = { status: "incomplete", reason: "missing_valuation", missingInvestmentIds: ["missing"] } as const;
// MetricResult uses a mutable ID array; fixtures remain synthetic.
const missing = { ...incomplete, missingInvestmentIds: ["missing"] };
const asOfDate = "2026-10-01";

describe("financial presentation", () => {
  it("formats exact money including aggregate values beyond safe integer precision", () => {
    expect(formatMoney(-50n)).toBe("−$0.50");
    expect(formatMoney(0n, true)).toBe("$0.00");
    expect(formatMoney(12345n, true)).toBe("+$123.45");
    expect(formatMoney(900719925474099301n)).toBe("$9,007,199,254,740,993.01");
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
  });

  it("keeps negative NAV, signed context and the as-of date explicit", () => {
    const html = renderToStaticMarkup(h(HeadlineValue, { label: "Net investment value", asOfDate,
      result: { status: "available", value: -5000n }, delta: { status: "available", value: -1000n }, context: "this month" }));
    expect(html).toContain("−$50.00");
    expect(html).toContain("Decrease:");
    expect(html).toContain("−$10.00");
    expect(html).toContain('dateTime="2026-10-01"');
    expect(html).toContain("USD");
  });

  it("never converts incomplete valuation coverage to a zero", () => {
    const html = renderToStaticMarkup(h(HeadlineValue, { label: "NAV", asOfDate, result: missing }));
    expect(html).toContain("Unavailable:");
    expect(html).toContain("Valuation coverage is incomplete");
    expect(html).not.toContain("$0.00");
    expect(html).toContain('dateTime="2026-10-01"');
  });

  it("uses supplied gross/debt/NAV without recomputing the net", () => {
    const html = renderToStaticMarkup(h(ValueBreakdown, { asOfDate, result: { status: "available",
      value: { grossValueCents: 10000n, debtCents: 15000n, navCents: -4900n } } }));
    expect(html).toContain("$100.00");
    expect(html).toContain("$150.00");
    expect(html).toContain("−$49.00");
    expect(html).not.toContain("−$50.00");
  });

  it("presents supplied cash-flow/performance and P&L results independently", () => {
    const html = renderToStaticMarkup(h(PerformanceBreakdown, { startDate: "2026-09-01", endDate: asOfDate,
      result: { status: "available", value: { beginningNavCents: 0n, endingNavCents: 0n,
        navChangeCents: 2000n, netExternalCashFlowCents: 3000n, investmentPerformanceEffectCents: -1000n, pnlCents: -900n } } }));
    for (const value of ["+$20.00", "+$30.00", "−$10.00", "−$9.00", "Profit / loss"])
      expect(html).toContain(value);
  });

  it.each(["zero_contributions", "no_sign_change", "no_root"] as const)("explains unavailable %s returns", (reason) => {
    const html = renderToStaticMarkup(h(ReturnMetric, { kind: "XIRR", asOfDate, result: { status: "unavailable", reason } }));
    expect(html).toContain("Unavailable:");
    expect(html).not.toContain("0.00%");
    expect(html).toContain("Since inception");
  });

  it("preserves a valid zero return and negative multiple", () => {
    expect(renderToStaticMarkup(h(ReturnMetric, { kind: "XIRR", asOfDate, result: { status: "available", value: 0 } })))
      .toContain("0.00%");
    expect(renderToStaticMarkup(h(ReturnMetric, { kind: "MOIC", asOfDate, result: { status: "available", value: -0.5 } })))
      .toContain("-0.50×");
  });

  it("supports ambiguous result explanations without altering the domain solver", () => {
    const html = renderToStaticMarkup(h(ReturnMetric, { kind: "XIRR", asOfDate,
      result: { status: "ambiguous", reason: "More than one supported result." } }));
    expect(html).toContain("Ambiguous:");
    expect(html).toContain("More than one supported result.");
    expect(html).not.toContain("0.00%");
  });

  it("labels older valuations with their original date and supplied age", () => {
    const html = renderToStaticMarkup(h(ValuationAge, { markAsOfDate: "2026-09-01", ageDays: 30 }));
    expect(html).toContain("Older valuation · 30 days old");
    expect(html).toContain('dateTime="2026-09-01"');
    expect(renderToStaticMarkup(h(ValuationAge, { markAsOfDate: asOfDate, ageDays: 0 }))).toContain("Current valuation");
  });

  it("provides metadata and accessible loading/error states", () => {
    expect(renderToStaticMarkup(h(MetadataRows, { rows: [{ label: "Institution", value: null }] }))).toContain("Not specified");
    expect(renderToStaticMarkup(h(SurfaceState, { kind: "loading", title: "Loading" }))).toContain('role="status" aria-busy="true"');
    expect(renderToStaticMarkup(h(SurfaceState, { kind: "error", title: "Try again" }))).toContain('role="alert"');
  });

  it("composes a chart frame with selected-date context outside the chart", () => {
    const html = renderToStaticMarkup(h(ChartFrame, { title: "Value trend", summary: h(AsOfDate, { date: asOfDate }),
      children: h("div", null, "Chart placeholder") }));
    expect(html).toContain('aria-live="polite"');
    expect(html.indexOf('dateTime="2026-10-01"')).toBeLessThan(html.indexOf("Chart placeholder"));
  });

  it("labels an unchanged signed delta without relying on color", () => {
    expect(renderToStaticMarkup(h(SignedDelta, { result: { status: "available", value: 0n }, context: "this month" })))
      .toContain("No change:");
  });

  it("consumes authoritative snapshot constituents in an investment row", () => {
    const fixture = canonicalSources();
    const snapshot = calculateSnapshot(fixture, "2026-01-01");
    const constituent = snapshot.constituents[0];
    const html = renderToStaticMarkup(h(InvestmentRow, { ...constituent, asOfDate: snapshot.asOfDate }));
    expect(html).toContain(`/investments/${constituent.investment.id}`);
    expect(html).toContain('dateTime="2026-01-01"');
  });
});
