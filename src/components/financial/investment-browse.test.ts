import { describe, expect, it } from "vitest";
import { calculateSnapshot } from "@/domain/analytics/snapshot";
import { canonicalSources, endDate, ids, investment, ownerA, groupA } from "@/domain/analytics/testing/canonical-fixture";
import { browseChoices, browseInvestments, reportingDate } from "./investment-browse";

const sources = canonicalSources();
sources.investments.push(investment(ids.missing, "Unvalued example"));
const items = calculateSnapshot(sources, endDate).constituents;
describe("investment browse selection", () => {
  it("defaults to active and retains closed records when requested", () => {
    expect(browseInvestments(items, {}).map((item) => item.investment.id)).not.toContain(ids.closed);
    expect(browseInvestments(items, { lifecycle: "closed" }).map((item) => item.investment.id)).toEqual([ids.closed]);
    expect(browseInvestments(items, { lifecycle: "all" })).toHaveLength(items.length);
  });
  it("filters by canonical IDs without duplicating overlapping memberships", () => {
    const result = browseInvestments(items, { owner: ownerA.id, group: groupA.id });
    expect(result.map((item) => item.investment.id)).toEqual([ids.active]);
    expect(browseChoices(items, "assetClass")).toHaveLength(2);
    expect(browseInvestments(items, { institution: "unknown" })).toEqual([]);
  });
  it("sorts by name with an identity tie-break and preserves missing/negative values", () => {
    const ordered = browseInvestments([...items].reverse(), {});
    expect(ordered.map((item) => item.investment.name)).toEqual([...ordered.map((item) => item.investment.name)].sort());
    expect(ordered.find((item) => item.investment.id === ids.missing)?.valuation.status).toBe("incomplete");
    expect(ordered.find((item) => item.investment.id === ids.negative)?.valuation).toMatchObject({ status: "available", value: { navCents: -2000n } });
    const twins = items.slice(0, 2).map((item) => ({ ...item, investment: { ...item.investment, name: "Same" } }));
    expect(browseInvestments(twins.reverse(), { lifecycle: "all" }).map((item) => item.investment.id)).toEqual(twins.map((item) => item.investment.id).sort());
  });
  it("validates explicit calendar dates rather than normalizing impossible dates", () => {
    expect(reportingDate(endDate)).toBe(endDate);
    expect(() => reportingDate("2026-02-30")).toThrow();
  });
});
