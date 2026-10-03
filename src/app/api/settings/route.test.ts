import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { WorkflowError } from "@/application/errors";
vi.mock("@/app/settings-data", () => ({ withSettingsService: vi.fn() }));
import { withSettingsService } from "@/app/settings-data";
import { GET, POST } from "./route";
const service = { write: vi.fn(), getSettings: vi.fn() };
const input = { dimension: "owners", operation: "create", label: "Owner A", householdId: "foreign" };
function post(body: unknown, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/settings", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(withSettingsService).mockImplementation(async (run) => run({ householdId: "home", service: service as never }));
});
it("uses the server household and uncached reads/writes", async () => {
  const response = await POST(post(input));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(service.write).toHaveBeenCalledWith(expect.objectContaining({ householdId: "home", dimension: "owners" }));
  service.getSettings.mockResolvedValue({ household: { id: "home" } });
  expect((await GET()).headers.get("cache-control")).toBe("no-store");
  expect(service.getSettings).toHaveBeenCalledWith("home");
});
it("requires confirmed removals and rejects malformed commands and foreign origins", async () => {
  for (const body of [null, [], { ...input, operation: "remove", id: "owner" }, { ...input, dimension: "household" }, { ...input, label: [] }, { ...input, operation: "replace" }]) {
    expect((await POST(post(body))).status).toBe(400);
  }
  expect((await POST(post(input, "https://other.example"))).status).toBe(403);
  expect(service.write).not.toHaveBeenCalled();
  expect((await POST(post({ dimension: "owners", operation: "remove", id: "owner", confirmed: true }))).status).toBe(200);
});
it("maps correctable errors and conceals driver errors and unconfigured state", async () => {
  for (const code of ["duplicate_label", "invalid_name", "record_in_use", "invalid_association"] as const) {
    service.write.mockRejectedValue(new WorkflowError(code));
    expect((await POST(post(input))).status).toBe(409);
  }
  service.write.mockRejectedValue(new Error("private driver details"));
  const response = await POST(post(input));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("private driver details");
  vi.mocked(withSettingsService).mockResolvedValue(null);
  expect((await GET()).status).toBe(409);
  expect((await POST(post(input))).status).toBe(409);
});
