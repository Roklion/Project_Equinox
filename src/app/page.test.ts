import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAnalyticsService } from "@/application/analytics";
import type { CashFlowSources } from "@/domain/analytics/cash-flow";
import { canonicalSources, endDate, ids, investment, transferSources } from "@/domain/analytics/testing/canonical-fixture";
import HomePage from "./page";
import UpdateCenterPage from "./updates/page";
import EntryPage from "./add/[kind]/page";
import BatchPage from "./valuations/batch/page";
import { optionalDate, overviewRange, periodStart } from "@/components/financial/reporting-context";
import type { PageQuery } from "@/components/financial/reporting-context";
import { ownerB, groupA, groupB } from "@/domain/analytics/testing/canonical-fixture";

const mocks = vi.hoisted(() => ({ root: vi.fn() }));
vi.mock("@/app/add/entry-data", () => ({ withAnalyticsService: mocks.root }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
let sources: CashFlowSources;
beforeEach(() => {
  sources = canonicalSources();
  const analytics = createAnalyticsService({ getSnapshotSources: async () => sources, getCashFlowSources: async () => sources });
  const service = {
    getInvestmentChoices: async () => ({ owners: [ownerB], customGroups: [groupA, groupB],
      assetClasses: [{ id: "unused", label: "Unused class" }], accountTypes: [], taxStatuses: [], liquidities: [], institutions: [] }),
    getInvestments: async () => sources.investments,
  };
  mocks.root.mockImplementation((run) => run({ householdId: "synthetic-household", analytics, service }));
});
const home = async (query: PageQuery = { date: endDate, range: "1y" }) => renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve(query) }));
const updates = async (query = { date: endDate }) => renderToStaticMarkup(await UpdateCenterPage({ searchParams: Promise.resolve(query) }));

describe("household Overview", () => {
  it("shows complete aggregate NAV, signed change, supplied capital and returns with a concise investment preview", async () => {
    const html = await home();
    expect(html).toContain("Aggregate investment NAV");
    expect(html).toContain("$607.80");
    expect(html).toContain("5 of 5 investments valued");
    expect(html).toContain("$540.00");
    expect(html).toContain("1.08×");
    expect(html).toContain("Decrease: ");
    expect(html).not.toMatch(/net worth|TWR/);
    expect(html.match(/class="investment-row"/g)).toHaveLength(5);
    expect(html).toContain("Show remaining investments in scope (1)");
    expect(html).toContain("All tracked investments");
    expect(html).toContain('dateTime="2022-01-01"');
    expect(html).toContain("Example market assets");
  });
  it("does not display a partial portfolio as complete; cash flows survive missing endpoint coverage", async () => {
    sources.investments.push(investment(ids.missing, "Unvalued example"));
    const html = await home();
    expect(html).toContain("5 of 6 investments valued");
    expect(html).toContain("Incomplete valuation coverage");
    expect(html).toContain("Missing qualifying valuation");
    expect(html).toContain("Beginning or ending valuation coverage is incomplete");
    expect(html).not.toContain("$607.80");
    expect(html).toContain("$288.00"); // Recorded period distributions still exist.
    expect(html).not.toContain("0.00×");
  });
  it("handles no marks and unavailable returns without fabricating zero", async () => {
    sources.marks = [];
    const html = await home();
    expect(html).toContain("0 of 5 investments valued");
    expect(html).toContain("No valuation observations in this range");
    expect(html).toContain("Valuation coverage is incomplete");
    expect(html).not.toContain("0.00%");
  });
  it("retains negative household NAV and no-sign-change return states", async () => {
    sources.investments = sources.investments.filter((item) => item.id === ids.negative);
    sources.marks = sources.marks.filter((item) => item.investmentId === ids.negative);
    sources.actions = sources.actions.filter((item) => item.movements.some((leg) => leg.investmentId === ids.negative));
    const html = await home();
    expect(html).toContain("−$20.00");
    expect(html).toContain("-0.40×");
    expect(html).toContain("The dated cash flows do not support an annualized return");
  });
  it("displays household transfer cancellation from authoritative analytics", async () => {
    sources = transferSources();
    const html = await home();
    expect(html).toContain("No change:");
    expect(html).toContain("Recorded net external cash flow");
    expect(html).toContain("Recorded net external cash flow · USD</dt><dd>$0.00</dd>");
    expect(html).toContain('Investment performance effect · USD</dt><dd><span class="metric-number">$0.00</span>');
  });
  it("keeps no-contribution MOIC and sparse history explicit", async () => {
    sources.actions = [];
    sources.marks = sources.marks.filter((item) => item.asOfDate === endDate);
    sources.investments = sources.investments.filter((item) => sources.marks.some((mark) => mark.investmentId === item.id));
    const html = await home();
    expect(html).toContain("No contributions are recorded");
    expect(html).toContain("Only one observation is available.");
  });
  it("handles empty, unconfigured, failed and invalid-date reads without driver details", async () => {
    sources = { investments: [], marks: [], actions: [] };
    expect(await home()).toContain("Start your investment overview");
    mocks.root.mockResolvedValue(null);
    expect(await home()).toContain("Household setup needed");
    mocks.root.mockRejectedValue(new Error("private-driver-error"));
    const html = await home();
    expect(html).toContain("Overview could not be loaded");
    expect(html).not.toContain("private-driver-error");
    expect(await home({ date: "2026-02-30", range: "ytd" })).toContain("Overview could not be loaded");
  });
  it("resolves browser today before performing financial reads", async () => {
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Using your local calendar date");
    expect(mocks.root).not.toHaveBeenCalled();
  });
  it("routes the selected owner into metrics, histories, dated underlying links and checked controls", async () => {
    const html = await home({ date: endDate, range: "1y", owner: ownerB.id });
    expect(html).toContain("Owner: Owner B");
    expect(html).toContain("$327.80");
    expect(html).toContain("2 of 2 investments valued");
    expect(html.match(/class="investment-row"/g)).toHaveLength(2);
    expect(html).toContain('/investments/' + ids.active + '?date=' + endDate);
    expect(html).toContain('name="owner" checked="" value="' + ownerB.id + '"');
    expect(html).toContain("Reset to All tracked investments");
    expect(html).not.toContain("$607.80");
  });
  it("retains scope controls and unavailable returns for an empty selection", async () => {
    const html = await home({ date: endDate, range: "3m", assetClass: "unused" });
    expect(html).toContain("Asset class: Unused class");
    expect(html).toContain("No investments in this reporting scope");
    expect(html).toContain("No contributions are recorded");
    expect(html).toContain("No valuation observations in this range");
    expect(html).toContain("Choose reporting scope");
    expect(html).not.toContain("Start your investment overview");
  });
});

describe("Update Center workflow integration", () => {
  it("lists missing then older active valuations and retains closed history without update prompts", async () => {
    sources.investments.push(investment(ids.missing, "Unvalued example"));
    const html = await updates();
    expect(html.indexOf('aria-label="Unvalued example"')).toBeLessThan(html.indexOf('aria-label="Leveraged example"'));
    expect(html).toContain("Missing valuation");
    expect(html).toContain("Stale valuation");
    expect(html).toContain("Recent valuation");
    expect(html).toContain("Closed investments · retained history");
    expect(html).not.toContain('investmentId=' + ids.closed + '&amp;date=');
    expect(html).toContain('investmentId=' + ids.missing + '&amp;date=' + endDate + '&amp;from=updates');
    expect(html).toContain('/valuations/batch?date=' + endDate + '&amp;from=updates');
  });
  it("distinguishes all-recent, all-closed and no-investment states", async () => {
    sources.investments = [investment(ids.active)];
    expect(await updates()).toContain("All eligible investments have recent valuations");
    sources.investments[0].status = "closed";
    sources.investments[0].closedOn = endDate;
    expect(await updates()).toContain("No recurring updates needed");
    sources.investments = [];
    expect(await updates()).toContain("Start with an investment");
  });
  it("keeps configuration and read failures explicit", async () => {
    mocks.root.mockResolvedValue(null);
    expect(await updates()).toContain("Household setup needed");
    mocks.root.mockRejectedValue(new Error("private-driver-error"));
    expect(await updates()).not.toContain("private-driver-error");
    expect(await updates({ date: "2026-02-30" })).toContain("Valuation maintenance could not be loaded");
  });
  it("passes identity, date and fixed Update Center return context into existing forms", async () => {
    const query = { investmentId: ids.active, date: endDate, from: "updates" };
    const entry = await EntryPage({ params: Promise.resolve({ kind: "valuation" }), searchParams: Promise.resolve(query) });
    expect(entry.props.children.at(-1).props).toMatchObject({ initialInvestmentId: ids.active, initialDate: endDate, returnToUpdates: true });
    const batch = await BatchPage({ searchParams: Promise.resolve(query) });
    expect(batch.props.children.at(-1).props).toMatchObject({ initialDate: endDate, returnToUpdates: true });
    const unsafe = await EntryPage({ params: Promise.resolve({ kind: "valuation" }),
      searchParams: Promise.resolve({ from: "https://example.com", date: "bad", investmentId: ["one", "two"] }) });
    expect(unsafe.props.children.at(-1).props).toMatchObject({ initialDate: undefined, initialInvestmentId: undefined, returnToUpdates: false });
  });
});

describe("reporting date and range presentation", () => {
  it("uses deliberate ranges and clamps calendar month ends", () => {
    expect(periodStart("2024-05-31", "3m")).toBe("2024-02-29");
    expect(periodStart("2024-02-29", "1y")).toBe("2023-02-28");
    expect(periodStart("2026-10-01", "ytd")).toBe("2026-01-01");
    expect(overviewRange("unsupported")).toBe("ytd");
    expect(optionalDate(["2026-10-01", "2026-10-02"])).toBeUndefined();
    expect(() => optionalDate("2026-02-30")).toThrow();
  });
});
