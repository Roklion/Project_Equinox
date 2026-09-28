import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { WorkflowError } from "@/application/errors";

vi.mock("@/app/add/entry-data", () => ({ withEntryService: vi.fn() }));
import { withEntryService } from "@/app/add/entry-data";
import { GET, POST } from "./route";

const service = {
  recordExternalAction: vi.fn(),
  recordTransfer: vi.fn(),
  recordValuationMark: vi.fn(),
  replaceValuationMark: vi.fn(),
  getEligibleInvestments: vi.fn(),
  getValuationContext: vi.fn(),
  getLatestValuationMarks: vi.fn(),
};

function post(body: Record<string, unknown>, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/entries", {
    method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(withEntryService).mockImplementation(async (run) =>
    run({ householdId: "synthetic-household", service: service as never }));
  service.recordExternalAction.mockResolvedValue({ id: "action-1" });
  service.recordTransfer.mockResolvedValue({ id: "transfer-1" });
  service.recordValuationMark.mockResolvedValue({ id: "mark-1" });
  service.replaceValuationMark.mockResolvedValue({ id: "mark-1" });
  service.getEligibleInvestments.mockResolvedValue([
    { id: "investment-a", name: "Example Fund" },
    { id: "investment-b", name: "Example Property" },
  ]);
  service.getValuationContext.mockResolvedValue({ existing: null, previous: null });
  service.getLatestValuationMarks.mockResolvedValue([]);
});

describe("entry route", () => {
  it("records positive contribution and withdrawal magnitudes with manual provenance", async () => {
    for (const kind of ["contribution", "withdrawal"]) {
      const response = await POST(post({ kind, investmentId: "investment-a",
        date: "2026-09-28", amount: "125.50", notes: "Synthetic example" }));
      expect(response.status).toBe(200);
    }
    expect(service.recordExternalAction).toHaveBeenNthCalledWith(1, expect.objectContaining({
      householdId: "synthetic-household", kind: "contribution", amount: "125.50",
      effectiveDate: "2026-09-28", source: "manual",
    }));
    expect(service.recordExternalAction).toHaveBeenNthCalledWith(2, expect.objectContaining({
      kind: "withdrawal", amount: "125.50",
    }));
  });

  it("rejects invalid input and keeps the application command untouched", async () => {
    const response = await POST(post({ kind: "contribution", investmentId: "investment-a",
      date: "2026-02-30", amount: "-5" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ fieldErrors: {
      date: expect.any(String), amount: expect.any(String),
    } });
    expect(service.recordExternalAction).not.toHaveBeenCalled();
  });

  it("sends one transfer command and rejects identical endpoints", async () => {
    const same = await POST(post({ kind: "transfer", sourceInvestmentId: "investment-a",
      destinationInvestmentId: "investment-a", date: "2026-09-28", amount: "50" }));
    expect(same.status).toBe(400);
    expect(service.recordTransfer).not.toHaveBeenCalled();
    const response = await POST(post({ kind: "transfer", sourceInvestmentId: "investment-a",
      destinationInvestmentId: "investment-b", date: "2026-09-28", amount: "50" }));
    expect(response.status).toBe(200);
    expect(service.recordTransfer).toHaveBeenCalledOnce();
    expect(service.recordTransfer).toHaveBeenCalledWith(expect.objectContaining({
      sourceInvestmentId: "investment-a", destinationInvestmentId: "investment-b", amount: "50",
    }));
  });

  it("keeps valuation creation and explicit correction separate", async () => {
    const base = { kind: "valuation", investmentId: "investment-a",
      date: "2026-09-28", grossValue: "10.00", debt: "25.00" };
    expect((await POST(post({ ...base, operation: "create" }))).status).toBe(200);
    expect(service.recordValuationMark).toHaveBeenCalledOnce();
    expect(service.replaceValuationMark).not.toHaveBeenCalled();
    expect((await POST(post({ ...base, operation: "replace" }))).status).toBe(200);
    expect(service.replaceValuationMark).toHaveBeenCalledOnce();
    expect(service.replaceValuationMark).toHaveBeenCalledWith(expect.objectContaining({
      grossValue: "10.00", debt: "25.00", asOfDate: "2026-09-28",
    }));
  });

  it("defaults omitted or empty valuation debt to zero", async () => {
    const base = { kind: "valuation", investmentId: "investment-a",
      date: "2026-09-28", grossValue: "10.00", operation: "create" };
    const omitted = await POST(post(base));
    const empty = await POST(post({ ...base, debt: "" }));

    expect(omitted.status).toBe(200);
    expect(empty.status).toBe(200);
    expect(service.recordValuationMark).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ grossValue: "10.00", debt: "0" }));
    expect(service.recordValuationMark).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ grossValue: "10.00", debt: "0" }));
  });

  it("reports an existing same-date mark without replacing it", async () => {
    service.recordValuationMark.mockRejectedValueOnce(new WorkflowError("mark_already_exists"));
    const response = await POST(post({ kind: "valuation", investmentId: "investment-a",
      date: "2026-09-28", grossValue: "10.00", debt: "25.00", operation: "create" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ fieldErrors: { operation: expect.any(String) } });
    expect(service.replaceValuationMark).not.toHaveBeenCalled();
  });

  it("returns a form error for workflow failures with no field mapping", async () => {
    service.recordValuationMark.mockRejectedValueOnce(new WorkflowError("empty_correction"));
    const response = await POST(post({ kind: "valuation", investmentId: "investment-a",
      date: "2026-09-28", grossValue: "10.00", debt: "25.00", operation: "create" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ formError: "Unable to save this entry. Please try again." });
  });

  it("returns selected-date context and latest mark for an eligible investment", async () => {
    service.getValuationContext.mockResolvedValueOnce({
      existing: { asOfDate: "2026-09-28", grossValue: "10.00", debt: "25.00", netValue: "-15.00" },
      previous: null,
    });
    service.getLatestValuationMarks.mockResolvedValueOnce([
      { investmentId: "investment-a", asOfDate: "2026-09-28", netValue: "-15.00" },
    ]);
    const response = await GET(new NextRequest(
      "http://localhost:3000/api/entries?date=2026-09-28&investmentId=investment-a"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      context: { existing: { netValue: "-15.00" } },
      latest: { investmentId: "investment-a", netValue: "-15.00" },
    });
  });

  it("rejects a cross-origin write", async () => {
    expect((await POST(post({ kind: "contribution" }, "https://example.invalid"))).status).toBe(403);
    expect(withEntryService).not.toHaveBeenCalled();
  });
});
