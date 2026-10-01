import Link from "next/link";
import type { ConstituentSnapshot } from "@/domain/analytics/snapshot";
import { AsOfDate, ClassificationChips, MetricUnavailable, MetricValue, ValuationAge } from "./primitives";
import { formatMoney } from "./format";

export function InvestmentRow({ investment, valuation, asOfDate, classifications = [] }: {
  investment: { id: string; name: string; status: "active" | "closed" };
  valuation?: ConstituentSnapshot["valuation"]; asOfDate?: string; classifications?: string[];
}) {
  return <article className="investment-row">
    <div><h2><Link href={`/investments/${encodeURIComponent(investment.id)}`}>{investment.name}</Link></h2>
      <p className="metric-context">{investment.status === "closed" ? "Closed investment" : "Active investment"}</p>
      {classifications.length > 0 && <ClassificationChips labels={classifications} />}</div>
    <div className="investment-row-value"><p className="metric-context">Net investment value · USD</p>
      {valuation && asOfDate ? <><MetricValue result={valuation.status === "available"
        ? { status: "available", value: valuation.value.navCents } : valuation} format={formatMoney} />
        <AsOfDate date={asOfDate} />
        {valuation.status === "available" && <ValuationAge markAsOfDate={valuation.value.markAsOfDate} ageDays={valuation.value.ageDays} />}</>
        : <MetricUnavailable reason="Financial summaries will be connected in the Investments update." />}
    </div>
  </article>;
}
