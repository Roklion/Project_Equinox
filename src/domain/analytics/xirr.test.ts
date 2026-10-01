import { describe, expect, it } from "vitest";
import { solveXirr, XIRR_POLICY } from "./xirr";

const date0 = "2021-01-01";
const date1 = "2022-01-01";
const date2 = "2023-01-01";
const flow = (effectiveDate: string, amountCents: bigint) => ({ effectiveDate, amountCents });
function rate(flows: Parameters<typeof solveXirr>[0]): number {
  const result = solveXirr(flows);
  expect(result.status).toBe("available");
  if (result.status !== "available") throw new Error("Expected a rate.");
  return result.value;
}

describe("bounded deterministic XIRR", () => {
  it.each([[11000n, 0.1], [5000n, -0.5], [10000n, 0]])(
    "solves a one-year contribution and terminal %s cents", (terminal, expected) => {
      expect(rate([flow(date0, -10000n), flow(date1, terminal)])).toBeCloseTo(expected, 10);
    });

  it("uses actual calendar days and a fixed 365-day year across leap day", () => {
    expect(rate([flow("2024-01-01", -10000n), flow("2025-01-01", 11000n)]))
      .toBeCloseTo(Math.pow(1.1, 365 / 366) - 1, 10);
  });

  it("solves multiple dated contributions: 100*1.1^2 + 100*1.1 = 231", () => {
    expect(rate([flow(date0, -10000n), flow(date1, -10000n), flow(date2, 23100n)])).toBeCloseTo(0.1, 10);
  });

  it("includes earlier distributions: -100 + 50/1.1 + 66/1.1^2 = 0", () => {
    expect(rate([flow(date0, -10000n), flow(date1, 5000n), flow(date2, 6600n)])).toBeCloseTo(0.1, 10);
  });

  it("matches Microsoft's published irregular-date numerical reference", () => {
    // https://support.microsoft.com/en-us/excel/functions/xirr-function
    expect(rate([
      flow("2008-01-01", -1000000n), flow("2008-03-01", 275000n),
      flow("2008-10-30", 425000n), flow("2009-02-15", 325000n), flow("2009-04-01", 275000n),
    ])).toBeCloseTo(0.373362535, 8);
  });

  it("requires opposite signs after exact same-date netting", () => {
    for (const flows of [[], [flow(date0, -100n)], [flow(date0, 100n), flow(date1, 0n)],
      [flow(date0, -100n), flow(date0, 100n)], [flow(date0, -100n), flow(date0, 50n)]]) {
      expect(solveXirr(flows)).toEqual({ status: "unavailable", reason: "no_sign_change" });
    }
  });

  it("reports no root even with opposite signs when NPV stays negative", () => {
    // -100 + 100*y - 100*y^2 has negative discriminant.
    expect(solveXirr([flow(date0, -10000n), flow(date1, 10000n), flow(date2, -10000n)]))
      .toEqual({ status: "unavailable", reason: "no_root" });
  });

  it("reports two roots at 10% and 20%, including negative terminal NAV", () => {
    // -100*(q-1.1)*(q-1.2) / q^2, q=1+r.
    expect(solveXirr([flow(date0, -10000n), flow(date1, 23000n), flow(date2, -13200n)]))
      .toEqual({ status: "unavailable", reason: "multiple_roots" });
  });

  it("isolates close roots at 10% and 10.1% rather than relying on a grid", () => {
    expect(solveXirr([flow(date0, -100000n), flow(date1, 220100n), flow(date2, -121110n)]))
      .toEqual({ status: "unavailable", reason: "multiple_roots" });
  });

  it("finds a repeated root without a sign-change bracket", () => {
    // -(q-1.1)^2 / q^2 has one distinct root.
    expect(rate([flow(date0, -10000n), flow(date1, 22000n), flow(date2, -12100n)])).toBeCloseTo(0.1, 8);
  });

  it("allows a unique root with negative terminal NAV", () => {
    // A distribution at inception followed by debt has one identifiable rate.
    expect(rate([flow(date0, 10000n), flow(date1, -11000n)])).toBeCloseTo(0.1, 10);
  });

  it("nets huge same-day amounts exactly before floating-point conversion", () => {
    const huge = 999999999999999999n;
    expect(rate([flow(date0, -huge), flow(date0, huge - 100n), flow(date1, 110n)])).toBeCloseTo(0.1, 10);
  });

  it("includes supported endpoints and reports roots outside the domain", () => {
    expect(rate([flow(date0, -10000n), flow(date1, 1n)])).toBeCloseTo(XIRR_POLICY.minRate, 12);
    expect(rate([flow(date0, -1n), flow(date1, 1000001n)])).toBeCloseTo(XIRR_POLICY.maxRate, 5);
    expect(solveXirr([flow(date0, -1n), flow(date1, 2000001n)]))
      .toEqual({ status: "unavailable", reason: "no_root" });
    expect(solveXirr([flow(date0, -100000n), flow(date1, 1n)]))
      .toEqual({ status: "unavailable", reason: "no_root" });
  });

  it("is deterministic, order independent, and rejects invalid calendar dates", () => {
    const flows = [flow(date0, -10000n), flow(date1, 5000n), flow(date2, 6600n)];
    expect(solveXirr(flows)).toEqual(solveXirr([...flows].reverse()));
    expect(solveXirr(flows)).toEqual(solveXirr(flows));
    expect(() => solveXirr([flow("2021-02-30", -100n)])).toThrow();
  });
});
