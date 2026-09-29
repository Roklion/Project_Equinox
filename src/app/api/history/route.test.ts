import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { WorkflowError } from "@/application/errors";

vi.mock("@/app/add/entry-data", () => ({ withEntryService: vi.fn() }));
import { withEntryService } from "@/app/add/entry-data";
import { DELETE, GET, PATCH } from "./route";

const service = {
  getInvestments: vi.fn(), getInvestmentHistory: vi.fn(), getValuationContext: vi.fn(),
  editExternalAction: vi.fn(), deleteExternalAction: vi.fn(), editTransfer: vi.fn(), deleteTransfer: vi.fn(),
  editValuationMark: vi.fn(), deleteValuationMark: vi.fn(),
};
function request(method: "PATCH" | "DELETE", body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/history", { method,
    headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify(body) });
}
const transfer = { kind: "transfer", investmentId: "example-a", actionId: "action-1",
  date: "2026-09-28", amount: "25.00", sourceInvestmentId: "example-a", destinationInvestmentId: "example-b" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(withEntryService).mockImplementation(async (run) =>
    run({ householdId: "synthetic-household", service: service as never }));
  service.getInvestments.mockResolvedValue([
    { id: "example-a", name: "Sample Fund", status: "closed" },
    { id: "example-b", name: "Sample Property", status: "active" },
  ]);
  service.getInvestmentHistory.mockResolvedValue({ movements: [
    { actionId: "action-1", kind: "transfer", investmentId: "example-a" },
    { actionId: "action-2", kind: "contribution", investmentId: "example-a" },
  ], marks: [{ id: "mark-1", asOfDate: "2026-08-31" }] });
  service.getValuationContext.mockResolvedValue({ existing: null, previous: null });
});

describe("investment history route", () => {
  it("keeps closed investments available for history", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/api/history?investmentId=example-a"));
    expect(response.status).toBe(200);
    expect((await response.json()).investments[0].status).toBe("closed");
    expect(service.getInvestmentHistory).toHaveBeenCalledWith("synthetic-household", "example-a");
  });

  it("edits and deletes the whole logical transfer", async () => {
    expect((await PATCH(request("PATCH", transfer))).status).toBe(200);
    expect(service.editTransfer).toHaveBeenCalledWith(expect.objectContaining({ actionId: "action-1",
      sourceInvestmentId: "example-a", destinationInvestmentId: "example-b" }));
    expect((await DELETE(request("DELETE", transfer))).status).toBe(200);
    expect(service.deleteTransfer).toHaveBeenCalledWith("synthetic-household", "action-1");
    expect(service.deleteExternalAction).not.toHaveBeenCalled();
  });

  it("surfaces date collisions without changing the mark", async () => {
    service.getValuationContext.mockResolvedValue({ existing: { id: "another-mark" }, previous: null });
    const response = await PATCH(request("PATCH", { kind: "valuation", investmentId: "example-a",
      originalAsOfDate: "2026-08-31", date: "2026-08-30", grossValue: "10", debt: "20" }));
    expect(response.status).toBe(409);
    expect((await response.json()).formError).toContain("Another mark");
    expect(service.editValuationMark).not.toHaveBeenCalled();
  });

  it("rejects stale corrections and returns a stable message", async () => {
    service.editTransfer.mockRejectedValueOnce(new WorkflowError("action_not_found"));
    const response = await PATCH(request("PATCH", transfer));
    expect(response.status).toBe(409);
    expect((await response.json()).formError).toContain("no longer available");
  });
});
