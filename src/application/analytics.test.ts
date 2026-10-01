import { expect, it, vi } from "vitest";
import { createAnalyticsService } from "./analytics";

it("validates calendar dates before reading and delegates snapshots and breakdowns", async () => {
  const repository = { getCashFlowSources: vi.fn(), getSnapshotSources: vi.fn(async () => ({ investments: [], marks: [] })) };
  const service = createAnalyticsService(repository);
  await expect(service.snapshot("household", "2026-02-30")).rejects.toMatchObject({ code: "invalid_date" });
  expect(repository.getSnapshotSources).not.toHaveBeenCalled();
  const result = await service.snapshot("household", "2026-02-28", {}, "ownerSet");
  expect(repository.getSnapshotSources).toHaveBeenCalledExactlyOnceWith("household", "2026-02-28");
  expect(result.breakdown).toEqual([]);
  expect(result.totals).toEqual({ status: "available", value: { grossValueCents: 0n, debtCents: 0n, navCents: 0n } });
});


it("validates period and inception queries before repository access, and forwards the scope", async () => {
  const repository = { getSnapshotSources: vi.fn(),
    getCashFlowSources: vi.fn(async () => ({ investments: [], marks: [], actions: [] })) };
  const service = createAnalyticsService(repository);
  await expect(service.period("home", "2026-02-02", "2026-02-01")).rejects.toMatchObject({ code: "invalid_date" });
  await expect(service.period("home", "2026-02-30", "2026-03-01")).rejects.toMatchObject({ code: "invalid_date" });
  await expect(service.inception("home", "2026-02-30")).rejects.toMatchObject({ code: "invalid_date" });
  expect(repository.getCashFlowSources).not.toHaveBeenCalled();
  const period = await service.period("home", "2026-02-01", "2026-02-02", { investmentIds: [] });
  expect(repository.getCashFlowSources).toHaveBeenCalledExactlyOnceWith("home", "2026-02-02");
  expect(period.change).toMatchObject({ status: "available", value: { pnlCents: 0n } });
  expect((await service.inception("home", "2026-02-02")).pnl).toEqual({ status: "available", value: 0n });
  expect(repository.getSnapshotSources).not.toHaveBeenCalled();
});
