import { expect, it, vi } from "vitest";
import { createAnalyticsService } from "./analytics";

it("validates calendar dates before reading and delegates snapshots and breakdowns", async () => {
  const repository = { getSnapshotSources: vi.fn(async () => ({ investments: [], marks: [] })) };
  const service = createAnalyticsService(repository);
  await expect(service.snapshot("household", "2026-02-30")).rejects.toMatchObject({ code: "invalid_date" });
  expect(repository.getSnapshotSources).not.toHaveBeenCalled();
  const result = await service.snapshot("household", "2026-02-28", {}, "ownerSet");
  expect(repository.getSnapshotSources).toHaveBeenCalledExactlyOnceWith("household", "2026-02-28");
  expect(result.breakdown).toEqual([]);
  expect(result.totals).toEqual({ status: "available", value: { grossValueCents: 0n, debtCents: 0n, navCents: 0n } });
});
