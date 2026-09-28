import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/app/add/entry-data", () => ({ withEntryService: vi.fn() }));
import { withEntryService } from "@/app/add/entry-data";
import { GET, POST } from "./route";

const service = {
  getEligibleInvestments: vi.fn(), getValuationContext: vi.fn(), getLatestValuationMarks: vi.fn(),
  saveValuationBatch: vi.fn(),
};
const investments = [
  { id: "example-a", name: "Sample Fund", status: "active" },
  { id: "example-b", name: "Sample Property", status: "active" },
];
function post(rows: unknown[], date = "2026-09-28") {
  return new NextRequest("http://localhost:3000/api/valuations/batch", { method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    body: JSON.stringify({ date, rows }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(withEntryService).mockImplementation(async (run) =>
    run({ householdId: "synthetic-household", service: service as never }));
  service.getEligibleInvestments.mockResolvedValue(investments);
  service.getValuationContext.mockResolvedValue({ existing: null, previous: null });
  service.getLatestValuationMarks.mockResolvedValue([]);
  service.saveValuationBatch.mockResolvedValue([]);
});

describe("batch valuation route", () => {
  it("returns active investments and dated mark context", async () => {
    service.getEligibleInvestments.mockResolvedValue([...investments,
      { id: "example-closed", name: "Old Fund", status: "closed" }]);
    service.getValuationContext.mockResolvedValueOnce({ existing: null,
      previous: { asOfDate: "2026-08-01", grossValue: "10.00", debt: "0.00", netValue: "10.00" } });
    const response = await GET(new NextRequest("http://localhost:3000/api/valuations/batch?date=2026-09-28"));
    const body = await response.json();
    expect(body.investments).toHaveLength(2);
    expect(body.investments[0].previous.asOfDate).toBe("2026-08-01");
  });

  it("sends new and explicitly corrected rows in one atomic command", async () => {
    service.getValuationContext.mockResolvedValueOnce({ existing: null, previous: null })
      .mockResolvedValueOnce({ existing: { id: "mark-1" }, previous: null });
    const response = await POST(post([
      { investmentId: "example-a", operation: "create", grossValue: "100.00", debt: "0" },
      { investmentId: "example-b", operation: "replace", grossValue: "50.00", debt: "75.00" },
    ]));
    expect(response.status).toBe(200);
    expect(service.saveValuationBatch).toHaveBeenCalledOnce();
    expect(service.saveValuationBatch).toHaveBeenCalledWith({ householdId: "synthetic-household",
      asOfDate: "2026-09-28", rows: [
        expect.objectContaining({ investmentId: "example-a", operation: "create", grossValue: "100.00" }),
        expect.objectContaining({ investmentId: "example-b", operation: "replace", debt: "75.00" }),
      ] });
  });

  it("rejects a conflicting row before calling the batch command", async () => {
    service.getValuationContext.mockResolvedValueOnce({ existing: null, previous: null })
      .mockResolvedValueOnce({ existing: { id: "mark-1" }, previous: null });
    const response = await POST(post([
      { investmentId: "example-a", operation: "create", grossValue: "100", debt: "" },
      { investmentId: "example-b", operation: "create", grossValue: "50", debt: "" },
    ]));
    expect(response.status).toBe(409);
    expect((await response.json()).rowErrors["example-b"]).toContain("Choose correction");
    expect(service.saveValuationBatch).not.toHaveBeenCalled();
  });

  it("preserves existing debt when correction debt is left blank", async () => {
    service.getValuationContext.mockResolvedValue({ existing: { id: "mark-1", debt: "25.00" }, previous: null });
    const response = await POST(post([{ investmentId: "example-a", operation: "replace", grossValue: "30", debt: "" }]));
    expect(response.status).toBe(200);
    expect(service.saveValuationBatch).toHaveBeenCalledWith(expect.objectContaining({ rows: [
      expect.objectContaining({ operation: "replace", debt: undefined }),
    ] }));
  });

  it("rejects invalid money in any row without mutation", async () => {
    const response = await POST(post([
      { investmentId: "example-a", operation: "create", grossValue: "100", debt: "" },
      { investmentId: "example-b", operation: "create", grossValue: "-1", debt: "" },
    ]));
    expect(response.status).toBe(400);
    expect(service.saveValuationBatch).not.toHaveBeenCalled();
  });
});
