import Link from "next/link";
import type { createAnalyticsService } from "@/application/analytics";
import { InvestmentRow } from "@/components/financial/investment-row";
import { AsOfDate, ChartFrame, HeadlineValue, MetricValue, PerformanceBreakdown, ReturnMetric, SurfaceState, ValuationAge, ValueBreakdown } from "@/components/financial/primitives";
import { formatDate, formatMoney } from "@/components/financial/format";
import { overviewRanges, type OverviewRange } from "@/components/financial/reporting-context";

type Analytics = ReturnType<typeof createAnalyticsService>;
export type OverviewData = {
  returns: Awaited<ReturnType<Analytics["returns"]>>;
  period: Awaited<ReturnType<Analytics["period"]>>;
  snapshot: Awaited<ReturnType<Analytics["snapshot"]>>;
  series: Awaited<ReturnType<Analytics["valueSeries"]>>;
};
export function Overview({ data, range }: { data: OverviewData; range: OverviewRange }) {
  const { returns, period, snapshot, series } = data;
  const date = snapshot.asOfDate;
  const nav = snapshot.totals.status === "available" ? { status: "available" as const, value: snapshot.totals.value.navCents } : snapshot.totals;
  const delta = period.change.status === "available" ? { status: "available" as const, value: period.change.value.navChangeCents } : period.change;
  const investments = [...snapshot.constituents].sort((a, b) => a.investment.name.localeCompare(b.investment.name) || a.investment.id.localeCompare(b.investment.id));
  return <div className="overview-page">
    <section className="page-heading"><p className="eyebrow">Your tracked investments</p><h1>Overview</h1>
      <HeadlineValue label="Aggregate investment NAV" result={nav} asOfDate={date} delta={delta} context={"since " + formatDate(period.startDate)} />
      <p className="metric-context">Investment value across all tracked investments, including retained closed history.</p>
      <div className="entry-actions"><Link className="primary-button" href="/add">Add financial entry</Link><Link href={"/updates?date=" + date}>Update valuations</Link></div>
    </section>
    <section className="overview-coverage" aria-label="Valuation coverage">
      <p><strong>{snapshot.coverage.valuedCount} of {snapshot.coverage.selectedCount} investments valued</strong>
        {snapshot.totals.status !== "available" && " · Incomplete valuation coverage"}</p>
      {snapshot.totals.status !== "available" && <p>Aggregate value is unavailable until every tracked investment has a qualifying valuation. Available investments are shown individually.</p>}
      <details className="investment-disclosure"><summary>Actual valuation dates and coverage</summary>
        <ul className="coverage-list">{investments.map(({ investment, valuation }) => <li key={investment.id}>
          <Link href={"/investments/" + encodeURIComponent(investment.id) + "?date=" + date}>{investment.name}</Link>
          {valuation.status === "available"
            ? <ValuationAge markAsOfDate={valuation.value.markAsOfDate} ageDays={valuation.value.ageDays} />
            : <span>Missing qualifying valuation</span>}
        </li>)}</ul>
      </details>
    </section>
    <form className="investment-filters entry-form" action="/">
      <div className="entry-field"><label htmlFor="overview-date">Reporting date</label><input id="overview-date" name="date" type="date" defaultValue={date} required /></div>
      <div className="entry-field"><label htmlFor="overview-range">Time range</label><select id="overview-range" name="range" defaultValue={range}>
        {Object.entries(overviewRanges).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></div><button className="primary-button" type="submit">Update overview</button>
    </form>
    <section className="metadata-section overview-period" aria-labelledby="period-heading"><h2 id="period-heading">Cash flow and investment performance</h2>
      <PerformanceBreakdown result={period.change} startDate={period.startDate} endDate={date} />
      <dl className="financial-breakdown">
        <div><dt>Period contributions · USD</dt><dd>{formatMoney(period.cashFlows.contributionsCents)}</dd></div>
        <div><dt>Period distributions · USD</dt><dd>{formatMoney(period.cashFlows.distributionsCents)}</dd></div>
        <div><dt>Recorded net external cash flow · USD</dt><dd>{formatMoney(period.cashFlows.netExternalCashFlowCents)}</dd></div>
      </dl>
      {period.change.status !== "available" && <p className="metric-context">Beginning or ending valuation coverage is incomplete. Recorded cash flows remain available; period performance cannot be calculated.</p>}
      <p className="metric-context">Transfers between tracked investments cancel at this household boundary. Valuation observations are not cash flows.</p>
    </section>
    <ChartFrame title="Value history" summary={<><MetricValue result={nav} format={formatMoney} /><AsOfDate date={date} /></>}>
      <p className="metric-context">Recorded household snapshots for the selected range. Interactive trend inspection will integrate with the dedicated chart update.</p>
      {!series.points.length ? <SurfaceState kind="empty" title="No valuation observations in this range">Try a wider range or record a valuation.</SurfaceState>
        : <><p className="metric-context">{series.points.length === 1 ? "One recorded observation; there is no trend to connect yet." : series.points.length + " recorded observations. Values are not interpolated."}</p>
          <details className="investment-disclosure"><summary>Recorded date and value summaries</summary><dl className="financial-breakdown">
            {series.points.map((point) => <div key={point.asOfDate}><dt><time dateTime={point.asOfDate}>{formatDate(point.asOfDate)}</time>
              <span className="metric-context"> · {point.coverage.valuedCount}/{point.coverage.selectedCount} valued</span></dt><dd>
              <MetricValue result={point.totals.status === "available" ? { status: "available", value: point.totals.value.navCents } : point.totals} format={formatMoney} />
            </dd></div>)}</dl></details></>}
      <Link href="/investments/history">Open valuation history and corrections</Link>
    </ChartFrame>
    <ChartFrame title="Investment composition" summary={<AsOfDate date={date} />}>
      <p className="metric-context">Current NAV by asset class. Interactive composition over time will integrate with the dedicated chart update.</p>
      <dl className="financial-breakdown">{snapshot.breakdown?.map((bucket) => <div key={bucket.key}><dt>{bucket.label} · USD
        <span className="metric-context"> · {bucket.coverage.valuedCount}/{bucket.coverage.selectedCount} valued</span></dt><dd>
        <MetricValue result={bucket.totals.status === "available" ? { status: "available", value: bucket.totals.value.navCents } : bucket.totals} format={formatMoney} />
      </dd></div>)}</dl>
      {snapshot.totals.status !== "available" && <p className="metric-context">Available categories are not a complete portfolio total. No allocation percentages are shown.</p>}
    </ChartFrame>
    <div className="overview-supporting">
      <section className="metadata-section"><h2>Value and linked debt</h2><ValueBreakdown result={snapshot.totals} asOfDate={date} /></section>
      <section className="metadata-section"><h2>Capital and returns since inception</h2>
        <dl className="financial-breakdown"><div><dt>Contributions · USD</dt><dd>{formatMoney(returns.cashFlows.contributionsCents)}</dd></div>
          <div><dt>Distributions · USD</dt><dd>{formatMoney(returns.cashFlows.distributionsCents)}</dd></div>
          <div><dt>Net invested capital · USD</dt><dd>{formatMoney(returns.netInvestedCapitalCents)}</dd></div>
          <div><dt>Profit / loss · USD</dt><dd><MetricValue result={returns.pnl} format={formatMoney} /></dd></div>
        </dl><ReturnMetric kind="MOIC" result={returns.moic} asOfDate={date} /><ReturnMetric kind="XIRR" result={returns.xirr} asOfDate={date} />
      </section>
    </div>
    <section className="metadata-section overview-investments" aria-labelledby="underlying-heading"><h2 id="underlying-heading">Underlying investments</h2>
      <p className="metric-context">A preview of your tracked investments. Browse the full list for ownership, classifications, and lifecycle filters.</p>
      <div className="investment-list">{investments.slice(0, 4).map((item) => <InvestmentRow key={item.investment.id} {...item} asOfDate={date} />)}</div>
      <div className="entry-actions"><Link href={"/investments?date=" + date + "&lifecycle=all"}>View all investments ({investments.length})</Link></div>
    </section>
  </div>;
}
