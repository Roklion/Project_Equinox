import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { WorkflowError } from "@/application/errors";
vi.mock("@/app/add/entry-data", () => ({ withEntryService: vi.fn() }));
import { withEntryService } from "@/app/add/entry-data";
import { GET, POST } from "./route";

const service = { createInvestment: vi.fn(), editInvestment: vi.fn(), closeInvestment: vi.fn(),
  getInvestmentChoices: vi.fn(), getInvestmentMetadata: vi.fn(), getInvestments: vi.fn() };
function post(body: unknown, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/investments", { method: "POST",
    headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
const metadata = { name: "Sample investment", ownerIds: ["owner-a", "owner-b"], groupIds: ["group-a"], assetClassId: "class-a" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(withEntryService).mockImplementation(async (run) => run({ householdId: "home", service: service as never }));
  service.createInvestment.mockResolvedValue({ id: "investment-a" });
  service.editInvestment.mockResolvedValue({ id: "investment-a" });
  service.closeInvestment.mockResolvedValue({ id: "investment-a" });
});
describe("investment management API", () => {
  it("resolves household server-side and exposes stable choice identities without caching", async () => {
    service.getInvestmentChoices.mockResolvedValue({ owners: [{ id: "owner-a", label: "Owner A" }] });
    service.getInvestmentMetadata.mockResolvedValue({ id: "investment-a", ownerIds: ["owner-a"] });
    const response = await GET(new NextRequest("http://localhost:3000/api/investments?investmentId=investment-a"));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(service.getInvestmentMetadata).toHaveBeenCalledWith("home", "investment-a");
    expect(await response.json()).toMatchObject({ choices: { owners: [{ id: "owner-a" }] } });
    const created = await POST(post({ ...metadata, operation: "create", householdId: "other" }));
    expect(created.status).toBe(200);
    expect(service.createInvestment).toHaveBeenCalledWith(expect.objectContaining({ ...metadata, householdId: "home" }));
    await POST(post({ ...metadata, operation: "edit", investmentId: "investment-a", status: "active", closedOn: null }));
    expect(service.editInvestment).toHaveBeenCalledWith(expect.objectContaining({ investmentId: "investment-a", householdId: "home" }));
    expect(service.editInvestment.mock.calls[0][0]).not.toHaveProperty("status");
  });
  it("requires explicit close confirmation and ignores metadata during closure", async () => {
    expect((await POST(post({ operation: "close", investmentId: "investment-a", closedOn: "2026-09-30" }))).status).toBe(400);
    expect(service.closeInvestment).not.toHaveBeenCalled();
    expect((await POST(post({ operation: "close", investmentId: "investment-a", closedOn: "2026-09-30", confirmed: true }))).status).toBe(200);
    expect(service.closeInvestment).toHaveBeenCalledWith("home", "investment-a", "2026-09-30");
  });
  it("returns field conflicts and conceals database failures", async () => {
    service.editInvestment.mockRejectedValue(new WorkflowError("invalid_association", "ownerIds"));
    expect(await (await POST(post({ ...metadata, operation: "edit", investmentId: "investment-a" }))).json()).toMatchObject({ fieldErrors: { ownerIds: expect.any(String) } });
    service.closeInvestment.mockRejectedValue(new WorkflowError("close_date_conflict", "closedOn"));
    expect(await (await POST(post({ operation: "close", investmentId: "investment-a", closedOn: "2026-09-30", confirmed: true }))).json()).toMatchObject({ fieldErrors: { closedOn: expect.any(String) } });
    service.createInvestment.mockRejectedValue(new Error("private database details"));
    const failed = await POST(post({ ...metadata, operation: "create" }));
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain("private database details");
  });
  it("rejects foreign origins and malformed associations before calling commands", async () => {
    expect((await POST(post({ ...metadata, operation: "create" }, "https://elsewhere.example"))).status).toBe(403);
    expect((await POST(post({ ...metadata, ownerIds: "owner-a", operation: "create" }))).status).toBe(400);
    expect((await POST(post({ ...metadata, operation: "reopen" }))).status).toBe(400);
    expect(service.createInvestment).not.toHaveBeenCalled();
  });
});
