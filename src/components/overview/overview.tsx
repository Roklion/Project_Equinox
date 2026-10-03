import Link from "next/link";
import type { createAnalyticsService } from "@/application/analytics";
import { ValueTrendChart, CompositionChart } from "@/components/charts/history-charts";
import { InvestmentRow } from "@/components/financial/investment-row";
import { HeadlineValue, MetricValue, PerformanceBreakdown, ReturnMetric, ValuationAge, ValueBreakdown } from "@/components/financial/primitives";
import { formatDate, formatMoney } from "@/components/financial/format";
import { overviewRanges, type OverviewRange } from "@/components/financial/reporting-context";
import { SurfaceState } from "@/components/financial/primitives";
import { ScopeControls } from "./scope-controls";
import { scopeLabel, type ScopeSelection, type ScopeChoices } from "./reporting-scope";

type Analytics = ReturnType<typeof createAnalyticsService>;
export type OverviewData = {
  returns: Awaited<ReturnType<Analytics["returns"]>>;
  period: Awaited<ReturnType<Analytics["period"]>>;
  snapshot: Awaited<ReturnType<Analytics["snapshot"]>>;
  history: Awaited<ReturnType<Analytics["historicalSeries"]>>;
};
export function Overview({ data, range, selection = {}, choices }: {
  data: OverviewData; range: OverviewRange; selection?: ScopeSelection; choices?: ScopeChoices;
}) {
  const { returns, period, snapshot, history } = data;
  const date = snapshot.asOfDate;
  const nav = snapshot.totals.status === "available" ? { status: "available" as const, value: snapshot.totals.value.navCents } : snapshot.totals;
  const delta = period.change.status === "available" ? { status: "available" as const, value: period.change.value.navChangeCents } : period.change;
  const investments = [...snapshot.constituents].sort((a, b) => a.investment.name.localeCompare(b.investment.name) || a.investment.id.localeCompare(b.investment.id));
  const scoped = Object.keys(selection).length > 0;
  const label = choices ? scopeLabel(selection, choices) : "All tracked investments";
  const resetHref = "/?" + new URLSearchParams({ date, range });
  return <div className="overview-page">
    <section className="page-heading"><p className="eyebrow">Your tracked investments</p><h1>Overview</h1>
      <p className="overview-scope-label"><strong>Reporting scope</strong> · {label}</p>
      <HeadlineValue label="Aggregate investment NAV" result={nav} asOfDate={date} delta={delta} context={"since " + formatDate(period.startDate)} />
      <p className="metric-context">Investment value across {scoped ? "the selected scope" : "all tracked investments"}, including retained closed history.</p>
      {scoped && <Link href={resetHref}>Reset to All tracked investments</Link>}
      <div className="entry-actions"><Link className="primary-button" href="/add">Add financial entry</Link><Link href={"/updates?date=" + date}>Update valuations</Link></div>
    </section>
    <section className="overview-coverage" aria-label="Valuation coverage">
      <p><strong>{snapshot.coverage.valuedCount} of {snapshot.coverage.selectedCount} investments valued</strong>
        {snapshot.totals.status !== "available" && " · Incomplete valuation coverage"}</p>
      {snapshot.totals.status !== "available" && <p>Aggregate value is unavailable until every investment in scope has a qualifying valuation. Available investments are shown individually.</p>}
      <details className="investment-disclosure"><summary>Actual valuation dates and coverage</summary>
        <ul className="coverage-list">{investments.map(({ investment, valuation }) => <li key={investment.id}>
          <Link href={"/investments/" + encodeURIComponent(investment.id) + "?date=" + date}>{investment.name}</Link>
          {valuation.status === "available"
            ? <ValuationAge markAsOfDate={valuation.value.markAsOfDate} ageDays={valuation.value.ageDays} />
            : <span>Missing qualifying valuation</span>}
        </li>)}</ul>
      </details>
    </section>
    <form className="investment-filters entry-form" action="/" key={date + range + JSON.stringify(selection)}>
      <div className="entry-field"><label htmlFor="overview-date">Reporting date</label><input id="overview-date" name="date" type="date" defaultValue={date} required /></div>
      <div className="entry-field"><label htmlFor="overview-range">Performance period</label><select id="overview-range" name="range" defaultValue={range}>
        {Object.entries(overviewRanges).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></div>
      {choices && <ScopeControls selection={selection} choices={choices} resetHref={resetHref} />}
      <button className="primary-button" type="submit">Update overview</button>
    </form>
    {!investments.length && <SurfaceState kind="empty" title={scoped ? "No investments in this reporting scope" : "Start your investment overview"}
      action={scoped ? <Link href={resetHref}>Reset to All tracked investments</Link>
        : <Link className="primary-button" href="/investments/new">Add investment</Link>}>
      {scoped ? "Change or clear scope filters. Empty scope totals are zero; returns and historical observations are unavailable."
        : "Create an investment, then record its contributions and valuation marks."}
    </SurfaceState>}
    <p className="metric-context">Performance period sets the summary; each chart has its own history range.</p>
    <section className="metadata-section overview-period" aria-labelledby="period-heading"><h2 id="period-heading">Cash flow and investment performance</h2>
      <PerformanceBreakdown result={period.change} startDate={period.startDate} endDate={date} />
      <dl className="financial-breakdown">
        <div><dt>Period contributions · USD</dt><dd>{formatMoney(period.cashFlows.contributionsCents)}</dd></div>
        <div><dt>Period distributions · USD</dt><dd>{formatMoney(period.cashFlows.distributionsCents)}</dd></div>
        <div><dt>Recorded net external cash flow · USD</dt><dd>{formatMoney(period.cashFlows.netExternalCashFlowCents)}</dd></div>
      </dl>
      {period.change.status !== "available" && <p className="metric-context">Beginning or ending valuation coverage is incomplete. Recorded cash flows remain available; period performance cannot be calculated.</p>}
      <p className="metric-context">Transfers with both investments in scope are internal. A transfer crossing this scope boundary is an inflow or outflow. Valuation observations are not cash flows.</p>
    </section>

    <ValueTrendChart series={history.valueSeries} allowMeasureSwitch />
    <CompositionChart seriesByGrouping={history.compositionSeries} />
    <details className="metadata-section investment-disclosure"><summary>Current composition by asset class</summary>
      <p className="metric-context">Reporting date {formatDate(date)} · Current classification associations apply to all history.</p>
      <dl className="financial-breakdown">{snapshot.breakdown?.map((bucket) => <div key={bucket.key}><dt>{bucket.label} · USD
        <span className="metric-context"> · {bucket.coverage.valuedCount}/{bucket.coverage.selectedCount} valued</span></dt><dd>
        <MetricValue result={bucket.totals.status === "available" ? { status: "available", value: bucket.totals.value.navCents } : bucket.totals} format={formatMoney} />
      </dd></div>)}</dl>
      {snapshot.totals.status !== "available" && <p className="metric-context">Available categories are not a complete portfolio total. No allocation percentages are shown.</p>}
    </details>
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
      <p className="metric-context">{investments.length} investments in this reporting scope. Detail links retain the reporting date.</p>
      <div className="investment-list">{investments.slice(0, 4).map((item) => <InvestmentRow key={item.investment.id} {...item} asOfDate={date} />)}</div>
      {investments.length > 4 && <details className="investment-disclosure"><summary>Show remaining investments in scope ({investments.length - 4})</summary>
        <div className="investment-list">{investments.slice(4).map((item) => <InvestmentRow key={item.investment.id} {...item} asOfDate={date} />)}</div>
      </details>}
      <div className="entry-actions"><Link href={"/investments?date=" + date + "&lifecycle=all"}>Browse all tracked investments</Link></div>
    </section>
  </div>;
}
