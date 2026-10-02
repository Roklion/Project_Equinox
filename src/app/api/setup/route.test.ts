import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHouseholdSetupService } from "@/application/setup";
import { WorkflowError } from "@/application/errors";
const mocks = vi.hoisted(() => ({ initialize: vi.fn() }));
vi.mock("@/app/setup-data", () => ({ householdSetupService: () => createHouseholdSetupService({ getState: vi.fn(), initialize: mocks.initialize }) }));
import { POST } from "./route";
function request(body: unknown, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/setup", { method: "POST",
    headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => { vi.resetAllMocks(); mocks.initialize.mockResolvedValue({ householdId: "home" }); });
it("creates only the supplied names with USD controlled by persistence", async () => {
  const response = await POST(request({ name: "Sample", ownerNames: ["Owner A"], householdId: "other", currency: "EUR" }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.initialize).toHaveBeenCalledWith({ name: "Sample", ownerNames: ["Owner A"] });
});
it("rejects malformed payloads and foreign origins without writing", async () => {
  for (const body of [null, [], { name: "Sample", ownerNames: [null] }, { name: "Sample" }]) {
    expect((await POST(request(body))).status).toBe(400);
  }
  expect((await POST(request({ name: "Sample", ownerNames: [] }))).status).toBe(400);
  expect((await POST(request({ name: "Sample", ownerNames: ["A"] }, "https://foreign.example"))).status).toBe(403);
  expect(mocks.initialize).not.toHaveBeenCalled();
});
it("returns safe input, inconsistent state, and database failure messages", async () => {
  expect(await (await POST(request({ name: "Sample", ownerNames: [] }))).json()).toMatchObject({ fieldErrors: { ownerNames: "Add at least one owner." } });
  mocks.initialize.mockRejectedValueOnce(new WorkflowError("household_inconsistent"));
  expect((await POST(request({ name: "Sample", ownerNames: ["A"] }))).status).toBe(409);
  mocks.initialize.mockRejectedValueOnce(new Error("private connection details"));
  const response = await POST(request({ name: "Sample", ownerNames: ["A"] }));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("private connection details");
});
