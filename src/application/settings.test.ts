import { expect, it, vi } from "vitest";
import { createSettingsService } from "./settings";

it("trims names and rejects unsupported operations, blank/long names and malformed IDs before writing", async () => {
  const write = vi.fn();
  const service = createSettingsService({ write, getSettings: vi.fn() });
  await service.write({ householdId: "home", dimension: "owners", operation: "create", label: " Owner A " });
  expect(write).toHaveBeenCalledWith({ householdId: "home", dimension: "owners", operation: "create", label: "Owner A" });
  write.mockClear();
  for (const label of [" ", "a".repeat(201)]) await expect(service.write({ householdId: "home", dimension: "household", operation: "rename", label })).rejects.toThrow("invalid_name");
  await expect(service.write({ householdId: "home", dimension: "household", operation: "create", label: "Sample" })).rejects.toThrow("invalid_association");
  await expect(service.write({ householdId: "home", dimension: "owners", operation: "remove", id: "invalid" })).rejects.toThrow("invalid_association");
  expect(write).not.toHaveBeenCalled();
});
