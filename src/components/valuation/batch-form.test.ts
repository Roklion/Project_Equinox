import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BatchEmptyState, BatchFields, BatchSaveNotice } from "./batch-form";

const sampleInvestment = {
  id: "example-account", name: "Sample Market Account", status: "active" as const, closedOn: null,
  assetClass: "Public markets", accountType: "Brokerage", taxStatus: null, liquidity: null,
  institution: "Example Provider", previous: null, latest: null,
  existing: { id: "mark-1", asOfDate: "2026-09-29", grossValue: "9999.00", debt: "25.00", netValue: "9974.00" },
};

describe("batch valuation empty state", () => {
  it("shows the empty state after a successful response with no active investments", () => {
    const html = renderToStaticMarkup(createElement(BatchEmptyState, {
      hasDate: true, loading: false, loadFailed: false, investmentCount: 0,
    }));
    expect(html).toContain("No active investments are available for this date.");
  });

  it("does not present a failed request as a confirmed empty list", () => {
    const html = renderToStaticMarkup(createElement(BatchEmptyState, {
      hasDate: true, loading: false, loadFailed: true, investmentCount: 0,
    }));
    expect(html).not.toContain("No active investments are available for this date.");
  });

  it("does not show a no-investments result when the date is cleared", () => {
    const html = renderToStaticMarkup(createElement(BatchEmptyState, {
      hasDate: false, loading: false, loadFailed: false, investmentCount: 0,
    }));
    expect(html).toBe("");
  });
});

describe("batch save notice", () => {
  it("renders successful save feedback independently from context status", () => {
    const html = renderToStaticMarkup(createElement(BatchSaveNotice, {
      message: "2 valuation marks saved for 2026-09-28.",
    }));
    expect(html).toContain("2 valuation marks saved for 2026-09-28.");
    expect(html).toContain('role="status"');
  });
});

describe("batch valuation field errors", () => {
  it("highlights the correction choice instead of gross value", () => {
    const html = renderToStaticMarkup(createElement(BatchFields, {
      investment: sampleInvestment,
      input: { grossValue: "4444.50", debt: "", operation: "create" },
      rowError: { message: "Choose correction explicitly for the existing mark.", field: "operation" },
      onUpdate: () => {},
    }));

    expect(html).toContain('id="operation-example-account"');
    expect(html).toContain('aria-invalid="true" aria-describedby="batch-error-example-account"');
    expect(html).toMatch(/<input id="gross-example-account"[^>]*aria-invalid="false"/);
    expect(html.indexOf('id="operation-example-account"')).toBeLessThan(html.indexOf("Choose correction explicitly for the existing mark."));
  });

  it("keeps the correction choice available when the server finds a newly existing mark", () => {
    const html = renderToStaticMarkup(createElement(BatchFields, {
      investment: { ...sampleInvestment, existing: null },
      input: { grossValue: "4444.50", debt: "", operation: "create" },
      rowError: { message: "A mark already exists on this date. Choose correction explicitly.", field: "operation" },
      onUpdate: () => {},
    }));

    expect(html).toContain('id="operation-example-account"');
    expect(html).toContain('aria-invalid="true"');
  });
});
