import Link from "next/link";
import { loadHistoricalCharts } from "@/app/chart-data";
import { notFound } from "next/navigation";
import { withEntryService } from "@/app/add/entry-data";
import { MetadataRows, SurfaceState } from "@/components/financial/primitives";

export const dynamic = "force-dynamic";

export default async function InvestmentDetailPage({ params }: { params: Promise<{ investmentId: string }> }) {
  const { investmentId } = await params;
  let investment;
  try {
    investment = await withEntryService(async ({ householdId, service }) =>
      (await service.getInvestments(householdId)).find((item) => item.id === investmentId));
  } catch {
    return <><h1>Investment detail</h1><SurfaceState kind="error" title="Investment could not be loaded"
      action={<Link href={`/investments/${encodeURIComponent(investmentId)}`}>Try again</Link>}>Please try again.</SurfaceState></>;
  }
  if (!investment) notFound();
  const charts = await loadHistoricalCharts({ investmentIds: [investment.id] });
  return <><div className="entry-topline"><Link href="/investments">← Investments</Link></div>
    <section className="page-heading"><p className="eyebrow">Investment detail</p><h1>{investment.name}</h1>
      <p>{investment.status === "closed" ? `Closed on ${investment.closedOn}` : "Active investment"}</p></section>
    {charts}
    <section className="metadata-section"><h2>Classification</h2><MetadataRows rows={[
      { label: "Asset class", value: investment.assetClass }, { label: "Account type", value: investment.accountType },
      { label: "Tax status", value: investment.taxStatus }, { label: "Liquidity", value: investment.liquidity },
      { label: "Institution", value: investment.institution },
    ]} /></section>
    <div className="entry-actions"><Link href={`/investments/history?investmentId=${encodeURIComponent(investment.id)}`}>
      View history and corrections</Link></div>
  </>;
}
