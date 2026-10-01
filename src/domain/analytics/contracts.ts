import { assertCalendarDate } from "@/domain/financial";

export type MetricResult<T> =
  | { status: "available"; value: T }
  | { status: "incomplete"; reason: "missing_valuation"; missingInvestmentIds: string[] }
  | { status: "unavailable"; reason: "zero_contributions" | "no_sign_change" | "no_root" };

/** One logical transfer, classified once relative to the reporting boundary. */
export function classifyTransfer(
  sourceInvestmentId: string, destinationInvestmentId: string, includedInvestmentIds: ReadonlySet<string>,
): "internal" | "contribution" | "distribution" | "excluded" {
  const source = includedInvestmentIds.has(sourceInvestmentId);
  const destination = includedInvestmentIds.has(destinationInvestmentId);
  if (source && destination) return "internal";
  if (destination) return "contribution";
  if (source) return "distribution";
  return "excluded";
}

/** Beginning snapshot is at startDate; cash flows exclude that day and include endDate. */
export function isInPeriod(effectiveDate: string, startDate: string, endDate: string): boolean {
  [effectiveDate, startDate, endDate].forEach(assertCalendarDate);
  if (startDate > endDate) throw new Error("Period start must not follow its end.");
  return startDate < effectiveDate && effectiveDate <= endDate;
}
