import { assertCalendarDate, parseCents } from "@/domain/financial";
import type { MetricResult } from "./contracts";

export const classificationDimensions = ["assetClass", "accountType", "taxStatus", "liquidity", "institution"] as const;
export type ClassificationDimension = typeof classificationDimensions[number];
export type GroupingDimension = "investment" | ClassificationDimension | "ownerSet";
export type IdentityLabel = { id: string; label: string };
export type AnalyticsInvestment = {
  id: string; name: string; status: "active" | "closed"; closedOn: string | null;
  owners: IdentityLabel[]; customGroups: IdentityLabel[];
  classifications: Record<ClassificationDimension, IdentityLabel | null>;
};
export type AnalyticsMark = {
  id: string; investmentId: string; asOfDate: string; grossValue: string; debt: string;
};
export type SnapshotSources = { investments: AnalyticsInvestment[]; marks: AnalyticsMark[] };
export type SnapshotScope = {
  investmentIds?: readonly string[]; ownerIds?: readonly string[]; customGroupIds?: readonly string[];
  classifications?: Partial<Record<ClassificationDimension, readonly string[]>>;
};
export type SnapshotMoney = { grossValueCents: bigint; debtCents: bigint; navCents: bigint };
export type ConstituentSnapshot = {
  investment: AnalyticsInvestment;
  valuation: MetricResult<SnapshotMoney & { markId: string; markAsOfDate: string; ageDays: number }>;
};
export type SnapshotAggregate = {
  totals: MetricResult<SnapshotMoney>;
  coverage: { selectedCount: number; valuedCount: number; missingInvestmentIds: string[] };
};
export type Snapshot = SnapshotAggregate & { asOfDate: string; constituents: ConstituentSnapshot[] };
export type SnapshotBucket = SnapshotAggregate & { key: string; label: string; investmentIds: string[] };

function matches(investment: AnalyticsInvestment, scope: SnapshotScope): boolean {
  return (scope.investmentIds === undefined || scope.investmentIds.includes(investment.id))
    && (scope.ownerIds === undefined || investment.owners.some((owner) => scope.ownerIds!.includes(owner.id)))
    && (scope.customGroupIds === undefined || investment.customGroups.some((group) => scope.customGroupIds!.includes(group.id)))
    && classificationDimensions.every((dimension) => {
      const ids = scope.classifications?.[dimension];
      const classification = investment.classifications[dimension];
      return ids === undefined || (classification !== null && ids.includes(classification.id));
    });
}

function aggregate(constituents: readonly ConstituentSnapshot[]): SnapshotAggregate {
  const missingInvestmentIds = constituents.filter((item) => item.valuation.status !== "available")
    .map((item) => item.investment.id);
  const coverage = { selectedCount: constituents.length,
    valuedCount: constituents.length - missingInvestmentIds.length, missingInvestmentIds };
  if (missingInvestmentIds.length) {
    return { coverage, totals: { status: "incomplete", reason: "missing_valuation", missingInvestmentIds } };
  }
  const value: SnapshotMoney = { grossValueCents: 0n, debtCents: 0n, navCents: 0n };
  for (const item of constituents) {
    if (item.valuation.status !== "available") continue;
    value.grossValueCents += item.valuation.value.grossValueCents;
    value.debtCents += item.valuation.value.debtCents;
    value.navCents += item.valuation.value.navCents;
  }
  return { coverage, totals: { status: "available", value } };
}

/** Authoritative valuation selection and exact-cent aggregation. Closed records are retained. */
export function calculateSnapshot(sources: SnapshotSources, asOfDate: string, scope: SnapshotScope = {}): Snapshot {
  assertCalendarDate(asOfDate);
  const latest = new Map<string, AnalyticsMark>();
  for (const mark of sources.marks) {
    if (mark.asOfDate > asOfDate) continue;
    const previous = latest.get(mark.investmentId);
    if (!previous || previous.asOfDate < mark.asOfDate) latest.set(mark.investmentId, mark);
  }
  const constituents: ConstituentSnapshot[] = sources.investments.filter((investment) => matches(investment, scope))
    .sort((a, b) => a.id.localeCompare(b.id)).map((investment) => {
      const mark = latest.get(investment.id);
      if (!mark) return { investment, valuation: { status: "incomplete", reason: "missing_valuation",
        missingInvestmentIds: [investment.id] } };
      const grossValueCents = parseCents(mark.grossValue, true);
      const debtCents = parseCents(mark.debt, true);
      // UTC midnight subtraction measures calendar days, unaffected by local DST.
      const ageDays = (Date.parse(asOfDate + "T00:00:00Z") - Date.parse(mark.asOfDate + "T00:00:00Z")) / 86_400_000;
      return { investment, valuation: { status: "available", value: {
        markId: mark.id, markAsOfDate: mark.asOfDate, ageDays,
        grossValueCents, debtCents, navCents: grossValueCents - debtCents,
      } } };
    });
  return { asOfDate, constituents, ...aggregate(constituents) };
}

function bucketIdentity(investment: AnalyticsInvestment, dimension: GroupingDimension): { key: string; label: string } {
  if (dimension === "investment") return { key: investment.id, label: investment.name };
  if (dimension === "ownerSet") {
    const owners = [...investment.owners].sort((a, b) => a.id.localeCompare(b.id));
    return { key: JSON.stringify(owners.map((owner) => owner.id)),
      label: owners.map((owner) => owner.label).join(" + ") || "Unassigned" };
  }
  const classification = investment.classifications[dimension];
  return { key: classification ? JSON.stringify(classification.id) : "null",
    label: classification?.label ?? "Unclassified" };
}

/** Every constituent enters exactly one bucket. Custom groups are intentionally filters only. */
export function groupSnapshot(snapshot: Snapshot, dimension: GroupingDimension): SnapshotBucket[] {
  const buckets = new Map<string, { label: string; constituents: ConstituentSnapshot[] }>();
  for (const item of snapshot.constituents) {
    const { key, label } = bucketIdentity(item.investment, dimension);
    const bucket = buckets.get(key) ?? { label, constituents: [] };
    bucket.constituents.push(item);
    buckets.set(key, bucket);
  }
  return [...buckets].sort(([a], [b]) => a.localeCompare(b)).map(([key, bucket]) => ({
    key, label: bucket.label, investmentIds: bucket.constituents.map((item) => item.investment.id),
    ...aggregate(bucket.constituents),
  }));
}
