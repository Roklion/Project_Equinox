import Link from "next/link";
import { notFound } from "next/navigation";
import type { PageQuery } from "@/components/financial/reporting-context";
import { entryLaunchContext } from "@/components/entry/launch-context";
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
  const context = entryLaunchContext(query);
  return (
    <>
      <div className="entry-topline"><Link href={context.launcherHref}>← All actions</Link></div>
      <section className="page-heading entry-heading">
        <p className="eyebrow">New entry</p>
        <h1>{labels[entryKind]}</h1>
      </section>
      <EntryForm key={entryKind + context.suffix} kind={entryKind} initialDate={context.date}
        initialInvestmentId={context.investmentId} returnToUpdates={context.returnToUpdates}
        returnToInvestment={context.returnHref} launcherHref={context.launcherHref} />
    </>
  );
}
