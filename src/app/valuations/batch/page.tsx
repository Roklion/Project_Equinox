import Link from "next/link";
import { optionalDate, singleParam, type PageQuery } from "@/components/financial/reporting-context";
import { BatchForm } from "@/components/valuation/batch-form";

export default async function BatchValuationPage({ searchParams }: { searchParams?: Promise<PageQuery> }) {
  const query = await searchParams ?? {};
  let initialDate: string | undefined;
  try { initialDate = optionalDate(query.date); } catch { /* Fall back to editable local today. */ }
  return <><div className="entry-topline"><Link href="/add">← All actions</Link></div>
    <section className="page-heading"><p className="eyebrow">Periodic update</p><h1>Batch valuation marks</h1>
      <p className="introduction">Update several investments for one as-of date.</p></section><BatchForm key={initialDate} initialDate={initialDate} returnToUpdates={singleParam(query.from) === "updates"} /></>;
}
