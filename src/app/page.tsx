import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <div className="page-actions">
        <form action="/api/auth/logout" method="post">
          <button className="text-button" type="submit">Sign out</button>
        </form>
      </div>
      <section className="page-heading" aria-labelledby="overview-title">
        <p className="eyebrow">Your investment overview</p>
        <h1 id="overview-title">Keep your investment story current.</h1>
        <p className="introduction">
          Record cash flows, transfers, and valuation marks as they happen.
        </p>
        <Link className="primary-button add-launcher" href="/add">Add entry <span aria-hidden="true">＋</span></Link>
        <div className="entry-actions"><Link href="/valuations/batch">Batch valuation update</Link>
          <Link href="/investments/history">Investment history</Link></div>
      </section>
      <section className="empty-state" aria-labelledby="empty-title">
        <div className="empty-symbol" aria-hidden="true">↗</div>
        <p className="eyebrow">Coming into view</p>
        <h2 id="empty-title">Your overview is taking shape.</h2>
        <p>
          Record entries, update several valuations, and review the history of each investment.
          Value trends will appear here in a later update.
        </p>
      </section>
    </>
  );
}
