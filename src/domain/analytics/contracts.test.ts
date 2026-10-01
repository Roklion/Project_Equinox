import { describe, expect, it } from "vitest";
import { classifyTransfer, isInPeriod } from "./contracts";

describe("shared analytics boundaries", () => {
  it.each([
    [["source", "destination"], "internal"],
    [["destination"], "contribution"],
    [["source"], "distribution"],
    [[], "excluded"],
  ] as const)("classifies a logical transfer for scope %s", (ids, expected) => {
    expect(classifyTransfer("source", "destination", new Set(ids))).toBe(expected);
  });
  it("includes end-date flows but excludes beginning-date flows", () => {
    expect(isInPeriod("2026-01-01", "2026-01-01", "2026-02-01")).toBe(false);
    expect(isInPeriod("2026-01-15", "2026-01-01", "2026-02-01")).toBe(true);
    expect(isInPeriod("2026-02-01", "2026-01-01", "2026-02-01")).toBe(true);
    expect(isInPeriod("2026-02-02", "2026-01-01", "2026-02-01")).toBe(false);
    expect(isInPeriod("2026-01-01", "2026-01-01", "2026-01-01")).toBe(false);
    expect(() => isInPeriod("2026-01-15", "2026-02-01", "2026-01-01")).toThrow();
    expect(() => isInPeriod("2026-02-30", "2026-01-01", "2026-03-01")).toThrow();
  });
});
