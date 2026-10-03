import type { createAnalyticsService } from "./analytics";
import type { SnapshotScope } from "@/domain/analytics/snapshot";

/** Keep every Overview output on the same authoritative reporting boundary. */
export async function queryOverview(analytics: ReturnType<typeof createAnalyticsService>,
  householdId: string, date: string, start: string, scope: SnapshotScope = {}) {
  const [returns, period, snapshot, history] = await Promise.all([
    analytics.returns(householdId, date, scope),
    analytics.period(householdId, start, date, scope),
    analytics.snapshot(householdId, date, scope, "assetClass"),
    analytics.historicalSeries(householdId, "0100-01-01", date, scope),
  ]);
  return { returns, period, snapshot, history };
}
