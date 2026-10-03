import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NavigationLinks } from "../src/components/navigation-links";
import { ChartFrame, HeadlineValue, ReturnMetric, ValueBreakdown } from "../src/components/financial/primitives";
import { InvestmentRow } from "../src/components/financial/investment-row";
import { InvestmentBrowseFilters } from "../src/components/financial/investment-browse-filters";
import { calculateSnapshot } from "../src/domain/analytics/snapshot";
import { canonicalSources } from "../src/domain/analytics/testing/canonical-fixture";

const sources = canonicalSources();
for (const dimension of ["accountType", "taxStatus", "liquidity"] as const) {
  sources.investments[0].classifications[dimension] = { id: dimension + "-id", label: "Example " + dimension };
}
const browseItems = calculateSnapshot(sources, "2026-10-01").constituents;
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const asOfDate = "2026-10-01";
const available = <T,>(value: T) => ({ status: "available" as const, value });
  const content = renderToStaticMarkup(h("div", { className: "app-shell" },
    h("a", { className: "skip-link", href: "#main-content" }, "Skip to content"),
    h(NavigationLinks, { pathname: "/investments/synthetic" }),
    h("main", { id: "main-content", tabIndex: -1 },
      h("h1", null, "Example investment"),
      h(InvestmentBrowseFilters, { items: browseItems, date: asOfDate, query: { lifecycle: "all", accountType: "accountType-id", taxStatus: "taxStatus-id", liquidity: "liquidity-id" } }),
      h(HeadlineValue, { label: "Net investment value", result: available(-5000n), asOfDate,
        delta: available(-1000n), context: "this month" }),
      h(ValueBreakdown, { asOfDate, result: available({ grossValueCents: 10000n, debtCents: 15000n, navCents: -5000n }) }),
      h(ReturnMetric, { kind: "XIRR", asOfDate, result: { status: "unavailable", reason: "no_sign_change" } }),
      h(ReturnMetric, { kind: "MOIC", asOfDate, result: { status: "ambiguous", reason: "Multiple candidate returns need review." } }),
      h(ChartFrame, { title: "Value trend", summary: h(HeadlineValue, { label: "Selected value", result: available(-5000n), asOfDate }),
        children: h("p", null, "Synthetic chart summary") }),
      h(InvestmentRow, { investment: { id: "synthetic", name: "Example investment", status: "active" }, asOfDate,
        valuation: available({ grossValueCents: 10000n, debtCents: 15000n, navCents: -5000n,
          markId: "synthetic", markAsOfDate: "2026-09-01", ageDays: 30 }) }),
    )));
mkdirSync(".next", { recursive: true });
writeFileSync(".next/presentation-fixture.html", `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${content}</body></html>`);
