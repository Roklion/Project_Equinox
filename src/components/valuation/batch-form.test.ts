import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BatchEmptyState } from "./batch-form";

describe("batch valuation empty state", () => {
  it("shows the empty state after a successful response with no active investments", () => {
    const html = renderToStaticMarkup(createElement(BatchEmptyState, {
      loading: false, loadFailed: false, investmentCount: 0,
    }));
    expect(html).toContain("No active investments are available for this date.");
  });

  it("does not present a failed request as a confirmed empty list", () => {
    const html = renderToStaticMarkup(createElement(BatchEmptyState, {
      loading: false, loadFailed: true, investmentCount: 0,
    }));
    expect(html).not.toContain("No active investments are available for this date.");
  });
});
