import "server-only";
import { cookies } from "next/headers";
import { assertCalendarDate } from "@/domain/financial";
import { ChartReportingDate } from "@/components/charts/reporting-date";
import { withEntryService } from "@/app/add/entry-data";
import { createAnalyticsService } from "@/application/analytics";
import type { SnapshotScope } from "@/domain/analytics/snapshot";
import { getDatabase } from "@/persistence/database";
import { createPostgresAnalyticsRepository } from "@/persistence/analytics";
import { CompositionChart, ValueTrendChart } from "@/components/charts/history-charts";
import { SurfaceState } from "@/components/financial/primitives";

/** Fresh authenticated server reads; no financial responses are persisted or cached. */
export async function loadHistoricalCharts(scope: SnapshotScope = {}, suppliedDate?: string) {
  let endDate = suppliedDate ?? (await cookies()).get("equinox-chart-date")?.value;
  try { if (endDate) assertCalendarDate(endDate); } catch { endDate = undefined; }
  const reportingDate = <ChartReportingDate serverDate={endDate} />;
  if (!endDate) return <>{reportingDate}<SurfaceState kind="loading" title="Loading charts">Preparing your local reporting date.</SurfaceState></>;
  try {
    const data = await withEntryService(({ householdId }) =>
      createAnalyticsService(createPostgresAnalyticsRepository(getDatabase().db))
        .historicalSeries(householdId, "0100-01-01", endDate, scope));
    if (!data) return <>{reportingDate}<SurfaceState kind="empty" title="No investment history available">Configure a household and record valuation marks to see charts.</SurfaceState></>;
    return <>{reportingDate}<ValueTrendChart series={data.valueSeries} allowMeasureSwitch />
      <CompositionChart seriesByGrouping={data.compositionSeries} /></>;
  } catch {
    return <>{reportingDate}<SurfaceState kind="error" title="Charts could not be loaded">Please reload to try again.</SurfaceState></>;
  }
}
