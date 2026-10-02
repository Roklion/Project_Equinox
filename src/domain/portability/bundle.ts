import { assertCalendarDate, parseCents, type ActionKind, type Provenance } from "@/domain/financial";
import { classifyCashFlows } from "@/domain/analytics/cash-flow";
import type { ClassificationDimension, Household } from "@/domain/investment";
import { classificationDimensions, compare, validateMigration } from "@/domain/migration/validate";
import type { MigrationDataset, MigrationInvestment, MigrationMapping, MigrationRecord, MigrationTarget } from "@/domain/migration/contracts";

export type ExportData = {
  household: Household;
  owners: Array<{ id: string; name: string }>;
  classifications: Array<{ id: string; dimension: ClassificationDimension; label: string }>;
  investments: Array<{
    id: string; name: string; status: "active" | "closed"; closedOn: string | null;
    ownerIds: string[]; groupIds: string[];
    classifications: Partial<Record<Exclude<ClassificationDimension, "customGroup">, string>>;
  }>;
  actions: Array<{
    id: string; kind: ActionKind; effectiveDate: string; amount: string;
    movements: Array<{ id: string; investmentId: string; role: "external" | "source" | "destination"; direction: "in" | "out"; amount: string }>;
  } & Provenance>;
  marks: Array<{ id: string; investmentId: string; asOfDate: string; grossValue: string; debt: string } & Provenance>;
};
export type ExportBundle = { format: "equinox-canonical"; version: 1; generatedAt: string; data: ExportData };
export type BundleFinding = { code: "unsupported_version" | "invalid_structure" | "invalid_reference" | "invalid_money" | "invalid_date" | "invalid_invariant"; path: string };

// Small format-specific structural checker. Reject extra fields so operational data/analytics
// cannot silently become part of the portable contract. No input values enter errors.
type Shape = (value: unknown, path: string) => void;
function fail(path: string): never { throw new Error(path); }
const string: Shape = (v, p) => { if (typeof v !== "string" || !v.trim()) fail(p); };
const freeString: Shape = (v, p) => { if (typeof v !== "string") fail(p); };
const nullable = (shape: Shape): Shape => (v, p) => { if (v !== null) shape(v, p); };
const oneOf = (...values: unknown[]): Shape => (v, p) => { if (!values.includes(v)) fail(p); };
const list = (shape: Shape): Shape => (v, p) => {
  if (!Array.isArray(v)) fail(p);
  v.forEach((item, index) => shape(item, `${p}[${index}]`));
};
function object(required: Record<string, Shape>, optional: Record<string, Shape> = {}): Shape {
  return (v, p) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) fail(p);
    const row = v as Record<string, unknown>;
    for (const [key, shape] of Object.entries(required)) shape(row[key], `${p}.${key}`);
    for (const key of Object.keys(row)) {
      if (Object.hasOwn(required, key)) continue;
      if (!Object.hasOwn(optional, key)) fail(`${p}.${key}`);
      optional[key](row[key], `${p}.${key}`);
    }
  };
}
const provenance = { source: oneOf("manual", "import", "system"), sourceReference: freeString, notes: freeString };
const classificationReferences = object({}, Object.fromEntries(classificationDimensions.filter((d) => d !== "customGroup").map((d) => [d, string])));
const dataShape = object({
  household: object({ id: string, name: string, currency: oneOf("USD") }),
  owners: list(object({ id: string, name: string })),
  classifications: list(object({ id: string, dimension: oneOf(...classificationDimensions), label: string })),
  investments: list(object({ id: string, name: string, status: oneOf("active", "closed"), closedOn: nullable(string), ownerIds: list(string), groupIds: list(string), classifications: classificationReferences })),
  actions: list(object({ id: string, kind: oneOf("contribution", "withdrawal", "transfer"), effectiveDate: string, amount: string,
    movements: list(object({ id: string, investmentId: string, role: oneOf("external", "source", "destination"), direction: oneOf("in", "out"), amount: string })) }, provenance)),
  marks: list(object({ id: string, investmentId: string, asOfDate: string, grossValue: string, debt: string }, provenance)),
});
const bundleShape = object({ format: oneOf("equinox-canonical"), version: oneOf(1), generatedAt: string, data: dataShape });

/** Accepts parsed JSON without trusting a TypeScript cast. */
export function validateExportBundle(input: unknown): BundleFinding[] {
  if (input && typeof input === "object" && "version" in input && input.version !== 1) return [{ code: "unsupported_version", path: "version" }];
  try { bundleShape(input, "bundle"); } catch (error) { return [{ code: "invalid_structure", path: error instanceof Error ? error.message : "bundle" }]; }
  const bundle = input as ExportBundle;
  const { data } = bundle;
  const findings: BundleFinding[] = [];
  const add = (code: BundleFinding["code"], path: string) => findings.push({ code, path });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(bundle.generatedAt) || !Number.isFinite(Date.parse(bundle.generatedAt)) || new Date(bundle.generatedAt).toISOString() !== bundle.generatedAt) add("invalid_date", "generatedAt");
  const unique = (ids: string[], path: string) => { if (new Set(ids).size !== ids.length) add("invalid_invariant", path); };
  unique(data.owners.map((r) => r.id), "owners");
  for (const dimension of classificationDimensions) unique(data.classifications.filter((r) => r.dimension === dimension).map((r) => r.id), `classifications.${dimension}`);
  unique(data.investments.map((r) => r.id), "investments"); unique(data.actions.map((r) => r.id), "actions"); unique(data.marks.map((r) => r.id), "marks");
  unique(data.actions.flatMap((r) => r.movements.map((m) => m.id)), "movements");
  const mapping: MigrationMapping = { householdId: data.household.id, owners: Object.fromEntries(data.owners.map((o) => [o.id, o.id])), classifications: {} };
  const target: MigrationTarget = { householdId: data.household.id, ownerIds: data.owners.map((o) => o.id), classificationIds: {} };
  for (const dimension of classificationDimensions) {
    const ids = data.classifications.filter((c) => c.dimension === dimension).map((c) => c.id);
    mapping.classifications[dimension] = Object.fromEntries(ids.map((id) => [id, { canonicalId: id }]));
    target.classificationIds[dimension] = ids;
  }
  const records: MigrationRecord[] = data.investments.map((i): MigrationInvestment => ({ sourceKey: `investment:${i.id}`, sourceKind: "canonical", kind: "investment", name: i.name,
    ownerKeys: i.ownerIds, customGroupKeys: i.groupIds, classifications: i.classifications, status: i.status, closedOn: i.closedOn }));
  for (const investment of data.investments) { unique(investment.ownerIds, "investments.ownerIds"); unique(investment.groupIds, "investments.groupIds"); }
  for (const action of data.actions) {
    try { classifyCashFlows([action], new Set(data.investments.map((i) => i.id))); } catch { add("invalid_invariant", "actions.movements"); }
    const base = { sourceKey: `action:${action.id}`, sourceKind: "canonical", effectiveDate: action.effectiveDate, amount: action.amount };
    if (action.kind === "transfer") records.push({ ...base, kind: "transfer", sourceInvestmentKey: `investment:${action.movements.find((m) => m.role === "source")?.investmentId ?? ""}`, destinationInvestmentKey: `investment:${action.movements.find((m) => m.role === "destination")?.investmentId ?? ""}` });
    else records.push({ ...base, kind: action.kind, investmentKey: `investment:${action.movements[0]?.investmentId ?? ""}` });
    for (const movement of action.movements) {
      if (!data.investments.some((i) => i.id === movement.investmentId)) add("invalid_reference", "actions.movements.investmentId");
      try { parseCents(movement.amount); } catch { add("invalid_money", "actions.movements.amount"); }
    }
  }
  for (const mark of data.marks) records.push({ sourceKey: `mark:${mark.id}`, sourceKind: "canonical", kind: "valuation", investmentKey: `investment:${mark.investmentId}`, asOfDate: mark.asOfDate, grossValue: mark.grossValue, debt: mark.debt });
  const dataset: MigrationDataset = { datasetId: "canonical-export", records, scopes: [], expectations: [] };
  for (const finding of validateMigration(dataset, mapping, target)) {
    const code = finding.code === "invalid_money" || finding.code === "invalid_date" ? finding.code
      : ["missing_investment", "unresolved_owner", "unresolved_classification"].includes(finding.code) ? "invalid_reference" : "invalid_invariant";
    add(code, finding.field ?? "data");
  }
  // A date-only string must also fit the canonical calendar convention independently.
  try { assertCalendarDate(bundle.generatedAt.slice(0, 10)); } catch { add("invalid_date", "generatedAt"); }
  return findings;
}

/** Stable ordering and object-property order, including nested associations and provenance. */
export function serializeExportBundle(bundle: ExportBundle): string {
  if (validateExportBundle(bundle).length) throw new Error("Invalid canonical export bundle.");
  const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => compare(a.id, b.id));
  const provenanceOf = (row: Provenance): Provenance => ({ ...(row.source !== undefined ? { source: row.source } : {}), ...(row.sourceReference !== undefined ? { sourceReference: row.sourceReference } : {}), ...(row.notes !== undefined ? { notes: row.notes } : {}) });
  const { data } = bundle;
  const normalized: ExportBundle = { format: "equinox-canonical", version: 1, generatedAt: bundle.generatedAt, data: {
    household: { id: data.household.id, name: data.household.name, currency: data.household.currency },
    owners: byId(data.owners).map(({ id, name }) => ({ id, name })),
    classifications: [...data.classifications].sort((a, b) => compare(a.dimension, b.dimension) || compare(a.id, b.id)).map(({ id, dimension, label }) => ({ id, dimension, label })),
    investments: byId(data.investments).map((i) => ({ id: i.id, name: i.name, status: i.status, closedOn: i.closedOn, ownerIds: [...i.ownerIds].sort(compare), groupIds: [...i.groupIds].sort(compare), classifications: Object.fromEntries(classificationDimensions.filter((d) => d !== "customGroup" && i.classifications[d] !== undefined).map((d) => [d, i.classifications[d as keyof typeof i.classifications]])) })),
    actions: byId(data.actions).map((a) => ({ id: a.id, kind: a.kind, effectiveDate: a.effectiveDate, amount: a.amount, ...provenanceOf(a), movements: byId(a.movements).map(({ id, investmentId, role, direction, amount }) => ({ id, investmentId, role, direction, amount })) })),
    marks: byId(data.marks).map((m) => ({ id: m.id, investmentId: m.investmentId, asOfDate: m.asOfDate, grossValue: m.grossValue, debt: m.debt, ...provenanceOf(m) })),
  } };
  return `${JSON.stringify(normalized, null, 2)}\n`;
}
