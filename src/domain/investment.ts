export type InvestmentStatus = "active" | "closed";

/** Closing preserves history but stops ordinary forward data entry. */
export function canRecordInvestmentActivity(status: InvestmentStatus): boolean {
  return status === "active";
}
