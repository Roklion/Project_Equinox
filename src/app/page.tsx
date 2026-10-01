import Link from "next/link";
import { loadHistoricalCharts } from "./chart-data";

export const dynamic = "force-dynamic";
export default async function HomePage() {
  const charts = await loadHistoricalCharts();
  return (
    <>
      <section className="page-heading" aria-labelledby="overview-title">
        <p className="eyebrow">Your investment overview</p>
        <h1 id="overview-title">Keep your investment story current.</h1>
        <p className="introduction">
          Record cash flows, transfers, and valuation marks as they happen.
        </p>
        <div className="entry-actions"><Link href="/valuations/batch">Batch valuation update</Link>
          <Link href="/investments/history">Investment history</Link></div>
      </section>
      {charts}
    </>
  );
}
