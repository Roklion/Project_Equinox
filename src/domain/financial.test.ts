import { describe, expect, it } from "vitest";
import { assertCalendarDate, netValue, parseCents } from "./financial";

describe("financial values", () => {
  it("preserves exact cents and permits negative derived equity", () => {
    expect(parseCents("123456789.10")).toBe(12345678910n);
    expect(netValue("100.00", "125.25")).toBe("-25.25");
  });

  it("rejects rounding, negative inputs, and invalid calendar dates", () => {
    expect(() => parseCents("1.001")).toThrow();
    expect(() => parseCents("-1.00")).toThrow();
    expect(() => parseCents("0.00")).toThrow();
    expect(() => assertCalendarDate("2025-02-29")).toThrow();
    expect(() => assertCalendarDate("2026-03-08T00:00:00Z")).toThrow();
    expect(() => assertCalendarDate("2024-02-29")).not.toThrow();
  });
});
