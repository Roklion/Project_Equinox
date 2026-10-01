import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InvestmentsPage from "./page";
import InvestmentDetailPage from "./[investmentId]/page";
import InvestmentHistoryPage from "./history/page";
import type { InvestmentOption } from "@/application/ports";

const mocks = vi.hoisted(() => ({ getInvestments: vi.fn(), householdAvailable: true }));
vi.mock("@/app/add/entry-data", () => ({
  withEntryService: (run: (context: unknown) => unknown) => mocks.householdAvailable
    ? run({ householdId: "synthetic-household", service: { getInvestments: mocks.getInvestments } }) : null,
}));
vi.mock("@/app/chart-data", () => ({ loadHistoricalCharts: vi.fn(async () => null) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));

const record: InvestmentOption = { id: "synthetic-investment", name: "Example investment", status: "closed",
  closedOn: "2026-09-01", assetClass: "Example asset class", accountType: null, taxStatus: null,
  liquidity: null, institution: null };

beforeEach(() => {
  mocks.householdAvailable = true;
  mocks.getInvestments.mockResolvedValue([record]);
});

describe("investment route foundations", () => {
  it("lists closed records with detail links and no fabricated valuation", async () => {
    const html = renderToStaticMarkup(await InvestmentsPage());
    expect(mocks.getInvestments).toHaveBeenCalledWith("synthetic-household");
    expect(html).toContain('href="/investments/synthetic-investment"');
    expect(html).toContain("Closed investment");
    expect(html).toContain("Financial summaries will be connected");
    expect(html).not.toContain("$0.00");
  });

  it("explains an empty/unconfigured household", async () => {
    mocks.householdAvailable = false;
    expect(renderToStaticMarkup(await InvestmentsPage())).toContain("No investments available");
    mocks.householdAvailable = true;
    mocks.getInvestments.mockResolvedValue([]);
    expect(renderToStaticMarkup(await InvestmentsPage())).toContain("No investments available");
  });

  it("does not expose database error details", async () => {
    mocks.getInvestments.mockRejectedValue(new Error("PRIVATE_DATABASE_DETAIL"));
    for (const page of [await InvestmentsPage(), await InvestmentDetailPage({ params: Promise.resolve({ investmentId: record.id }) })]) {
      const html = renderToStaticMarkup(page);
      expect(html).toContain('role="alert"');
      expect(html).toContain("Try again");
      expect(html).not.toContain("PRIVATE_DATABASE_DETAIL");
    }
  });

  it("shows canonical metadata and a preselected history link", async () => {
    const html = renderToStaticMarkup(await InvestmentDetailPage({ params: Promise.resolve({ investmentId: record.id }) }));
    expect(html).toContain("Closed on 2026-09-01");
    expect(html).toContain("Example asset class");
    expect(html).toContain("Not specified");
    expect(html).toContain('href="/investments/history?investmentId=synthetic-investment"');
  });

  it("returns not-found for an unknown investment without crossing household scope", async () => {
    await expect(InvestmentDetailPage({ params: Promise.resolve({ investmentId: "another-household-investment" }) }))
      .rejects.toThrow("not-found");
    expect(mocks.getInvestments).toHaveBeenCalledWith("synthetic-household");
  });

  it("passes detail context to the existing history owner and ignores repeated query parameters", async () => {
    const page = await InvestmentHistoryPage({ searchParams: Promise.resolve({ investmentId: record.id }) });
    const history = page.props.children.at(-1);
    expect(history.props.initialInvestmentId).toBe(record.id);
    const repeated = await InvestmentHistoryPage({ searchParams: Promise.resolve({ investmentId: [record.id, "other"] }) });
    expect(repeated.props.children.at(-1).props.initialInvestmentId).toBeUndefined();
  });
});
