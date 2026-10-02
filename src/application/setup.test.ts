import { describe, expect, it, vi } from "vitest";
import { createHouseholdSetupService, type HouseholdSetupState } from "./setup";

describe("first-run setup", () => {
  it.each<HouseholdSetupState>([{ status: "empty" }, { status: "configured", householdId: "home" }, { status: "inconsistent" }])("preserves explicit setup state %j", async (state) => {
    const service = createHouseholdSetupService({ getState: async () => state, initialize: vi.fn() });
    expect(await service.getState()).toEqual(state);
  });
  it("normalizes names and delegates one atomic command for multiple distinct owners", async () => {
    const initialize = vi.fn(async () => ({ householdId: "home" }));
    const service = createHouseholdSetupService({ getState: vi.fn(), initialize });
    expect(await service.initialize({ name: " Example household ", ownerNames: [" Owner A ", "Owner A"] })).toEqual({ householdId: "home" });
    expect(initialize).toHaveBeenCalledWith({ name: "Example household", ownerNames: ["Owner A", "Owner A"] });
  });
  it.each([
    { name: "", ownerNames: ["Owner A"] },
    { name: "x".repeat(201), ownerNames: ["Owner A"] },
    { name: "Sample", ownerNames: [] },
    { name: "Sample", ownerNames: ["  "] },
    { name: "Sample", ownerNames: ["x".repeat(201)] },
  ])("rejects invalid names or missing owners before persistence", (input) => {
    const initialize = vi.fn();
    const service = createHouseholdSetupService({ getState: vi.fn(), initialize });
    expect(() => service.initialize(input)).toThrow();
    expect(initialize).not.toHaveBeenCalled();
  });
});
