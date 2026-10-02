import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getState: vi.fn(), redirect: vi.fn((path: string) => { throw new Error("redirect:" + path); }) }));
vi.mock("@/app/setup-data", () => ({ householdSetupService: () => ({ getState: mocks.getState }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
import SetupPage from "./page";
beforeEach(() => { vi.clearAllMocks(); });
it("renders first-run inputs only for an empty database", async () => {
  mocks.getState.mockResolvedValue({ status: "empty" });
  const html = renderToStaticMarkup(await SetupPage());
  expect(html).toContain("Set up your household");
  expect(html).toContain('for="household-name"');
  expect(html).toContain("Owner 1 name");
  expect(html).toContain("Create household");
});
it("redirects configured households to normal navigation", async () => {
  mocks.getState.mockResolvedValue({ status: "configured", householdId: "sample" });
  await expect(SetupPage()).rejects.toThrow("redirect:/");
});
it("shows explicit recovery without creation inputs for multiple households", async () => {
  mocks.getState.mockResolvedValue({ status: "inconsistent" });
  const html = renderToStaticMarkup(await SetupPage());
  expect(html).toContain("Multiple households exist");
  expect(html).not.toContain("Create household");
  expect(html).not.toContain("household-name");
});
it("conceals database details and offers retry during an outage", async () => {
  mocks.getState.mockRejectedValue(new Error("private details"));
  const html = renderToStaticMarkup(await SetupPage());
  expect(html).toContain("Setup unavailable");
  expect(html).toContain("Retry setup");
  expect(html).not.toContain("private details");
});
