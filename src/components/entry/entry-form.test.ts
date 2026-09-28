import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EntryForm } from "./entry-form";

describe("entry form semantics", () => {
  it("presents a single linked transfer with distinct source and destination choices", () => {
    const html = renderToStaticMarkup(createElement(EntryForm, { kind: "transfer" }));
    expect(html).toContain("Move value from");
    expect(html).toContain("Move value to");
    expect(html).toContain('<select id="sourceInvestmentId"');
    expect(html).toContain("Amount to move");
    expect(html).toContain("one linked transfer");
    expect(html).not.toContain("Withdrawal / Distribution");
  });

  it("presents gross and debt inputs with an explicit as-of date", () => {
    const html = renderToStaticMarkup(createElement(EntryForm, { kind: "valuation" }));
    expect(html).toContain("As-of date");
    expect(html).toContain("Gross investment value");
    expect(html).toContain("Investment-linked debt");
    const debtInput = html.match(/<input[^>]*id="debt"[^>]*>/)?.[0];
    expect(debtInput).toContain('value=""');
    expect(debtInput).not.toContain("required");
    expect(html).toContain("Leave blank to use zero.");
    expect(html).toContain("Save valuation mark");
  });

  it("uses positive amount labels for external actions", () => {
    const contribution = renderToStaticMarkup(createElement(EntryForm, { kind: "contribution" }));
    const withdrawal = renderToStaticMarkup(createElement(EntryForm, { kind: "withdrawal" }));
    expect(contribution).toContain("Amount contributed");
    expect(withdrawal).toContain("Amount withdrawn");
    expect(contribution).toContain("Enter a positive amount.");
  });
});
