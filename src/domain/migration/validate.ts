import { assertCalendarDate, parseCents } from "@/domain/financial";
import type { ClassificationDimension } from "@/domain/investment";
import type { MigrationDataset, MigrationMapping, MigrationTarget, ValidationCode, ValidationFinding } from "./contracts";

export const classificationDimensions: ClassificationDimension[] = ["assetClass", "accountType", "taxStatus", "liquidity", "institution", "customGroup"];
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
export function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

/** Validates normalized adapter inputs. Findings contain keys/fields, never source values or notes. */
export function validateMigration(dataset: MigrationDataset, mapping: MigrationMapping, target: MigrationTarget): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const add = (code: ValidationCode, sourceKey?: string, field?: string) => findings.push({ code, severity: "error", ...(sourceKey ? { sourceKey } : {}), ...(field ? { field } : {}) });
  const check = (code: ValidationCode, key: string, field: string, action: () => void) => { try { action(); } catch { add(code, key, field); } };
  const date = (value: string, key: string, field: string) => check("invalid_date", key, field, () => assertCalendarDate(value));
  const money = (value: string, zero: boolean, key: string, field: string) => check("invalid_money", key, field, () => { parseCents(value, zero); });
  if (!text(dataset.datasetId)) add("invalid_identity", undefined, "datasetId");
  if (!text(mapping.householdId) || mapping.householdId !== target.householdId) add("wrong_household");
  const keys = new Set<string>();
  for (const record of [...dataset.records, ...dataset.scopes, ...dataset.expectations]) {
    if (!text(record.sourceKind)) add("invalid_identity", record.sourceKey, "sourceKind");
    if (!text(record.sourceKey)) add("invalid_identity", undefined, "sourceKey");
    else if (keys.has(record.sourceKey)) add("duplicate_source_key", record.sourceKey);
    keys.add(record.sourceKey);
  }
  const investments = new Map(dataset.records.filter((r) => r.kind === "investment").map((r) => [r.sourceKey, r]));
  const activity = (investmentKey: string, activityDate: string, key: string) => {
    const investment = investments.get(investmentKey);
    if (!investment) add("missing_investment", key);
    else if (investment.status === "closed" && investment.closedOn && activityDate > investment.closedOn) add("invalid_lifecycle", key);
  };
  const classification = (dimension: ClassificationDimension, value: string, key: string) => {
    const entries = mapping.classifications[dimension];
    const mapped = entries && Object.hasOwn(entries, value) ? entries[value] : undefined;
    if (!mapped || ("canonicalId" in mapped && "normalizedLabel" in mapped) || (mapped.canonicalId !== undefined ? !target.classificationIds[dimension]?.includes(mapped.canonicalId)
      : !text(mapped.normalizedLabel) || mapped.normalizedLabel !== mapped.normalizedLabel.trim())) add("unresolved_classification", key, dimension);
  };
  const marks = new Map<string, Set<string>>();
  for (const record of dataset.records) {
    const key = record.sourceKey;
    switch (record.kind) {
      case "investment":
        if (!text(record.name)) add("invalid_identity", key, "name");
        if (!record.ownerKeys.length || record.ownerKeys.some((owner) => !Object.hasOwn(mapping.owners, owner) || !target.ownerIds.includes(mapping.owners[owner]))) add("unresolved_owner", key, "ownerKeys");
        for (const [dimension, value] of Object.entries(record.classifications)) {
          if (!classificationDimensions.includes(dimension as ClassificationDimension) || dimension === "customGroup") add("unsupported_record", key, "classifications");
          else classification(dimension as ClassificationDimension, value, key);
        }
        for (const group of record.customGroupKeys) classification("customGroup", group, key);
        if ((record.status === "active" && record.closedOn !== null) || (record.status === "closed" && !record.closedOn) || !["active", "closed"].includes(record.status)) add("invalid_lifecycle", key);
        if (record.closedOn !== null) date(record.closedOn, key, "closedOn");
        break;
      case "contribution": case "withdrawal":
        date(record.effectiveDate, key, "effectiveDate"); money(record.amount, false, key, "amount"); activity(record.investmentKey, record.effectiveDate, key); break;
      case "transfer":
        date(record.effectiveDate, key, "effectiveDate"); money(record.amount, false, key, "amount");
        if (record.sourceInvestmentKey === record.destinationInvestmentKey) add("same_transfer_investment", key);
        activity(record.sourceInvestmentKey, record.effectiveDate, key); activity(record.destinationInvestmentKey, record.effectiveDate, key); break;
      case "valuation": {
        date(record.asOfDate, key, "asOfDate"); money(record.grossValue, true, key, "grossValue"); money(record.debt, true, key, "debt"); activity(record.investmentKey, record.asOfDate, key);
        const dates = marks.get(record.investmentKey) ?? new Set<string>();
        if (dates.has(record.asOfDate)) add("duplicate_valuation", key);
        dates.add(record.asOfDate); marks.set(record.investmentKey, dates); break;
      }
      default: add("unsupported_record", key);
    }
  }
  for (const scope of dataset.scopes) for (const key of scope.investmentKeys) if (!investments.has(key)) add("missing_investment", scope.sourceKey);
  const scopeKeys = new Set([...investments.keys(), ...dataset.scopes.map((s) => s.sourceKey)]);
  for (const expectation of dataset.expectations) {
    const key = expectation.sourceKey;
    if (expectation.historicalComponent !== undefined && (expectation.measure !== "historicalValue" || !["grossValue", "debt", "nav"].includes(expectation.historicalComponent))) add("invalid_expectation", key, "historicalComponent");
    if (!scopeKeys.has(expectation.scopeKey)) add("missing_scope", key);
    if (expectation.timing.asOfDate !== undefined) {
      date(expectation.timing.asOfDate, key, "asOfDate");
      if ("startDate" in expectation.timing || "endDate" in expectation.timing) add("invalid_expectation", key, "timing");
    }
    else {
      date(expectation.timing.startDate, key, "startDate"); date(expectation.timing.endDate, key, "endDate");
      if (expectation.timing.startDate > expectation.timing.endDate) add("invalid_date", key, "timing");
    }
    if (!["grossValue", "debt", "nav", "contributions", "distributions", "pnl", "historicalValue", "moic", "xirr"].includes(expectation.measure)) add("invalid_expectation", key, "measure");
    if (expectation.expected.status === "available") {
      const value = expectation.expected.value;
      if (expectation.measure === "moic" || expectation.measure === "xirr") {
        if (typeof value !== "number" || !Number.isFinite(value)) add("invalid_expectation", key, "expected");
      } else check("invalid_money", key, "expected", () => {
        // Aggregated expectations can exceed one stored monetary column's capacity.
        if (typeof value !== "string" || !/^-?(0|[1-9]\d*)(\.\d{1,2})?$/.test(value)) throw new Error();
        if (["grossValue", "debt", "contributions", "distributions"].includes(expectation.measure) && value.startsWith("-")) throw new Error();
      });
    } else if (!["missing", "not_computable"].includes(expectation.expected.status) || "value" in expectation.expected) add("invalid_expectation", key, "expected");
  }
  return findings.sort((a, b) => compare(a.sourceKey ?? "", b.sourceKey ?? "") || compare(a.code, b.code) || compare(a.field ?? "", b.field ?? ""));
}
