import Link from "next/link";
import { InvestmentForm } from "@/components/investment/investment-form";

export default function NewInvestmentPage() {
  return <><div className="entry-topline"><Link href="/investments">← Investments</Link></div>
    <section className="page-heading entry-heading"><p className="eyebrow">Investment management</p><h1>Add investment</h1>
      <p className="introduction">Create an investment with its owners and classifications. Contributions and valuations are separate actions.</p></section>
    <InvestmentForm /></>;
}
