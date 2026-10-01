import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkflowError } from "@/application/errors";
import { withEntryService } from "@/app/add/entry-data";

export const dynamic = "force-dynamic";

export default async function InvestmentDetailPage({ params }: { params: Promise<{ investmentId: string }> }) {
  const { investmentId } = await params;
  let context;
  try {
    context = await withEntryService(async ({ householdId, service }) => ({
      investment: await service.getInvestmentMetadata(householdId, investmentId), choices: await service.getInvestmentChoices(householdId),
    }));
  } catch (error) {
    if (error instanceof WorkflowError && error.code === "investment_unavailable") notFound();
    return <><h1>Investment detail</h1><p role="alert">Investment details are unavailable right now.</p><Link href={`/investments/${encodeURIComponent(investmentId)}`}>Try again</Link></>;
  }
  if (!context) notFound();
  const { investment, choices } = context;
  const label = (options: Array<{ id: string; label: string }>, id?: string | null) => options.find((item) => item.id === id)?.label ?? "Not classified";
  return <><div className="entry-topline"><Link href="/investments">← Investments</Link></div>
    <section className="page-heading"><p className="eyebrow">Investment detail</p><h1>{investment.name}</h1>
      <p>{investment.status === "closed" ? `Closed on ${investment.closedOn}` : "Active investment"}</p>
      <Link className="primary-button" href={`/investments/${investment.id}/manage`}>Manage investment</Link></section>
    <section className="entry-panel"><h2>Investment metadata</h2><dl className="investment-metadata">
      <div><dt>Owners</dt><dd>{choices.owners.filter((owner) => investment.ownerIds.includes(owner.id)).map((owner) => owner.label).join(", ")}</dd></div>
      <div><dt>Asset class</dt><dd>{label(choices.assetClasses, investment.assetClassId)}</dd></div>
      <div><dt>Account type</dt><dd>{label(choices.accountTypes, investment.accountTypeId)}</dd></div>
      <div><dt>Tax status</dt><dd>{label(choices.taxStatuses, investment.taxStatusId)}</dd></div>
      <div><dt>Liquidity</dt><dd>{label(choices.liquidities, investment.liquidityId)}</dd></div>
      <div><dt>Institution</dt><dd>{label(choices.institutions, investment.institutionId)}</dd></div>
      <div><dt>Custom groups</dt><dd>{choices.customGroups.filter((group) => investment.groupIds.includes(group.id)).map((group) => group.label).join(", ") || "None"}</dd></div>
    </dl></section>
    <div className="entry-actions"><Link href={`/investments/history?investmentId=${encodeURIComponent(investment.id)}`}>View history and corrections</Link></div>
  </>;
}
