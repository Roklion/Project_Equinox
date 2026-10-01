import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { canonicalSources, startDate, endDate, ids, groupA, groupB } from "@/domain/analytics/testing/canonical-fixture";
import { createAnalyticsService } from "@/application/analytics";
const mocks = vi.hoisted(() => ({ sources: vi.fn(), household: true }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/add/entry-data", () => ({
  withEntryService: (run: (context: { householdId: string }) => unknown) =>
    mocks.household ? run({ householdId: "synthetic-household" }) : null,
}));
vi.mock("@/persistence/database", () => ({ getDatabase: () => ({ db: {} }) }));
vi.mock("@/persistence/analytics", () => ({
  createPostgresAnalyticsRepository: () => ({ getSnapshotSources: mocks.sources }),
}));
import { loadHistoricalCharts } from "./chart-data";

it("reads fresh authoritative household and investment charts with one aligned source read", async () => {
  mocks.sources.mockResolvedValue(canonicalSources());
  const html = renderToStaticMarkup(await loadHistoricalCharts({}, endDate));
  expect(html).toContain("$607.80");
  expect(html).toContain("Composition over time");
  expect(mocks.sources).toHaveBeenCalledExactlyOnceWith("synthetic-household", endDate);
  const selected = renderToStaticMarkup(await loadHistoricalCharts({ investmentIds: [ids.negative] }, endDate));
  expect(selected).toContain("−$20.00");
});
it("presents unconfigured household and generic source failures without leaking details", async () => {
  mocks.household = false;
  expect(renderToStaticMarkup(await loadHistoricalCharts({}, endDate))).toContain("No investment history available");
  mocks.household = true;
  mocks.sources.mockRejectedValue(new Error("PRIVATE_DATABASE_DETAIL"));
  const html = renderToStaticMarkup(await loadHistoricalCharts({}, endDate));
  expect(html).toContain("Charts could not be loaded");
  expect(html).not.toContain("PRIVATE_DATABASE_DETAIL");
});
it("validates combined historical query before reads and supports custom groups as scope filters", async () => {
  const repository = { getSnapshotSources: vi.fn(async () => canonicalSources()), getCashFlowSources: vi.fn() };
  const service = createAnalyticsService(repository);
  await expect(service.historicalSeries("h", endDate, startDate)).rejects.toMatchObject({ code: "invalid_date" });
  expect(repository.getSnapshotSources).not.toHaveBeenCalled();
  const filtered = await service.historicalSeries("h", startDate, endDate, { investmentIds: [ids.negative] });
  expect(filtered.valueSeries.points.at(-1)!.totals).toMatchObject({ value: { navCents: -2000n } });
  expect(Object.keys(filtered.compositionSeries)).toHaveLength(7);
  expect(filtered.compositionSeries.ownerSet.points.at(-1)!.totals).toEqual(filtered.valueSeries.points.at(-1)!.totals);
  expect(repository.getSnapshotSources).toHaveBeenCalledExactlyOnceWith("h", endDate);
  expect(repository.getCashFlowSources).not.toHaveBeenCalled();
  const grouped = await service.historicalSeries("h", startDate, endDate, { customGroupIds: [groupA.id, groupB.id] });
  expect(grouped.valueSeries.points.at(-1)!.totals).toMatchObject({ value: { navCents: 12100n } });
  expect(grouped.compositionSeries.ownerSet.points.at(-1)!.breakdown).toHaveLength(1);
});
