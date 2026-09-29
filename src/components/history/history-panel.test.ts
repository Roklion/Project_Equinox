import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { deletionConfirmation, HistoryEmptyStates } from "./history-panel";

describe("history empty states", () => {
  it("shows the history empty state after a successful empty response", () => {
    const html = renderToStaticMarkup(createElement(HistoryEmptyStates, {
      loading: false, loadFailed: false, selectedId: "investment-1", itemCount: 0, investmentCount: 1,
    }));
    expect(html).toContain("No actions or valuation marks are recorded for this investment.");
  });

  it("does not present a failed request as an empty history or investment list", () => {
    const historyHtml = renderToStaticMarkup(createElement(HistoryEmptyStates, {
      loading: false, loadFailed: true, selectedId: "investment-1", itemCount: 0, investmentCount: 1,
    }));
    const investmentsHtml = renderToStaticMarkup(createElement(HistoryEmptyStates, {
      loading: false, loadFailed: true, selectedId: "", itemCount: 0, investmentCount: 0,
    }));
    expect(historyHtml).not.toContain("No actions or valuation marks");
    expect(investmentsHtml).not.toContain("No investments are available yet.");
  });
});

describe("history deletion confirmation", () => {
  it("uses the persisted effective date after the draft date changes", () => {
    expect(deletionConfirmation({ kind: "contribution", originalAsOfDate: "", originalEffectiveDate: "2026-08-01", date: "2026-08-02" }))
      .toBe("Delete this contribution dated 2026-08-01?");
  });
});
