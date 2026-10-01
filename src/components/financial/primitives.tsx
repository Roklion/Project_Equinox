import type { ReactNode } from "react";
import type { MetricResult } from "@/domain/analytics/contracts";
import type { SnapshotMoney } from "@/domain/analytics/snapshot";
import type { PeriodChange } from "@/domain/analytics/cash-flow";
import { formatDate, formatMoney } from "./format";

// Ambiguity is presentation-supported for future providers; the current domain
// solver accepts one root and does not produce this state.
export type DisplayResult<T> = MetricResult<T> | { status: "ambiguous"; reason: string };

const reasons = {
  missing_valuation: "Valuation coverage is incomplete. Record the missing valuations to see this metric.",
  zero_contributions: "No contributions are recorded, so a multiple cannot be calculated.",
  no_sign_change: "The dated cash flows do not support an annualized return.",
  no_root: "An acceptable annualized return could not be calculated.",
};

export function MetricUnavailable({ reason, ambiguous = false }: { reason: string; ambiguous?: boolean }) {
  return <span className="metric-unavailable"><span className="metric-number">—</span>
    <span>{ambiguous ? "Ambiguous" : "Unavailable"}: {reason}</span></span>;
}

export function MetricValue<T>({ result, format }: { result: DisplayResult<T>; format: (value: T) => string }) {
  if (result.status === "available") return <span className="metric-number">{format(result.value)}</span>;
  return <MetricUnavailable ambiguous={result.status === "ambiguous"}
    reason={result.status === "ambiguous" ? result.reason : reasons[result.reason]} />;
}

export function AsOfDate({ date, label = "As of" }: { date: string; label?: string }) {
  return <p className="as-of-date">{label} <time dateTime={date}>{formatDate(date)}</time></p>;
}

export function SignedDelta({ result, context }: { result: MetricResult<bigint>; context: string }) {
  const direction = result.status === "available"
    ? result.value < 0n ? "Decrease" : result.value > 0n ? "Increase" : "No change" : "Change";
  return <p className="signed-delta"><span>{direction}: </span>
    <MetricValue result={result} format={(value) => formatMoney(value, true)} /> <span>{context}</span></p>;
}

export function HeadlineValue({ label, result, asOfDate, delta, context }: {
  label: string; result: MetricResult<bigint>; asOfDate: string;
  delta?: MetricResult<bigint>; context?: string;
}) {
  return <div className="headline-value"><p className="eyebrow">{label} · USD</p>
    <div className="headline-number"><MetricValue result={result} format={formatMoney} /></div>
    {delta && <SignedDelta result={delta} context={context ?? ""} />}
    <AsOfDate date={asOfDate} />
  </div>;
}

export function ValueBreakdown({ result, asOfDate }: { result: MetricResult<SnapshotMoney>; asOfDate: string }) {
  return <div><dl className="financial-breakdown">
    {([ ["Gross value", "grossValueCents"], ["Investment-linked debt", "debtCents"], ["Net investment value", "navCents"] ] as const)
      .map(([label, field]) => <div key={field}><dt>{label} · USD</dt><dd>
        <MetricValue result={result.status === "available" ? { status: "available", value: result.value[field] } : result}
          format={formatMoney} /></dd></div>)}
  </dl><AsOfDate date={asOfDate} /></div>;
}

export function PerformanceBreakdown({ result, startDate, endDate }: {
  result: MetricResult<PeriodChange>; startDate: string; endDate: string;
}) {
  return <div><p className="metric-context">{formatDate(startDate)} – {formatDate(endDate)}</p>
    <dl className="financial-breakdown">
      {([ ["Change in net value", "navChangeCents"], ["Net external cash flow", "netExternalCashFlowCents"],
        ["Investment performance effect", "investmentPerformanceEffectCents"], ["Profit / loss", "pnlCents"] ] as const)
        .map(([label, field]) => <div key={field}><dt>{label} · USD</dt><dd>
          <MetricValue result={result.status === "available" ? { status: "available", value: result.value[field] } : result}
            format={(value) => formatMoney(value, true)} /></dd></div>)}
    </dl><AsOfDate date={endDate} /></div>;
}

export function ReturnMetric({ kind, result, asOfDate, context = "Since inception" }: {
  kind: "MOIC" | "XIRR"; result: DisplayResult<number>; asOfDate: string; context?: string;
}) {
  return <div className="return-metric"><h3>{kind === "MOIC" ? "MOIC · Investment multiple" : "XIRR · Annualized return"}</h3>
    <MetricValue result={result} format={(value) => Number.isFinite(value)
      ? kind === "MOIC" ? `${value.toFixed(2)}×`
        : new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
      : "Unavailable: Invalid analytics result"} />
    <p className="metric-context">{context}</p><AsOfDate date={asOfDate} /></div>;
}

/** Age is supplied by analytics. Any carried-forward mark is labeled explicitly. */
export function ValuationAge({ markAsOfDate, ageDays }: { markAsOfDate: string; ageDays: number }) {
  return <p className="valuation-age">{ageDays === 0 ? "Current valuation" : `Older valuation · ${ageDays} ${ageDays === 1 ? "day" : "days"} old`}
    {" · "}<time dateTime={markAsOfDate}>{formatDate(markAsOfDate)}</time></p>;
}

export function ClassificationChips({ labels }: { labels: readonly string[] }) {
  return <ul className="classification-chips" aria-label="Classifications">
    {labels.map((label, index) => <li key={`${index}-${label}`}>{label}</li>)}
  </ul>;
}

export function MetadataRows({ rows }: { rows: readonly { label: string; value: string | null }[] }) {
  return <dl className="metadata-rows">{rows.map(({ label, value }) => <div key={label}>
    <dt>{label}</dt><dd>{value ?? "Not specified"}</dd></div>)}</dl>;
}

export function SurfaceState({ kind, title, children, action }: {
  kind: "empty" | "loading" | "error"; title: string; children?: ReactNode; action?: ReactNode;
}) {
  return <div className="surface-state" role={kind === "error" ? "alert" : kind === "loading" ? "status" : undefined}
    aria-busy={kind === "loading" || undefined}><h2>{title}</h2>{children && <p>{children}</p>}{action}</div>;
}

export function ChartFrame({ title, summary, children }: { title: string; summary: ReactNode; children: ReactNode }) {
  return <section className="chart-frame" aria-label={title}><h2>{title}</h2>
    <div className="selected-date-summary" aria-live="polite" aria-atomic="true">{summary}</div>
    <div className="chart-content">{children}</div></section>;
}
