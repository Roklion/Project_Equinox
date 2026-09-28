import { describe, expect, it, vi } from "vitest";
import { createPortfolioService } from "./portfolio";
import type { PortfolioRepository } from "./ports";

function fakeRepository() {
  return {
    createInvestment: vi.fn(async () => ({ id: "investment-a" })),
    closeInvestment: vi.fn(async () => ({ id: "investment-a" })),
    recordExternalAction: vi.fn(async () => ({ id: "action-a" })),
    recordTransfer: vi.fn(async () => ({ id: "action-b" })),
    recordValuationMark: vi.fn(async () => ({ id: "mark-a", asOfDate: "2026-03-01", grossValue: "1.00", debt: "0.00" })),
    replaceValuationMark: vi.fn(async () => ({ id: "mark-a", asOfDate: "2026-03-01", grossValue: "1.00", debt: "2.00" })),
    getInvestmentHistory: vi.fn(async () => ({ movements: [], marks: [
      { id: "mark-a", asOfDate: "2026-03-01", grossValue: "1.00", debt: "2.00" },
    ] })),
  } satisfies PortfolioRepository;
}

describe("portfolio application service", () => {
  it("validates commands before touching persistence and keeps exact day/cent values", async () => {
    const repository = fakeRepository();
    const service = createPortfolioService(repository);
    expect(() => service.createInvestment({ householdId: "home", name: "Sample", ownerIds: [] })).toThrow();
    expect(repository.createInvestment).not.toHaveBeenCalled();
    await service.createInvestment({ householdId: "home", name: "Sample", ownerIds: ["owner-a", "owner-a"] });
    expect(repository.createInvestment).toHaveBeenCalledWith({
      householdId: "home", name: "Sample", ownerIds: ["owner-a"],
    });
    expect(() => service.recordExternalAction({ householdId: "home", investmentId: "investment-a",
      kind: "contribution", effectiveDate: "2026-02-30", amount: "1.00" })).toThrow();
    expect(() => service.recordExternalAction({ householdId: "home", investmentId: "investment-a",
      kind: "contribution", effectiveDate: "2026-03-01", amount: "1.001" })).toThrow();
    expect(repository.recordExternalAction).not.toHaveBeenCalled();
    await service.recordExternalAction({ householdId: "home", investmentId: "investment-a",
      kind: "contribution", effectiveDate: "2026-03-01", amount: "1.5" });
    expect(repository.recordExternalAction).toHaveBeenCalledWith(expect.objectContaining({
      effectiveDate: "2026-03-01", amount: "1.50",
    }));
  });

  it("keeps transfer and mark semantics distinct and derives negative net value", async () => {
    const repository = fakeRepository();
    const service = createPortfolioService(repository);
    expect(() => service.recordTransfer({ householdId: "home", sourceInvestmentId: "same",
      destinationInvestmentId: "same", effectiveDate: "2026-03-01", amount: "2.00" })).toThrow();
    expect(repository.recordTransfer).not.toHaveBeenCalled();
    await service.recordTransfer({ householdId: "home", sourceInvestmentId: "source",
      destinationInvestmentId: "destination", effectiveDate: "2026-03-01", amount: "2" });
    expect(repository.recordTransfer).toHaveBeenCalledWith(expect.objectContaining({ amount: "2.00" }));
    await service.recordValuationMark({ householdId: "home", investmentId: "source",
      asOfDate: "2026-03-01", grossValue: "0", debt: "1.01" });
    expect(repository.recordValuationMark).toHaveBeenCalledWith(expect.objectContaining({
      grossValue: "0.00", debt: "1.01",
    }));
    await service.replaceValuationMark({ householdId: "home", investmentId: "source",
      asOfDate: "2026-03-01", grossValue: "1", debt: "2" });
    expect(repository.replaceValuationMark).toHaveBeenCalledWith(expect.objectContaining({
      grossValue: "1.00", debt: "2.00",
    }));
    expect(() => service.replaceValuationMark({ householdId: "home", investmentId: "source",
      asOfDate: "2026-03-01" })).toThrow();
    const history = await service.getInvestmentHistory("home", "source");
    expect(history.marks[0].netValue).toBe("-1.00");
    expect(history.movements).toEqual([]);
  });

  it("allows explicit clearing of nullable valuation provenance", async () => {
    const repository = fakeRepository();
    const service = createPortfolioService(repository);
    await service.replaceValuationMark({ householdId: "home", investmentId: "investment-a",
      asOfDate: "2026-03-01", source: null, sourceReference: null, notes: null });
    expect(repository.replaceValuationMark).toHaveBeenCalledWith(expect.objectContaining({
      source: null, sourceReference: null, notes: null,
    }));
  });
});
