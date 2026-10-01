import type { AnalyticsRepository } from "./analytics-ports";
import { expect, it, vi } from "vitest";
import { createAnalyticsService } from "./analytics";
import { canonicalSources, endDate, expectedHousehold, ids, startDate } from "@/domain/analytics/testing/canonical-fixture";

it("orchestrates consistent analytics and recalculates all affected outputs after a canonical correction", async () => {
  const sources = canonicalSources();
  const repository = { getSnapshotSources: vi.fn<AnalyticsRepository["getSnapshotSources"]>(async () => sources), getCashFlowSources: vi.fn<AnalyticsRepository["getCashFlowSources"]>(async () => sources) };
  const service = createAnalyticsService(repository);
  const scope = { investmentIds: [ids.active, ids.closed] };
  expect((await service.returns("example", endDate, scope)).moic).toEqual({ status: "available", value: 409 / 300 });
  expect((await service.inception("example", endDate)).pnl).toEqual({ status: "available", value: expectedHousehold.pnl });
  expect((await service.period("example", startDate, endDate)).change)
    .toMatchObject({ status: "available", value: { pnlCents: expectedHousehold.pnl } });
  const value = await service.valueSeries("example", startDate, endDate);
  const composition = await service.compositionSeries("example", startDate, endDate, "ownerSet");
  expect(composition.points.map((point) => point.totals)).toEqual(value.points.map((point) => point.totals));

  // Explicitly correct terminal NAV by $11; capital history stays the same.
  sources.marks.find((mark) => mark.investmentId === ids.active && mark.asOfDate === endDate)!.grossValue = "132";
  const returns = await service.returns("example", endDate, scope);
  expect(returns.moic).toEqual({ status: "available", value: 420 / 300 });
  expect(returns.xirr.status).toBe("available");
  if (returns.xirr.status === "available") expect(returns.xirr.value).toBeCloseTo(Math.sqrt(1.4) - 1, 9);
  expect((await service.inception("example", endDate)).pnl).toEqual({ status: "available", value: 7880n });
  expect((await service.period("example", startDate, endDate)).change).toMatchObject({ status: "available", value: { pnlCents: 7880n } });
  expect((await service.snapshot("example", endDate)).totals).toMatchObject({ status: "available", value: { navCents: 61880n } });
  expect((await service.valueSeries("example", startDate, endDate)).points.at(-1)?.totals)
    .toMatchObject({ status: "available", value: { navCents: 61880n } });
  expect((await service.compositionSeries("example", startDate, endDate, "ownerSet")).points.at(-1)?.totals)
    .toMatchObject({ status: "available", value: { navCents: 61880n } });
  expect(repository.getCashFlowSources).toHaveBeenCalledTimes(6);
  expect(repository.getSnapshotSources).toHaveBeenCalledTimes(5);
  expect(repository.getCashFlowSources.mock.calls.every((call) => call[1] === endDate)).toBe(true);
});
