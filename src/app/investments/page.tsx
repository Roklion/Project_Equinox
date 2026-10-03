import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { withAnalyticsService } from "@/app/add/entry-data";
import { ChartReportingDate } from "@/components/charts/reporting-date";
import { InvestmentRow } from "@/components/financial/investment-row";
import { SurfaceState } from "@/components/financial/primitives";
import { browseInvestments, reportingDate, type BrowseQuery } from "@/components/financial/investment-browse";

import { InvestmentBrowseFilters } from "@/components/financial/investment-browse-filters";

export const metadata: Metadata = { title: "Investments | Equinox" };
export const dynamic = "force-dynamic";

export default async function InvestmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query: BrowseQuery = Object.fromEntries(Object.entries(params).filter(([, value]) => typeof value === "string"));
  const browserDate = query.date ? undefined : (await cookies()).get("equinox-chart-date")?.value;
  const dateSync = query.date ? null : <ChartReportingDate serverDate={browserDate} />;
  if (!query.date && !browserDate) return <>{dateSync}<h1>Investments</h1>
    <SurfaceState kind="loading" title="Loading investments">Preparing your local reporting date.</SurfaceState></>;
  let snapshot;
  try {
    const date = reportingDate(query.date ?? browserDate);
    snapshot = await withAnalyticsService(({ householdId, analytics }) => analytics.snapshot(householdId, date));
  } catch {
    return <><h1>Investments</h1><SurfaceState kind="error" title="Investments could not be loaded"
      action={<Link href="/investments">Try again</Link>}>Check the reporting date and try again. Your records have not changed.</SurfaceState></>;
  }
  const items = snapshot?.constituents ?? [];
  const visible = browseInvestments(items, query);
  return <>{dateSync}<section className="page-heading"><p className="eyebrow">Your tracked investments</p><h1>Investments</h1>
    <p className="introduction">Current value, valuation freshness, and the details behind each investment.</p>
    <Link className="primary-button" href="/investments/new">Add investment</Link></section>
    <InvestmentBrowseFilters items={items} query={query} date={snapshot?.asOfDate ?? reportingDate()} />
    {!items.length ? <SurfaceState kind="empty" title="No investments available">Create an investment after household owners are configured.</SurfaceState>
      : !visible.length ? <SurfaceState kind="empty" title="No investments match these filters">Change the filters or include closed investments.</SurfaceState>
      : <div className="investment-list">{visible.map(({ investment, valuation }) => <InvestmentRow key={investment.id}
        investment={investment} valuation={valuation} asOfDate={snapshot!.asOfDate}
        classifications={[investment.classifications.assetClass?.label, investment.classifications.institution?.label].filter((value): value is string => !!value)} />)}</div>}
    <div className="entry-actions"><Link href="/investments/history">Investment history and corrections</Link></div>
  </>;
}
