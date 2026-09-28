import Link from "next/link";
import { notFound } from "next/navigation";
import { EntryForm } from "@/components/entry/entry-form";

const labels = {
  contribution: "Contribution",
  withdrawal: "Withdrawal / Distribution",
  transfer: "Transfer",
  valuation: "Valuation Mark",
} as const;

export default async function EntryPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!(kind in labels)) notFound();
  const entryKind = kind as keyof typeof labels;
  return (
    <>
      <div className="entry-topline"><Link href="/add">← All actions</Link></div>
      <section className="page-heading entry-heading">
        <p className="eyebrow">New entry</p>
        <h1>{labels[entryKind]}</h1>
      </section>
      <EntryForm kind={entryKind} />
    </>
  );
}
