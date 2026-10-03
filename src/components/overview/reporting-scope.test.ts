import { expect, it } from "vitest";
import { scopeSelection, snapshotScope, scopeParams, scopeLabel, type ScopeChoices } from "./reporting-scope";

it("keeps the household default and translates repeated stable identities to canonical scope", () => {
  expect(snapshotScope(scopeSelection({}))).toEqual({ classifications: {} });
  const selection = scopeSelection({ owner: ["joint-b", "", "joint-a", "joint-a"], group: "overlapping",
    assetClass: "asset", accountType: "account", taxStatus: "tax", liquidity: "liquid",
    institution: "institution", investment: ["second", "first"], date: "2026-10-01", range: "3m", unrelated: "ignored" });
  expect(snapshotScope(selection)).toEqual({ ownerIds: ["joint-a", "joint-b"], customGroupIds: ["overlapping"],
    investmentIds: ["first", "second"], classifications: { assetClass: ["asset"], accountType: ["account"],
      taxStatus: ["tax"], liquidity: ["liquid"], institution: ["institution"] } });
  const params = scopeParams(selection);
  params.set("date", "2026-09-01"); params.set("range", "1y");
  const roundTrip = Object.fromEntries([...params.keys()].map((key) => [key, params.getAll(key)]));
  expect(scopeSelection(roundTrip)).toEqual(selection);
});

it("identifies current canonical labels and preserves unavailable selections without broadening", () => {
  const choices: ScopeChoices = { owners: [{ id: "a", label: "Renamed owner" }], customGroups: [],
    assetClasses: [], accountTypes: [], taxStatuses: [], liquidities: [], institutions: [], investments: [] };
  expect(scopeLabel({}, choices)).toBe("All tracked investments");
  const selection = scopeSelection({ owner: "a", group: "removed-group" });
  expect(scopeLabel(selection, choices)).toBe("Owner: Renamed owner · Custom group: Unavailable selection");
  expect(snapshotScope(selection).customGroupIds).toEqual(["removed-group"]);
});
