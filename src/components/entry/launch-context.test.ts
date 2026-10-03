import { describe, expect, it } from "vitest";
import { entryLaunchContext } from "./launch-context";

describe("entry launch context", () => {
  it("keeps global Add context-free", () => {
    expect(entryLaunchContext({})).toMatchObject({ launcherHref: "/add", investmentId: undefined, date: undefined, returnHref: undefined });
  });
  it("carries investment/date context and constructs a dated internal return", () => {
    const context = entryLaunchContext({ investmentId: "synthetic-a", date: "2026-02-01", start: "2024-01-01", from: "investment" });
    expect(context.launcherHref).toBe("/add?investmentId=synthetic-a&date=2026-02-01&from=investment&start=2024-01-01");
    expect(context.returnHref).toBe("/investments/synthetic-a?date=2026-02-01&start=2024-01-01");
  });
  it("drops malformed/repeated dates, reversed periods, and arbitrary destinations", () => {
    expect(entryLaunchContext({ investmentId: ["a", "b"], date: "2026-02-30", from: "investment", returnTo: "https://example.com" })).toMatchObject({ launcherHref: "/add", returnHref: undefined });
    expect(entryLaunchContext({ investmentId: "a", date: ["2026-01-01"], from: "https://example.com" }).date).toBeUndefined();
    expect(entryLaunchContext({ investmentId: "a", date: "2026-02-01", start: "2026-03-01", from: "investment" }).returnHref).toBe("/investments/a?date=2026-02-01");
    expect(entryLaunchContext({ investmentId: "../outside?x=1", from: "investment" }).returnHref).toBe("/investments/..%2Foutside%3Fx%3D1");
  });
  it("retains the existing Update Center convention", () => {
    expect(entryLaunchContext({ investmentId: "a", date: "2026-02-01", from: "updates" })).toMatchObject({ returnToUpdates: true, returnHref: undefined });
  });
});
