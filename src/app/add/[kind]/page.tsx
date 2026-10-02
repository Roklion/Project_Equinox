import Link from "next/link";
import { notFound } from "next/navigation";
import { optionalDate, singleParam, type PageQuery } from "@/components/financial/reporting-context";
import { EntryForm } from "@/components/entry/entry-form";

const labels = {
  contribution: "Contribution",
  withdrawal: "Withdrawal / Distribution",
  transfer: "Transfer",
  valuation: "Valuation Mark",
} as const;

export default async function EntryPage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams?: Promise<PageQuery> }) {
  const { kind } = await params;
  if (!Object.hasOwn(labels, kind)) notFound();
  const entryKind = kind as keyof typeof labels;
  const query = await searchParams ?? {};
  let initialDate: string | undefined;
  try { initialDate = optionalDate(query.date); } catch { /* Invalid launch dates fall back to editable local today. */ }
  const returnToUpdates = singleParam(query.from) === "updates";
  return (
    <>
      <div className="entry-topline"><Link href="/add">← All actions</Link></div>
      <section className="page-heading entry-heading">
        <p className="eyebrow">New entry</p>
        <h1>{labels[entryKind]}</h1>
      </section>
      <EntryForm key={entryKind + ":" + (initialDate ?? "") + ":" + (singleParam(query.investmentId) ?? "")} kind={entryKind} initialDate={initialDate}
        initialInvestmentId={singleParam(query.investmentId)} returnToUpdates={returnToUpdates} />
    </>
  );
}
