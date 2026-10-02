import Link from "next/link";
import { withAnalyticsService } from "@/app/add/entry-data";
import { LocalReportingDate } from "@/components/financial/local-reporting-date";
import { SurfaceState } from "@/components/financial/primitives";
import { optionalDate, overviewRange, periodStart, singleParam, type PageQuery } from "@/components/financial/reporting-context";
import { Overview } from "@/components/overview/overview";

export const dynamic = "force-dynamic";
export default async function HomePage({ searchParams }: { searchParams: Promise<PageQuery> }) {
  const query = await searchParams;
  const range = overviewRange(query.range);
  if (!singleParam(query.date)) return <LocalReportingDate pathname="/" range={range} />;
  let data;
  try {
    const date = optionalDate(query.date)!;
    const start = periodStart(date, range);
    data = await withAnalyticsService(async ({ householdId, analytics }) => {
      const [returns, period, snapshot, series] = await Promise.all([
        analytics.returns(householdId, date), analytics.period(householdId, start, date),
        analytics.snapshot(householdId, date, {}, "assetClass"), analytics.valueSeries(householdId, start, date),
      ]);
      return { returns, period, snapshot, series };
    });
  } catch {
    return <><h1>Overview</h1><SurfaceState kind="error" title="Overview could not be loaded" action={<Link href="/">Try again</Link>}>
      Check the reporting date and try again. Your records have not changed.</SurfaceState></>;
  }

  if (!data) return <><h1>Overview</h1><SurfaceState kind="empty" title="Household setup needed">Configure one household and its owners before recording investments.</SurfaceState></>;
  if (!data.snapshot.constituents.length) return <><h1>Overview</h1><SurfaceState kind="empty" title="Start your investment overview"
    action={<Link className="primary-button" href="/investments/new">Add investment</Link>}>Create an investment, then record its contributions and valuation marks.</SurfaceState></>;
  return <Overview data={data} range={range} />;
}
