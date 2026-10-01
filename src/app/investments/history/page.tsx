import Link from "next/link";
import { HistoryPanel } from "@/components/history/history-panel";

export default async function InvestmentHistoryPage({ searchParams }: {
  searchParams: Promise<{ investmentId?: string | string[] }>;
}) {
  const query = await searchParams;
  const investmentId = typeof query.investmentId === "string" ? query.investmentId : undefined;
  return <><div className="entry-topline"><Link href="/">← Overview</Link></div>
    <section className="page-heading"><p className="eyebrow">Investment activity</p><h1>History and corrections</h1>
      <p className="introduction">Review actions and valuation marks, including history for closed investments.</p></section>
    <HistoryPanel key={investmentId ?? ""} initialInvestmentId={investmentId} /></>;
}
