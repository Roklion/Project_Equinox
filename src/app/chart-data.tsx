import "server-only";
import { withEntryService } from "@/app/add/entry-data";
import { createAnalyticsService } from "@/application/analytics";
import type { SnapshotScope } from "@/domain/analytics/snapshot";
import { getDatabase } from "@/persistence/database";
import { createPostgresAnalyticsRepository } from "@/persistence/analytics";
import { CompositionChart, ValueTrendChart } from "@/components/charts/history-charts";
import { SurfaceState } from "@/components/financial/primitives";

/** Fresh authenticated server reads; no financial responses are persisted or cached. */
export async function loadHistoricalCharts(scope: SnapshotScope = {}, endDate = new Date().toISOString().slice(0, 10)) {
  try {
    const data = await withEntryService(({ householdId }) =>
      createAnalyticsService(createPostgresAnalyticsRepository(getDatabase().db))
        .historicalSeries(householdId, "0100-01-01", endDate, scope));
    if (!data) return <SurfaceState kind="empty" title="No investment history available">Configure a household and record valuation marks to see charts.</SurfaceState>;
    return <><ValueTrendChart series={data.valueSeries} allowMeasureSwitch />
      <CompositionChart seriesByGrouping={data.compositionSeries} /></>;
  } catch {
    return <SurfaceState kind="error" title="Charts could not be loaded">Please reload to try again.</SurfaceState>;
  }
}
