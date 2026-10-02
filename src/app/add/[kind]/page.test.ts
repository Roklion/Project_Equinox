import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

import { EntryForm } from "@/components/entry/entry-form";
import EntryPage from "./page";

describe("entry kind route", () => {
  it.each(["contribution", "withdrawal", "valuation", "transfer"])("passes launch defaults to %s", async (kind) => {
    const page = await EntryPage({ params: Promise.resolve({ kind }), searchParams: Promise.resolve({ investmentId: "synthetic-a", date: "2026-02-01", from: "investment" }) });
    const form = page.props.children.find((child: { type: unknown }) => child.type === EntryForm);
    expect(form.props).toMatchObject({ kind, initialInvestmentId: "synthetic-a", initialDate: "2026-02-01", returnToInvestment: "/investments/synthetic-a?date=2026-02-01" });
  });

  it.each(["__proto__", "constructor", "toString"])("rejects inherited property name %s", async (kind) => {
    await expect(EntryPage({ params: Promise.resolve({ kind }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
