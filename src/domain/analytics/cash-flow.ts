import { assertCalendarDate, parseCents, type ActionKind, type Movement } from "@/domain/financial";
import { classifyTransfer, isInPeriod, type MetricResult } from "./contracts";
import { calculateSnapshot, type SnapshotScope, type SnapshotSources } from "./snapshot";

/** Complete logical actions, including both transfer legs even for a one-investment scope. */
export type AnalyticsAction = {
  id: string; kind: ActionKind; effectiveDate: string; amount: string;
  movements: Pick<Movement, "investmentId" | "role" | "direction" | "amount">[];
};
export type CashFlowSources = SnapshotSources & { actions: AnalyticsAction[] };
export type BoundaryCashFlow = {
  actionId: string; effectiveDate: string; kind: "contribution" | "distribution"; amountCents: bigint;
};
export type CashFlowTotals = {
  contributionsCents: bigint; distributionsCents: bigint; netExternalCashFlowCents: bigint;
};
export type PeriodChange = {
  beginningNavCents: bigint; endingNavCents: bigint; navChangeCents: bigint;
  netExternalCashFlowCents: bigint; investmentPerformanceEffectCents: bigint; pnlCents: bigint;
};

/** Canonical actions are structurally complete; reject broken inputs instead of inventing totals. */
export function classifyCashFlows(actions: readonly AnalyticsAction[], includedIds: ReadonlySet<string>): BoundaryCashFlow[] {
  const flows: BoundaryCashFlow[] = [];
  for (const action of actions) {
    assertCalendarDate(action.effectiveDate);
    const amountCents = parseCents(action.amount);
    const legs = action.movements;
    let kind: "contribution" | "distribution" | "internal" | "excluded";
    if (action.kind === "transfer") {
      const source = legs.find((leg) => leg.role === "source" && leg.direction === "out");
      const destination = legs.find((leg) => leg.role === "destination" && leg.direction === "in");
      if (legs.length !== 2 || !source || !destination || source.investmentId === destination.investmentId) {
        throw new Error("Incomplete canonical transfer.");
      }
      kind = classifyTransfer(source.investmentId, destination.investmentId, includedIds);
    } else {
      const direction = action.kind === "contribution" ? "in" : "out";
      if (legs.length !== 1 || legs[0].role !== "external" || legs[0].direction !== direction) {
        throw new Error("Incomplete canonical external action.");
      }
      kind = includedIds.has(legs[0].investmentId)
        ? (action.kind === "contribution" ? "contribution" : "distribution") : "excluded";
    }
    if (legs.some((leg) => parseCents(leg.amount) !== amountCents)) throw new Error("Canonical action amounts disagree.");
    if (kind === "contribution" || kind === "distribution") {
      flows.push({ actionId: action.id, effectiveDate: action.effectiveDate, kind, amountCents });
    }
  }
  return flows.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.actionId.localeCompare(b.actionId));
}

export function totalCashFlows(flows: readonly BoundaryCashFlow[]): CashFlowTotals {
  let contributionsCents = 0n;
  let distributionsCents = 0n;
  for (const flow of flows) {
    if (flow.kind === "contribution") contributionsCents += flow.amountCents;
    else distributionsCents += flow.amountCents;
  }
  return { contributionsCents, distributionsCents, netExternalCashFlowCents: contributionsCents - distributionsCents };
}

export function assertPeriod(startDate: string, endDate: string): void {
  assertCalendarDate(startDate);
  assertCalendarDate(endDate);
  if (startDate > endDate) throw new Error("Period start must not follow its end.");
}

export function calculatePeriod(sources: CashFlowSources, startDate: string, endDate: string, scope: SnapshotScope = {}) {
  assertPeriod(startDate, endDate);
  const beginning = calculateSnapshot(sources, startDate, scope);
  const ending = calculateSnapshot(sources, endDate, scope);
  const includedIds = new Set(ending.constituents.map((item) => item.investment.id));
  const flows = classifyCashFlows(sources.actions.filter((action) => isInPeriod(action.effectiveDate, startDate, endDate)), includedIds);
  const cashFlows = totalCashFlows(flows);
  let change: MetricResult<PeriodChange>;
  if (beginning.totals.status !== "available" || ending.totals.status !== "available") {
    change = { status: "incomplete", reason: "missing_valuation", missingInvestmentIds:
      [...new Set([...beginning.coverage.missingInvestmentIds, ...ending.coverage.missingInvestmentIds])].sort() };
  } else {
    const beginningNavCents = beginning.totals.value.navCents;
    const endingNavCents = ending.totals.value.navCents;
    const navChangeCents = endingNavCents - beginningNavCents;
    const investmentPerformanceEffectCents = navChangeCents - cashFlows.netExternalCashFlowCents;
    change = { status: "available", value: { beginningNavCents, endingNavCents, navChangeCents,
      netExternalCashFlowCents: cashFlows.netExternalCashFlowCents,
      investmentPerformanceEffectCents, pnlCents: investmentPerformanceEffectCents } };
  }
  return { startDate, endDate, beginning, ending, flows, cashFlows, change };
}

/** Inception means all recorded capital history with a zero opening NAV. */
export function calculateInception(sources: CashFlowSources, asOfDate: string, scope: SnapshotScope = {}) {
  const snapshot = calculateSnapshot(sources, asOfDate, scope);
  const includedIds = new Set(snapshot.constituents.map((item) => item.investment.id));
  const flows = classifyCashFlows(sources.actions.filter((action) => action.effectiveDate <= asOfDate), includedIds);
  const cashFlows = totalCashFlows(flows);
  const pnl: MetricResult<bigint> = snapshot.totals.status === "available"
    ? { status: "available", value: snapshot.totals.value.navCents - cashFlows.netExternalCashFlowCents }
    : snapshot.totals;
  return { asOfDate, snapshot, flows, cashFlows, netInvestedCapitalCents: cashFlows.netExternalCashFlowCents, pnl };
}
