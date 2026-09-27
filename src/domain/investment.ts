export type InvestmentStatus = "active" | "closed";

export type Household = { id: string; name: string; currency: "USD" };
export type Owner = { id: string; householdId: string; name: string };
export type Investment = {
  id: string;
  householdId: string;
  name: string;
  status: InvestmentStatus;
  closedOn: string | null;
  ownerIds: string[];
};

export type ClassificationDimension =
  | "assetClass" | "accountType" | "taxStatus" | "liquidity" | "institution" | "customGroup";
export type Classification = { id: string; householdId: string; label: string };

/** Closing preserves history but stops ordinary forward data entry. */
export function canRecordInvestmentActivity(status: InvestmentStatus): boolean {
  return status === "active";
}
