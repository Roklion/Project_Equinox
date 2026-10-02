import Link from "next/link";
import type { Snapshot } from "@/domain/analytics/snapshot";
import { InvestmentRow } from "@/components/financial/investment-row";
import { AsOfDate, SurfaceState } from "@/components/financial/primitives";
import { maintenanceBand, routineInvestments } from "./maintenance";

export function UpdateCenter({ snapshot }: { snapshot: Snapshot }) {
  const date = snapshot.asOfDate;
  const routine = routineInvestments(snapshot.constituents, date);
  const attention = routine.filter((item) => maintenanceBand(item).key !== "recent");
  const batchHref = "/valuations/batch?" + new URLSearchParams({ date, from: "updates" });
  return <>
    <section className="page-heading"><p className="eyebrow">Keep your records current</p><h1>Update Center</h1>
      <p className="introduction">{attention.length} {attention.length === 1 ? "investment needs" : "investments need"} valuation attention.</p>
      <AsOfDate date={date} />
    </section>
    <form className="investment-filters entry-form" action="/updates">
      <div className="entry-field"><label htmlFor="maintenance-date">Reporting date</label>
        <input id="maintenance-date" type="date" name="date" defaultValue={date} required /></div>
      <button className="primary-button" type="submit">Update reporting date</button>
    </form>
    <div className="action-grid">
      <Link className="action-choice" href={batchHref}><strong>Batch valuation update</strong><span>Record or correct marks for several investments.</span><span aria-hidden="true">↗</span></Link>
      <Link className="action-choice" href="/investments/history"><strong>History and corrections</strong><span>Review, correct, or delete existing entries.</span><span aria-hidden="true">↗</span></Link>
    </div>
    <p className="metric-context">Valuation age is measured against the reporting date: recent up to 30 days, update due at 31–90 days, stale after 90 days. These reminders do not change financial values.</p>
    {!snapshot.constituents.length
      ? <SurfaceState kind="empty" title="Start with an investment" action={<Link href="/investments/new">Add investment</Link>}>Create an investment, then record its first valuation.</SurfaceState>
      : !routine.length ? <SurfaceState kind="empty" title="No recurring updates needed">All tracked investments are closed as of this date. Their history remains available below.</SurfaceState>
      : <section className="metadata-section" aria-labelledby="maintenance-heading"><h2 id="maintenance-heading">Valuation maintenance</h2>
        {!attention.length && <p role="status">All eligible investments have recent valuations.</p>}
        <div className="investment-list">{routine.map((item) => <section className="maintenance-item" key={item.investment.id} aria-label={item.investment.name}>
          <p className="maintenance-band">{maintenanceBand(item).label}</p>
          <InvestmentRow {...item} asOfDate={date} />
          <div className="entry-actions">
            <Link className="primary-button" href={"/add/valuation?" + new URLSearchParams({ investmentId: item.investment.id, date, from: "updates" })}>Update valuation</Link>
            <Link href={"/investments/history?investmentId=" + encodeURIComponent(item.investment.id)}>History and corrections</Link>
            <Link href={"/investments/" + encodeURIComponent(item.investment.id) + "/manage"}>Manage investment</Link>
          </div>
        </section>)}</div>
      </section>}
    {snapshot.constituents.some(({ investment }) => investment.status === "closed" && investment.closedOn! <= date) &&
      <details className="metadata-section investment-disclosure"><summary>Closed investments · retained history</summary>
        <p className="metric-context">Closed investments do not receive recurring reminders after closure.</p>
        {snapshot.constituents.filter(({ investment }) => investment.status === "closed" && investment.closedOn! <= date)
          .map((item) => <section className="maintenance-item" key={item.investment.id}><InvestmentRow {...item} asOfDate={date} />
            <div className="entry-actions"><Link href={"/investments/history?investmentId=" + encodeURIComponent(item.investment.id)}>History and corrections</Link>
              <Link href={"/investments/" + encodeURIComponent(item.investment.id) + "/manage"}>Manage investment</Link></div></section>)}
      </details>}
    <div className="entry-actions"><Link href="/add">Add financial entry</Link><Link href={"/investments?date=" + date}>All investments and management</Link></div>
  </>;
}
