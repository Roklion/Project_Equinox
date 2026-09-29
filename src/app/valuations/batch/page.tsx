import Link from "next/link";
import { BatchForm } from "@/components/valuation/batch-form";

export default function BatchValuationPage() {
  return <><div className="entry-topline"><Link href="/add">← All actions</Link></div>
    <section className="page-heading"><p className="eyebrow">Periodic update</p><h1>Batch valuation marks</h1>
      <p className="introduction">Update several investments for one as-of date.</p></section><BatchForm /></>;
}
