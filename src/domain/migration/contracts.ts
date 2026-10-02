import type { ClassificationDimension } from "@/domain/investment";

/** Opaque adapter-issued keys, unique across records, scopes and expectations in one dataset. */
export type SourceRecord = { sourceKey: string; sourceKind: string; safeReference?: string };
export type MigrationInvestment = SourceRecord & {
  kind: "investment"; name: string; ownerKeys: string[];
  classifications: Partial<Record<Exclude<ClassificationDimension, "customGroup">, string>>;
  customGroupKeys: string[]; status: "active" | "closed"; closedOn: string | null;
};
export type MigrationRecord = MigrationInvestment | (SourceRecord & (
  | { kind: "contribution" | "withdrawal"; investmentKey: string; effectiveDate: string; amount: string }
  | { kind: "transfer"; sourceInvestmentKey: string; destinationInvestmentKey: string; effectiveDate: string; amount: string }
  | { kind: "valuation"; investmentKey: string; asOfDate: string; grossValue: string; debt: string }
));
export type MoneyMeasure = "grossValue" | "debt" | "nav" | "contributions" | "distributions" | "pnl" | "historicalValue";
type ExpectedState<T> = { status: "available"; value: T } | { status: "missing" | "not_computable"; reason?: string; value?: never };
export type SourceExpectation = SourceRecord & {
  scopeKey: string; timing: { asOfDate: string; startDate?: never; endDate?: never } | { startDate: string; endDate: string; asOfDate?: never };
  sourceDefinitionTag?: string;
} & ( { measure: MoneyMeasure; expected: ExpectedState<string> } | { measure: "moic" | "xirr"; expected: ExpectedState<number> });
export type MigrationDataset = {
  datasetId: string; records: MigrationRecord[];
  scopes: Array<SourceRecord & { investmentKeys: string[] }>;
  expectations: SourceExpectation[];
};
export type ClassificationTarget = { canonicalId: string; normalizedLabel?: never } | { normalizedLabel: string; canonicalId?: never };
export type MigrationMapping = {
  householdId: string; owners: Record<string, string>;
  classifications: Partial<Record<ClassificationDimension, Record<string, ClassificationTarget>>>;
};
/** Supplied by later database preflight, never inferred from display labels. */
export type MigrationTarget = {
  householdId: string; ownerIds: string[];
  classificationIds: Partial<Record<ClassificationDimension, string[]>>;
};
export type ValidationCode = "invalid_money" | "invalid_date" | "duplicate_source_key" | "missing_investment"
  | "unresolved_owner" | "unresolved_classification" | "invalid_lifecycle" | "same_transfer_investment"
  | "duplicate_valuation" | "unsupported_record" | "invalid_identity" | "invalid_expectation" | "missing_scope" | "wrong_household";
export type ValidationFinding = { code: ValidationCode; severity: "error"; sourceKey?: string; field?: string };
