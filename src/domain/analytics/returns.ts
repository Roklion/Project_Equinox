import { calculateInception, type CashFlowSources } from "./cash-flow";
import type { MetricResult } from "./contracts";
import type { SnapshotScope } from "./snapshot";
import { solveXirr } from "./xirr";

/** Calculate inception returns from the existing scope, cash-flow and terminal
 * snapshot owners. No derived result is persisted or averaged across children.
 */
export function calculateReturns(sources: CashFlowSources, asOfDate: string, scope: SnapshotScope = {}) {
  const inception = calculateInception(sources, asOfDate, scope);
  const { snapshot, cashFlows, flows } = inception;
  let moic: MetricResult<number>;
  let xirr: MetricResult<number>;
  if (snapshot.totals.status !== "available") {
    moic = snapshot.totals;
    xirr = snapshot.totals;
  } else {
    const navCents = snapshot.totals.value.navCents;
    const proceedsCents = navCents + cashFlows.distributionsCents;
    moic = cashFlows.contributionsCents === 0n
      ? { status: "unavailable", reason: "zero_contributions" }
      : { status: "available", value: Number(proceedsCents) / Number(cashFlows.contributionsCents) };
    xirr = solveXirr([
      ...flows.map((flow) => ({ effectiveDate: flow.effectiveDate,
        amountCents: flow.kind === "contribution" ? -flow.amountCents : flow.amountCents })),
      { effectiveDate: asOfDate, amountCents: navCents },
    ]);
  }
  return { ...inception, moic, xirr };
}
