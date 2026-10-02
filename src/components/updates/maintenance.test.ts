import { describe, expect, it } from "vitest";
import { calculateSnapshot } from "@/domain/analytics/snapshot";
import { investment } from "@/domain/analytics/testing/canonical-fixture";
import { maintenanceBand, routineInvestments } from "./maintenance";

function item(id: string, ageDays?: number) {
  const date = "2026-10-01";
  const markDate = new Date(Date.parse(date + "T00:00:00Z") - (ageDays ?? 0) * 86_400_000).toISOString().slice(0, 10);
  return calculateSnapshot({ investments: [investment(id, "Example")], marks: ageDays === undefined ? [] :
    [{ id: "mark-" + id, investmentId: id, asOfDate: markDate, grossValue: "0", debt: "0" }] }, date).constituents[0];
}
describe("valuation maintenance policy", () => {
  it("distinguishes missing from zero and covers age-band boundaries", () => {
    expect(maintenanceBand(item("missing")).key).toBe("missing");
    expect(maintenanceBand(item("today", 0)).key).toBe("recent");
    expect(maintenanceBand(item("30", 30)).key).toBe("recent");
    expect(maintenanceBand(item("31", 31)).key).toBe("due");
    expect(maintenanceBand(item("90", 90)).key).toBe("due");
    expect(maintenanceBand(item("91", 91)).key).toBe("stale");
  });
  it("prioritizes missing, then oldest marks, with deterministic identity ties", () => {
    const result = routineInvestments([item("z", 91), item("recent", 0), item("missing"), item("oldest", 200), item("a", 91)], "2026-10-01");
    expect(result.map((item) => item.investment.id)).toEqual(["missing", "oldest", "a", "z", "recent"]);
  });
  it("excludes recurring prompts on and after closure and retains eligibility before closure", () => {
    const closed = item("closed");
    closed.investment.status = "closed";
    closed.investment.closedOn = "2026-10-01";
    expect(routineInvestments([closed], "2026-10-01")).toEqual([]);
    expect(routineInvestments([closed], "2026-10-02")).toEqual([]);
    expect(routineInvestments([closed], "2026-09-30")).toHaveLength(1);
  });
});
