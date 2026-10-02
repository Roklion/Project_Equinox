import { describe, expect, it } from "vitest";
import { parseCents } from "@/domain/financial";
import { serializeExportBundle, validateExportBundle } from "./bundle";

import { exportFixture } from "./testing/fixture";

describe("versioned canonical bundle", () => {
  it("round-trips exact money, date-only history, stable IDs and canonical notes", () => {
    const bundle = exportFixture(); const parsed = JSON.parse(serializeExportBundle(bundle));
    expect(validateExportBundle(parsed)).toEqual([]);
    expect(parseCents(parsed.data.actions[0].amount)).toBe(999999999999999999n);
    expect(parsed.data.marks[1].asOfDate).toBe("2024-02-29");
    expect(parsed.data.actions[0].notes).toBe("Synthetic note");
    expect(parsed.data.investments[0].ownerIds).toEqual(["oa", "ob"]);
    expect(parsed.data.actions[1].movements).toHaveLength(2);
  });
  it("is deterministic despite input entity, association and property ordering", () => {
    const first = exportFixture(); const second = exportFixture();
    second.data.investments.reverse(); second.data.owners.reverse(); second.data.classifications.reverse(); second.data.actions.reverse(); second.data.marks.reverse();
    for (const investment of second.data.investments) investment.ownerIds.reverse();
    for (const action of second.data.actions) action.movements.reverse();
    second.data.household = { currency: "USD", name: "Sample household", id: "h" };
    expect(serializeExportBundle(second)).toBe(serializeExportBundle(first));
  });
  it.each([null, [], {}, { ...exportFixture(), version: 2 }, { ...exportFixture(), authSessions: [] }])("rejects malformed/versioned/operational input", (input) => {
    expect(validateExportBundle(input).length).toBeGreaterThan(0);
  });
  it("rejects broken ownership/classification/action/mark references and duplicate IDs", () => {
    const bundle = exportFixture(); bundle.data.investments[0].ownerIds = ["outsider"];
    bundle.data.investments[1].classifications = { taxStatus: "asset" };
    bundle.data.actions[1].movements[0].investmentId = "absent"; bundle.data.marks[0].investmentId = "absent";
    bundle.data.owners.push(bundle.data.owners[0]);
    expect(validateExportBundle(bundle).map((r) => r.code)).toEqual(expect.arrayContaining(["invalid_reference", "invalid_invariant"]));
  });
  it("rejects incomplete/disagreeing transfers, lifecycle conflicts and duplicate valuations", () => {
    const bundle = exportFixture(); bundle.data.actions[1].movements.pop(); bundle.data.actions[0].movements[0].amount = "1.00";
    bundle.data.marks.push({ ...bundle.data.marks[2], id: "duplicate", asOfDate: "2024-03-01" });
    bundle.data.marks.push({ ...bundle.data.marks[1], id: "duplicate-date" });
    expect(validateExportBundle(bundle).filter((r) => r.code === "invalid_invariant").length).toBeGreaterThanOrEqual(4);
  });
  it("rejects rounded/numeric money, impossible dates and extra derived fields", () => {
    const bundle = exportFixture(); bundle.data.marks[0].grossValue = "1.001"; bundle.data.marks[0].asOfDate = "2023-02-29";
    expect(validateExportBundle(bundle).map((r) => r.code)).toEqual(expect.arrayContaining(["invalid_money", "invalid_date"]));
    expect(validateExportBundle({ ...bundle, data: { ...bundle.data, moic: 1.5 } })[0].code).toBe("invalid_structure");
    bundle.data.actions[0].amount = 100 as unknown as string;
    expect(validateExportBundle(bundle)[0].code).toBe("invalid_structure");
  });
});
