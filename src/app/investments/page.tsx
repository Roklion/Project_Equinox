import type { Metadata } from "next";
import Link from "next/link";
import { withEntryService } from "@/app/add/entry-data";
import { InvestmentRow } from "@/components/financial/investment-row";
import { SurfaceState } from "@/components/financial/primitives";

export const metadata: Metadata = { title: "Investments | Equinox" };
export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  let investments;
  try {
    investments = await withEntryService(({ householdId, service }) => service.getInvestments(householdId));
  } catch {
    return <><h1>Investments</h1><SurfaceState kind="error" title="Investments could not be loaded"
      action={<Link href="/investments">Try again</Link>}>Please try again. Your records have not changed.</SurfaceState></>;
  }
  return <><section className="page-heading"><p className="eyebrow">Your tracked investments</p><h1>Investments</h1>
    <p className="introduction">Browse active and closed investments and maintain their metadata.</p>
    <Link className="primary-button" href="/investments/new">Add investment</Link></section>
    {!investments?.length ? <SurfaceState kind="empty" title="No investments available">
      Create an investment after household owners are configured. Financial summaries will arrive in later updates.</SurfaceState>
      : <div className="investment-list">{investments.map((investment) => <InvestmentRow key={investment.id}
        investment={investment} classifications={[investment.assetClass, investment.accountType].filter((label): label is string => label !== null)} />)}</div>}
    <div className="entry-actions"><Link href="/investments/history">Investment history and corrections</Link></div>
  </>;
}
