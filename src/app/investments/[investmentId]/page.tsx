import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkflowError } from "@/application/errors";
import { withEntryService } from "@/app/add/entry-data";
import { MetadataRows, SurfaceState } from "@/components/financial/primitives";

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
    return <><h1>Investment detail</h1><SurfaceState kind="error" title="Investment could not be loaded"
      action={<Link href={`/investments/${encodeURIComponent(investmentId)}`}>Try again</Link>}>Please try again.</SurfaceState></>;
  }
  if (!context) notFound();
  const { investment, choices } = context;
  const label = (options: Array<{ id: string; label: string }>, id?: string | null) => options.find((item) => item.id === id)?.label ?? null;
  return <><div className="entry-topline"><Link href="/investments">← Investments</Link></div>
    <section className="page-heading"><p className="eyebrow">Investment detail</p><h1>{investment.name}</h1>
      <p>{investment.status === "closed" ? `Closed on ${investment.closedOn}` : "Active investment"}</p>
      <Link className="primary-button" href={`/investments/${investment.id}/manage`}>Manage investment</Link></section>
    <SurfaceState kind="empty" title="Your investment detail is taking shape">
      Financial summaries and charts will arrive in later updates.</SurfaceState>
    <section className="metadata-section"><h2>Investment metadata</h2><MetadataRows rows={[
      { label: "Owners", value: choices.owners.filter((owner) => investment.ownerIds.includes(owner.id)).map((owner) => owner.label).join(", ") },
      { label: "Asset class", value: label(choices.assetClasses, investment.assetClassId) },
      { label: "Account type", value: label(choices.accountTypes, investment.accountTypeId) },
      { label: "Tax status", value: label(choices.taxStatuses, investment.taxStatusId) },
      { label: "Liquidity", value: label(choices.liquidities, investment.liquidityId) },
      { label: "Institution", value: label(choices.institutions, investment.institutionId) },
      { label: "Custom groups", value: choices.customGroups.filter((group) => investment.groupIds.includes(group.id)).map((group) => group.label).join(", ") || "None" },
    ]} /></section>
    <div className="entry-actions"><Link href={`/investments/history?investmentId=${encodeURIComponent(investment.id)}`}>View history and corrections</Link></div>
  </>;
}
