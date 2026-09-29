import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BatchEmptyState, BatchSaveNotice } from "./batch-form";

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
