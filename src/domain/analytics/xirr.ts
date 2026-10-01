import xirr from "xirr";
import { assertCalendarDate } from "@/domain/financial";
import type { MetricResult } from "./contracts";

export type DatedReturnFlow = { effectiveDate: string; amountCents: bigint };

// Fixed Excel-style annual guess; bounds validate the returned rate, not the search.
export const XIRR_POLICY = {
  guess: 0.1, tolerance: 1e-10, maxIterations: 100,
  minRate: -0.9999, maxRate: 1_000_000, residualTolerance: 1e-8,
} as const;

/** Net dates in exact cents, then let the library find one rate from the fixed
 * guess. Non-convergence or an invalid result is unavailable; roots are not enumerated.
 */
export function solveXirr(flows: readonly DatedReturnFlow[]): MetricResult<number> {
  const byDate = new Map<string, bigint>();
  for (const flow of flows) {
    assertCalendarDate(flow.effectiveDate);
    byDate.set(flow.effectiveDate, (byDate.get(flow.effectiveDate) ?? 0n) + flow.amountCents);
  }
  const dated = [...byDate].filter(([, cents]) => cents !== 0n).sort(([a], [b]) => a.localeCompare(b));
  if (!dated.some(([, cents]) => cents < 0n) || !dated.some(([, cents]) => cents > 0n)) {
    return { status: "unavailable", reason: "no_sign_change" };
  }
  const transactions = dated.map(([date, cents]) => ({
    when: new Date(date + "T00:00:00Z"), amount: Number(cents),
  }));
  try {
    const rate = xirr(transactions, XIRR_POLICY);
    if (!Number.isFinite(rate) || rate < XIRR_POLICY.minRate || rate > XIRR_POLICY.maxRate) {
      return { status: "unavailable", reason: "no_root" };
    }
    // Independently check the dated equation: convergence of Newton steps alone
    // must not turn a bad candidate into an available financial return.
    const firstDay = transactions[0].when.getTime();
    let npv = 0;
    let magnitude = 0;
    for (const transaction of transactions) {
      const years = (transaction.when.getTime() - firstDay) / (86_400_000 * 365);
      const discounted = transaction.amount / Math.pow(1 + rate, years);
      npv += discounted;
      magnitude += Math.abs(discounted);
    }
    if (!Number.isFinite(npv) || !Number.isFinite(magnitude)
      || Math.abs(npv) > XIRR_POLICY.residualTolerance * magnitude) {
      return { status: "unavailable", reason: "no_root" };
    }
    return { status: "available", value: rate };
  } catch {
    return { status: "unavailable", reason: "no_root" };
  }
}
