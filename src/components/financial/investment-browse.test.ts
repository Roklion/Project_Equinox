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

// Separate identities with identical labels ensure display text cannot drive selection.
describe.each(["accountType", "taxStatus", "liquidity"] as const)("%s browse filter", (dimension) => {
  const sources = canonicalSources();
  for (const id of [ids.active, ids.closed]) {
    sources.investments.find((item) => item.id === id)!.classifications[dimension] = { id: "selected-id", label: "Same label" };
  }
  sources.investments.find((item) => item.id === ids.partial)!.classifications[dimension] = { id: "other-id", label: "Same label" };
  const items = calculateSnapshot(sources, endDate).constituents;
  const selected = { [dimension]: "selected-id" };
  const selectedIds = (query: Parameters<typeof browseInvestments>[1]) => browseInvestments(items, query).map((item) => item.investment.id);
  it("intersects stable classification IDs with lifecycle selection", () => {
    expect(selectedIds(selected)).toEqual([ids.active]);
    expect(selectedIds({ ...selected, lifecycle: "closed" })).toEqual([ids.closed]);
    expect(selectedIds({ ...selected, lifecycle: "all" })).toEqual([ids.active, ids.closed]);
    expect(selectedIds({ [dimension]: "Same label", lifecycle: "all" })).toEqual([]);
  });
  it("composes with existing asset-class, owner and custom-group filters", () => {
    expect(selectedIds({ ...selected, assetClass: sources.investments[0].classifications.assetClass!.id, owner: ownerA.id, group: groupA.id })).toEqual([ids.active]);
    expect(selectedIds({ ...selected, owner: "unmatched-owner" })).toEqual([]);
    expect(selectedIds({ ...selected, group: "unmatched-group" })).toEqual([]);
    expect(selectedIds({ ...selected, assetClass: "unmatched-class" })).toEqual([]);
    expect(selectedIds({ ...selected, institution: "unmatched-institution" })).toEqual([]);
  });
  it("keeps unclassified investments valid and choices available across lifecycle views", () => {
    expect(selectedIds({})).toContain(ids.negative);
    expect(selectedIds(selected)).not.toContain(ids.negative);
    expect(browseChoices(items, dimension)).toEqual([{ id: "other-id", label: "Same label" }, { id: "selected-id", label: "Same label" }]);
  });
  it("preserves selection across a label rename without mutating financial results", () => {
    const renamed = items.map((item) => ({ ...item, investment: { ...item.investment, classifications: {
      ...item.investment.classifications, [dimension]: item.investment.classifications[dimension]?.id === "selected-id"
        ? { id: "selected-id", label: "Renamed label" } : item.investment.classifications[dimension],
    } } }));
    expect(browseInvestments(renamed, selected).map((item) => item.investment.id)).toEqual([ids.active]);
    expect(browseChoices(renamed, dimension)).toContainEqual({ id: "selected-id", label: "Renamed label" });
    expect(browseInvestments(renamed, selected)[0].valuation).toBe(items[0].valuation);
  });
});
