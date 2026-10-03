import { describe, expect, it } from "vitest";
import type { MigrationDataset, MigrationMapping, MigrationRecord, MigrationTarget } from "./contracts";
import { validateMigration } from "./validate";

const provenance = { sourceKind: "synthetic" };
export function migrationFixture(): MigrationDataset {
  return { datasetId: "synthetic-dataset", scopes: [{ ...provenance, sourceKey: "household-scope", investmentKeys: ["a", "b"] }],
    records: [
      { ...provenance, sourceKey: "a", kind: "investment", name: "Sample A", ownerKeys: ["owner-a", "owner-b"], classifications: { assetClass: "asset" }, customGroupKeys: ["group"], status: "active", closedOn: null },
      { ...provenance, sourceKey: "b", kind: "investment", name: "Sample B", ownerKeys: ["owner-a"], classifications: {}, customGroupKeys: [], status: "closed", closedOn: "2024-02-29" },
      { ...provenance, sourceKey: "contribution", kind: "contribution", investmentKey: "a", effectiveDate: "2023-01-01", amount: "100.01" },
      { ...provenance, sourceKey: "withdrawal", kind: "withdrawal", investmentKey: "b", effectiveDate: "2024-02-29", amount: "20" },
      { ...provenance, sourceKey: "transfer", kind: "transfer", sourceInvestmentKey: "a", destinationInvestmentKey: "b", effectiveDate: "2023-06-01", amount: "25.25" },
      { ...provenance, sourceKey: "mark", kind: "valuation", investmentKey: "a", asOfDate: "2024-02-29", grossValue: "20", debt: "30.00" },
    ], expectations: [
      { ...provenance, sourceKey: "nav-check", scopeKey: "a", timing: { asOfDate: "2024-02-29" }, measure: "nav", expected: { status: "available", value: "-10.00" } },
      { ...provenance, sourceKey: "return-check", scopeKey: "household-scope", timing: { startDate: "2023-01-01", endDate: "2024-02-29" }, measure: "xirr", expected: { status: "not_computable", reason: "missing source output" }, sourceDefinitionTag: "legacy-policy" },
    ] };
}
const mapping: MigrationMapping = { householdId: "home", owners: { "owner-a": "oa", "owner-b": "ob" }, classifications: { assetClass: { asset: { canonicalId: "asset-id" } }, customGroup: { group: { normalizedLabel: "Sample group" } } } };
const target: MigrationTarget = { householdId: "home", ownerIds: ["oa", "ob"], classificationIds: { assetClass: ["asset-id"] } };
const validate = (dataset: MigrationDataset) => validateMigration(dataset, mapping, target);

describe("normalized migration preflight", () => {
  it("accepts joint ownership, explicit lookups/labels, mixed flows, leap dates and negative NAV", () => { expect(validate(migrationFixture())).toEqual([]); });
  it.each(["1.001", "-1", "0", "1e2", "10000000000000000", 2])("rejects noncanonical positive amounts: %s", (amount) => {
    const dataset = migrationFixture(); dataset.records.push({ ...provenance, sourceKey: "bad-money", kind: "contribution", investmentKey: "a", effectiveDate: "2024-01-01", amount: amount as string });
    expect(validate(dataset)).toContainEqual({ code: "invalid_money", severity: "error", sourceKey: "bad-money", field: "amount" });
  });
  it("reports stable keys/codes for representative invariant failures without echoing values", () => {
    const dataset = migrationFixture();
    dataset.records.push(
      { ...provenance, sourceKey: "bad-date", kind: "withdrawal", investmentKey: "b", effectiveDate: "2024-02-30", amount: "1" },
      { ...provenance, sourceKey: "bad-transfer", kind: "transfer", sourceInvestmentKey: "unknown", destinationInvestmentKey: "unknown", effectiveDate: "2024-01-01", amount: "1" },
      { ...provenance, sourceKey: "mark", kind: "valuation", investmentKey: "a", asOfDate: "2024-02-29", grossValue: "0", debt: "-1" },
      { ...provenance, sourceKey: "unsupported", kind: "dividend" } as unknown as MigrationRecord,
    );
    const result = validate(dataset);
    expect(result.map((r) => r.code)).toEqual(expect.arrayContaining(["invalid_date", "invalid_lifecycle", "missing_investment", "same_transfer_investment", "duplicate_source_key", "duplicate_valuation", "invalid_money", "unsupported_record"]));
    expect(JSON.stringify(result)).not.toContain("2024-02-30");
    expect(validate({ ...dataset, records: [...dataset.records].reverse() })).toEqual(result);
  });
  it("requires exact local household/owner/classification mappings and an explicit close date", () => {
    const dataset = migrationFixture(); const investment = dataset.records[0];
    if (investment.kind !== "investment") throw new Error();
    investment.ownerKeys = ["unknown"]; investment.classifications = { taxStatus: "unknown" }; investment.status = "closed";
    expect(validate(dataset).map((r) => r.code)).toEqual(expect.arrayContaining(["unresolved_owner", "unresolved_classification", "invalid_lifecycle"]));
    expect(validateMigration(dataset, mapping, { ...target, householdId: "other" }).map((r) => r.code)).toContain("wrong_household");
  });
  it("checks expectations without conflating unavailable output with zero", () => {
    const dataset = migrationFixture(); dataset.expectations[0].scopeKey = "missing";
    dataset.expectations.push({ ...provenance, sourceKey: "bad-ratio", scopeKey: "a", timing: { asOfDate: "2023-02-29" }, measure: "moic", expected: { status: "available", value: NaN } });
    expect(validate(dataset).map((r) => r.code)).toEqual(expect.arrayContaining(["missing_scope", "invalid_date", "invalid_expectation"]));
    dataset.expectations[0].scopeKey = "a";
    dataset.expectations[0] = { ...dataset.expectations[0], measure: "nav", expected: { status: "available", value: "10000000000000000000.01" } };
    expect(validate(dataset).filter((r) => r.sourceKey === "nav-check")).toEqual([]);
  });
  it("rejects ambiguous mapping, timing and unavailable values", () => {
    const dataset = migrationFixture();
    dataset.expectations[0].timing = { asOfDate: "2024-02-29", startDate: "2023-01-01", endDate: "2024-02-29" } as never;
    dataset.expectations[1].expected = { status: "missing", value: 0 } as never;
    const ambiguous: MigrationMapping = { ...mapping, classifications: { ...mapping.classifications, assetClass: { asset: { canonicalId: "asset-id", normalizedLabel: "Sample asset" } as never } } };
    expect(validateMigration(dataset, ambiguous, target).map((r) => r.code)).toEqual(expect.arrayContaining(["unresolved_classification", "invalid_expectation"]));
  });
});

it("validates the component of historical expectations without changing the measure contract", () => {
  const dataset = migrationFixture();
  dataset.expectations[0] = {...dataset.expectations[0],measure:"historicalValue",historicalComponent:"debt",expected:{status:"available",value:"30.00"}};
  expect(validate(dataset)).toEqual([]);
  dataset.expectations[0].historicalComponent = "unsupported" as never;
  expect(validate(dataset)).toContainEqual({code:"invalid_expectation",severity:"error",sourceKey:"nav-check",field:"historicalComponent"});
  dataset.expectations[0].historicalComponent = "nav";
  dataset.expectations[0].measure = "nav";
  expect(validate(dataset)).toContainEqual({code:"invalid_expectation",severity:"error",sourceKey:"nav-check",field:"historicalComponent"});
});

it("rejects a historical range instead of silently comparing its end point", () => {
  const dataset = migrationFixture();
  dataset.expectations[0] = {...dataset.expectations[0],measure:"historicalValue",timing:{startDate:"2023-01-01",endDate:"2024-02-29"},expected:{status:"available",value:"-10.00"}};
  expect(validate(dataset)).toContainEqual({code:"invalid_expectation",severity:"error",sourceKey:"nav-check",field:"timing"});
});
