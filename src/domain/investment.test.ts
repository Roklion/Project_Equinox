import { describe, expect, it } from "vitest";
import { canRecordInvestmentActivity } from "@/domain/investment";

describe("investment lifecycle entry policy", () => {
  it("allows ordinary entries for active investments", () => {
    expect(canRecordInvestmentActivity("active")).toBe(true);
  });

  it("prevents ordinary entries for closed investments", () => {
    expect(canRecordInvestmentActivity("closed")).toBe(false);
  });
});
