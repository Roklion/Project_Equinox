import Link from "next/link";
import { withEntryService } from "@/app/add/entry-data";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  let investments;
  try { investments = await withEntryService(({ householdId, service }) => service.getInvestments(householdId)); }
  catch { return <><h1>Investments</h1><p role="alert">Investments are unavailable right now.</p><Link href="/investments">Try again</Link></>; }
  return <><div className="entry-topline"><Link href="/">← Overview</Link></div>
    <section className="page-heading"><p className="eyebrow">Your tracked investments</p><h1>Investments</h1>
      <p className="introduction">Browse active and closed investments and maintain their metadata.</p>
      <Link className="primary-button" href="/investments/new">Add investment</Link></section>
    {!investments?.length ? <p>No investments available. Create an investment after household owners are configured.</p>
      : <ul className="investment-management-list">{investments.map((investment) => <li key={investment.id}>
        <Link href={`/investments/${investment.id}`}>{investment.name}</Link>
        <span>{investment.status === "closed" ? `Closed on ${investment.closedOn}` : "Active investment"}</span>
      </li>)}</ul>}
    <div className="entry-actions"><Link href="/investments/history">Investment history and corrections</Link></div>
  </>;
}
