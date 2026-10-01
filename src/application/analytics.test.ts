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

it("validates returns before reading, forwards filters, and propagates source failures", async () => {
  const repository = { getSnapshotSources: vi.fn(),
    getCashFlowSources: vi.fn(async () => ({ investments: [], marks: [], actions: [] })) };
  const service = createAnalyticsService(repository);
  await expect(service.returns("home", "2026-02-30")).rejects.toMatchObject({ code: "invalid_date" });
  expect(repository.getCashFlowSources).not.toHaveBeenCalled();
  const result = await service.returns("home", "2026-02-28", { investmentIds: [] });
  expect(repository.getCashFlowSources).toHaveBeenCalledExactlyOnceWith("home", "2026-02-28");
  expect(result).toMatchObject({ asOfDate: "2026-02-28",
    moic: { status: "unavailable", reason: "zero_contributions" },
    xirr: { status: "unavailable", reason: "no_sign_change" } });
  expect(repository.getSnapshotSources).not.toHaveBeenCalled();
  repository.getCashFlowSources.mockRejectedValueOnce(new Error("Canonical read failed."));
  await expect(service.returns("home", "2026-02-28")).rejects.toThrow("Canonical read failed.");
});

it("returns use fresh canonical reads and the requested investment scope", async () => {
  const sources = {
    investments: ["a", "b"].map((id) => ({ id, name: "Example " + id, status: "active" as const, closedOn: null,
      owners: [], customGroups: [],
      classifications: { assetClass: null, accountType: null, taxStatus: null, liquidity: null, institution: null } })),
    marks: [{ id: "mark", investmentId: "a", asOfDate: "2022-01-01", grossValue: "110", debt: "0" }],
    actions: [{ id: "capital", kind: "contribution" as const, effectiveDate: "2021-01-01", amount: "100",
      movements: [{ investmentId: "a", role: "external" as const, direction: "in" as const, amount: "100" }] }],
  };
  const repository = { getSnapshotSources: vi.fn(), getCashFlowSources: vi.fn(async () => sources) };
  const service = createAnalyticsService(repository);
  const result = await service.returns("home", "2022-01-01", { investmentIds: ["a"] });
  expect(result.moic).toEqual({ status: "available", value: 1.1 });
  expect(result.xirr.status).toBe("available");
  if (result.xirr.status === "available") expect(result.xirr.value).toBeCloseTo(0.1, 10);
  expect((await service.returns("home", "2022-01-01")).moic).toMatchObject({
    status: "incomplete", missingInvestmentIds: ["b"] });
  sources.marks[0].grossValue = "120";
  expect((await service.returns("home", "2022-01-01", { investmentIds: ["a"] })).moic)
    .toEqual({ status: "available", value: 1.2 });
  expect(repository.getCashFlowSources).toHaveBeenCalledTimes(3);
});
