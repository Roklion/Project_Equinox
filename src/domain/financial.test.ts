import { describe, expect, it } from "vitest";
import { assertCalendarDate, netMovementCents, netValue, parseCents, parseSignedCents } from "./financial";

describe("financial values", () => {
  it("preserves exact cents and permits negative derived equity", () => {
    expect(parseCents("123456789.10")).toBe(12345678910n);
    expect(netValue("100.00", "125.25")).toBe("-25.25");
    expect(parseSignedCents("-25.25")).toBe(-2525n);
    expect(parseSignedCents("0.05")).toBe(5n);
  });

  it("rejects rounding, negative inputs, and invalid calendar dates", () => {
    expect(() => parseCents("1.001")).toThrow();
    expect(() => parseCents("-1.00")).toThrow();
    expect(() => parseCents("0.00")).toThrow();
    expect(() => assertCalendarDate("2025-02-29")).toThrow();
    expect(() => assertCalendarDate("2026-03-08T00:00:00Z")).toThrow();
    expect(() => assertCalendarDate("2024-02-29")).not.toThrow();
  });

  it("nets both transfer legs to zero while retaining subset boundary flows", () => {
    const legs = [
      { investmentId: "source", direction: "out" as const, amount: "25.25" },
      { investmentId: "destination", direction: "in" as const, amount: "25.25" },
    ];
    expect(netMovementCents(legs, new Set(["source", "destination"]))).toBe(0n);
    expect(netMovementCents(legs, new Set(["source"]))).toBe(-2525n);
    expect(netMovementCents(legs, new Set(["destination"]))).toBe(2525n);
  });
});
