import Link from "next/link";
import { InvestmentForm } from "@/components/investment/investment-form";

export default async function ManageInvestmentPage({ params }: { params: Promise<{ investmentId: string }> }) {
  const { investmentId } = await params;
  return <><div className="entry-topline"><Link href={`/investments/${investmentId}`}>← Investment detail</Link></div>
    <section className="page-heading entry-heading"><p className="eyebrow">Investment management</p><h1>Manage investment</h1>
      <p className="introduction">Maintain metadata or close an investment while preserving its financial history.</p></section>
    <InvestmentForm key={investmentId} investmentId={investmentId} /></>;
}
