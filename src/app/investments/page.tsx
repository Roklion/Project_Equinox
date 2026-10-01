import type { Metadata } from "next";
import Link from "next/link";
import { withAnalyticsService } from "@/app/add/entry-data";
import { InvestmentRow } from "@/components/financial/investment-row";
import { SurfaceState } from "@/components/financial/primitives";
import { browseChoices, browseInvestments, reportingDate, type BrowseQuery } from "@/components/financial/investment-browse";

export const metadata: Metadata = { title: "Investments | Equinox" };
export const dynamic = "force-dynamic";

export default async function InvestmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query: BrowseQuery = Object.fromEntries(Object.entries(params).filter(([, value]) => typeof value === "string"));
  let snapshot;
  try {
    const date = reportingDate(query.date);
    snapshot = await withAnalyticsService(({ householdId, analytics }) => analytics.snapshot(householdId, date));
  } catch {
    return <><h1>Investments</h1><SurfaceState kind="error" title="Investments could not be loaded"
      action={<Link href="/investments">Try again</Link>}>Check the reporting date and try again. Your records have not changed.</SurfaceState></>;
  }
  const items = snapshot?.constituents ?? [];
  const visible = browseInvestments(items, query);
  return <><section className="page-heading"><p className="eyebrow">Your tracked investments</p><h1>Investments</h1>
    <p className="introduction">Current value, valuation freshness, and the details behind each investment.</p>
    <Link className="primary-button" href="/investments/new">Add investment</Link></section>
    <form className="investment-filters entry-form" action="/investments">
      <div className="entry-field"><label htmlFor="report-date">Reporting date</label>
        <input id="report-date" type="date" name="date" defaultValue={snapshot?.asOfDate ?? reportingDate()} required /></div>
      <div className="entry-field"><label htmlFor="lifecycle">Investments to show</label>
        <select id="lifecycle" name="lifecycle" defaultValue={query.lifecycle ?? "active"}>
          <option value="active">Active investments</option><option value="closed">Closed investments</option><option value="all">Active and closed</option>
        </select></div>
      <details className="investment-filter-details"><summary>Filter by classification and ownership</summary><div className="investment-filter-options">
      {([["assetClass", "Asset class"], ["institution", "Institution"], ["owner", "Owner"], ["group", "Custom group"]] as const).map(([key, label]) =>
        <div className="entry-field" key={key}><label htmlFor={key}>{label}</label><select id={key} name={key} defaultValue={query[key] ?? ""}>
          <option value="">All</option>{browseChoices(items, key).map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
        </select></div>)}</div></details>
      <div className="entry-actions"><button className="primary-button" type="submit">Apply filters</button><Link href="/investments">Reset filters</Link></div>
    </form>
    {!items.length ? <SurfaceState kind="empty" title="No investments available">Create an investment after household owners are configured.</SurfaceState>
      : !visible.length ? <SurfaceState kind="empty" title="No investments match these filters">Change the filters or include closed investments.</SurfaceState>
      : <div className="investment-list">{visible.map(({ investment, valuation }) => <InvestmentRow key={investment.id}
        investment={investment} valuation={valuation} asOfDate={snapshot!.asOfDate}
        classifications={[investment.classifications.assetClass?.label, investment.classifications.institution?.label].filter((value): value is string => !!value)} />)}</div>}
    <div className="entry-actions"><Link href="/investments/history">Investment history and corrections</Link></div>
  </>;
}
