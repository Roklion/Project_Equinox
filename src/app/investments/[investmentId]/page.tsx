import Link from "next/link";
import { notFound } from "next/navigation";
import { withAnalyticsService } from "@/app/add/entry-data";
import { reportingDate } from "@/components/financial/investment-browse";
import { AsOfDate, ChartFrame, HeadlineValue, MetadataRows, MetricValue, PerformanceBreakdown, ReturnMetric, SurfaceState, ValuationAge, ValueBreakdown } from "@/components/financial/primitives";
import { formatDate, formatMoney } from "@/components/financial/format";

export const dynamic = "force-dynamic";

export default async function InvestmentDetailPage({ params, searchParams }: {
  params: Promise<{ investmentId: string }>; searchParams: Promise<{ date?: string; start?: string }>;
}) {
  const { investmentId } = await params;
  const query = await searchParams;
  let context;
  try {
    const date = reportingDate(query.date);
    const start = query.start || date.slice(0, 4) + "-01-01";
    context = await withAnalyticsService(async ({ householdId, analytics }) => {
      const scope = { investmentIds: [investmentId] };
      const returns = await analytics.returns(householdId, date, scope);
      if (!returns.snapshot.constituents.length) return null;
      const period = await analytics.period(householdId, start, date, scope);
      return { returns, period };
    });
  } catch {
    return <><h1>Investment detail</h1><SurfaceState kind="error" title="Investment could not be loaded"
      action={<Link href={"/investments/" + encodeURIComponent(investmentId)}>Try again</Link>}>Check the reporting dates and try again.</SurfaceState></>;
  }
  if (!context) notFound();
  const { returns, period } = context;
  const { investment, valuation } = returns.snapshot.constituents[0];
  const date = returns.asOfDate;
  const nav = valuation.status === "available" ? { status: "available" as const, value: valuation.value.navCents } : valuation;
  const delta = period.change.status === "available" ? { status: "available" as const, value: period.change.value.navChangeCents } : period.change;
  const historyHref = "/investments/history?investmentId=" + encodeURIComponent(investment.id);
  return <><div className="entry-topline"><Link href={"/investments?date=" + date + (investment.status === "closed" ? "&lifecycle=all" : "")}>← Investments</Link></div>
    <section className="page-heading"><p className="eyebrow">Investment detail</p><h1>{investment.name}</h1>
      <p>{investment.status === "closed" ? "Closed on " + formatDate(investment.closedOn!) : "Active investment"}</p>
      <HeadlineValue label="Net investment value" result={nav} asOfDate={date} delta={delta} context={"since " + formatDate(period.startDate)} />
      {valuation.status === "available" && <ValuationAge markAsOfDate={valuation.value.markAsOfDate} ageDays={valuation.value.ageDays} />}
      <div className="entry-actions">{investment.status === "active"
        ? <Link className="primary-button" href="/add">Add financial action</Link>
        : <p className="metric-context">This investment is closed. Historical corrections remain available.</p>}
        <Link href={"/investments/" + investment.id + "/manage"}>Manage investment</Link></div></section>
    <form className="investment-filters entry-form" action={"/investments/" + investment.id}>
      <div className="entry-field"><label htmlFor="detail-date">Reporting date</label><input id="detail-date" type="date" name="date" defaultValue={date} required /></div>
      <div className="entry-field"><label htmlFor="period-start">Period start</label><input id="period-start" type="date" name="start" defaultValue={period.startDate} max={date} required /></div>
      <button className="primary-button" type="submit">Update period</button>
    </form>
    <div className="investment-detail-layout"><div>
      <ChartFrame title="Value history" summary={<><MetricValue result={nav} format={formatMoney} /><AsOfDate date={date} /></>}>
        <p className="metric-context">Interactive value charts are coming with the value-trend update. Dated valuation observations remain available in history.</p>
        <Link href={historyHref}>View history and corrections</Link>
      </ChartFrame>
      <section className="metadata-section"><h2>Value and linked debt</h2><ValueBreakdown result={returns.snapshot.totals} asOfDate={date} /></section>
      <section className="metadata-section"><h2>Period performance</h2>
        <PerformanceBreakdown result={period.change} startDate={period.startDate} endDate={date} />
        <MetadataRows rows={[{ label: "Period contributions", value: formatMoney(period.cashFlows.contributionsCents) },
          { label: "Period distributions", value: formatMoney(period.cashFlows.distributionsCents) }]} />
        <p className="metric-context">Transfers crossing this investment&apos;s boundary count as cash flows. Valuations are observations, not cash flows.</p>
      </section>
      <section className="metadata-section"><h2>Since inception</h2><dl className="financial-breakdown">
        <div><dt>Contributions · USD</dt><dd>{formatMoney(returns.cashFlows.contributionsCents)}</dd></div>
        <div><dt>Distributions · USD</dt><dd>{formatMoney(returns.cashFlows.distributionsCents)}</dd></div>
        <div><dt>Profit / loss · USD</dt><dd><MetricValue result={returns.pnl} format={formatMoney} /></dd></div></dl>
        <ReturnMetric kind="MOIC" result={returns.moic} asOfDate={date} /><ReturnMetric kind="XIRR" result={returns.xirr} asOfDate={date} />
      </section></div>
      <details className="metadata-section investment-disclosure"><summary>Ownership and classification</summary><MetadataRows rows={[
        { label: "Owners", value: investment.owners.map((item) => item.label).join(", ") },
        ...Object.entries(investment.classifications).map(([key, item]) => ({ label: ({ assetClass: "Asset class", accountType: "Account type", taxStatus: "Tax status", liquidity: "Liquidity", institution: "Institution" } as Record<string, string>)[key], value: item?.label ?? null })),
        { label: "Custom groups", value: investment.customGroups.map((item) => item.label).join(", ") || "None" },
      ]} /></details>
    </div>
    <section className="metadata-section"><h2>Actions and valuations</h2>
      <p>Review the complete dated history and correct or delete entries through the existing history workflow.</p>
      <Link className="primary-button" href={historyHref}>Open action and valuation history</Link>
    </section>
  </>;
}
