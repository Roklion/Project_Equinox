import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAnalyticsService } from "@/application/analytics";
import { canonicalSources, endDate, ids, investment, startDate } from "@/domain/analytics/testing/canonical-fixture";
import InvestmentsPage from "./page";
import InvestmentDetailPage from "./[investmentId]/page";
import { loadHistoricalCharts } from "@/app/chart-data";
import InvestmentHistoryPage from "./history/page";

const mocked = vi.hoisted(() => ({ root: vi.fn(), chartDate: undefined as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => mocked.chartDate ? { value: mocked.chartDate } : undefined }) }));
vi.mock("@/app/add/entry-data", () => ({ withAnalyticsService: mocked.root }));
vi.mock("@/app/chart-data", () => ({ loadHistoricalCharts: vi.fn(async () => null) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));
const analytics = createAnalyticsService({
  getSnapshotSources: async () => sources(), getCashFlowSources: async () => sources(),
});
function sources() { const sources = canonicalSources(); sources.investments.push(investment(ids.missing, "Unvalued example")); return sources; }
beforeEach(() => { mocked.chartDate = undefined; mocked.root.mockImplementation((run) => run({ householdId: "synthetic-household", analytics })); });
async function detail(id: string) {
  return renderToStaticMarkup(await InvestmentDetailPage({ params: Promise.resolve({ investmentId: id }),
    searchParams: Promise.resolve({ date: endDate, start: startDate }) }));
}
describe("live investment surface composition", () => {
  it("passes detail identity into the existing history workflow and ignores repeated identities", async () => {
    const page = await InvestmentHistoryPage({ searchParams: Promise.resolve({ investmentId: ids.active }) });
    expect(page.props.children.at(-1).props.initialInvestmentId).toBe(ids.active);
    const repeated = await InvestmentHistoryPage({ searchParams: Promise.resolve({ investmentId: [ids.active, ids.closed] }) });
    expect(repeated.props.children.at(-1).props.initialInvestmentId).toBeUndefined();
  });
  it("keeps empty, filtered-empty and invalid date states explicit", async () => {
    mocked.root.mockResolvedValue(null);
    expect(renderToStaticMarkup(await InvestmentsPage({ searchParams: Promise.resolve({}) }))).toContain("No investments available");
    mocked.root.mockImplementation((run) => run({ householdId: "synthetic-household", analytics }));
    expect(renderToStaticMarkup(await InvestmentsPage({ searchParams: Promise.resolve({ institution: "unknown" }) }))).toContain("No investments match these filters");
    expect(renderToStaticMarkup(await InvestmentsPage({ searchParams: Promise.resolve({ date: "2026-02-30" }) }))).toContain("Investments could not be loaded");
  });
  it("shows missing coverage, signed NAV, dates and closed filtering in the list", async () => {
    const html = renderToStaticMarkup(await InvestmentsPage({ searchParams: Promise.resolve({ date: endDate }) }));
    expect(html).toContain("Negative equity example");
    expect(html).toContain("−$20.00");
    expect(html).toContain("Valuation coverage is incomplete");
    expect(html).not.toContain("Realized example");
    expect(html).toContain('dateTime="2023-01-01"');
    const closed = renderToStaticMarkup(await InvestmentsPage({ searchParams: Promise.resolve({ date: endDate, lifecycle: "closed" }) }));
    expect(closed).toContain("Realized example");
    expect(closed).toContain("Closed investment · 2023-01-01");
  });
  it("composes authoritative returns, period context, metadata and existing history links", async () => {
    const html = await detail(ids.active);
    expect(html).toContain("$121.00");
    expect(html).toContain("1.21×");
    expect(html).toContain("10.00%");
    expect(html).toContain("Period performance");
    expect(html).toContain("Owner A");
    expect(html).toContain("/investments/history?investmentId=" + ids.active);
    expect(html).toContain("/investments/" + ids.active + "/manage");
    expect(html).toContain("Add financial action");
    expect(loadHistoricalCharts).toHaveBeenLastCalledWith({ investmentIds: [ids.active] }, endDate);
  });
  it("uses the browser reporting date for detail without an explicit date", async () => {
    mocked.chartDate = endDate;
    const html = renderToStaticMarkup(await InvestmentDetailPage({ params: Promise.resolve({ investmentId: ids.active }), searchParams: Promise.resolve({ start: startDate }) }));
    expect(html).toContain(`value="${endDate}"`);
    expect(html).toContain("$121.00");
    expect(loadHistoricalCharts).toHaveBeenLastCalledWith({ investmentIds: [ids.active] }, undefined);
  });
  it("preserves older valuations and explicitly unavailable returns", async () => {
    const old = await detail(ids.leveraged);
    expect(old).toContain("Older valuation · 365 days old");
    const missing = await detail(ids.missing);
    expect(missing).toContain("Valuation coverage is incomplete");
    expect(missing).not.toContain("0.00×");
    expect(missing).not.toContain("0.00%");
    const negative = await detail(ids.negative);
    expect(negative).toContain("−$20.00");
    expect(negative).toContain("The dated cash flows do not support an annualized return");
  });
  it("retains closed history without an ordinary Add action", async () => {
    const html = await detail(ids.closed);
    expect(html).toContain("Closed on Jan 1, 2023");
    expect(html).not.toContain("Add financial action");
    expect(html).toContain("Open action and valuation history");
  });
  it("handles unknown records and failures without leaking driver details", async () => {
    await expect(detail("unknown")).rejects.toThrow("not-found");
    mocked.root.mockRejectedValue(new Error("private-driver-error"));
    const html = await detail(ids.active);
    expect(html).toContain("Investment could not be loaded");
    expect(html).not.toContain("private-driver-error");
  });
});
