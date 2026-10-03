export type InvestmentStatus = "active" | "closed";
export type HouseholdId = string;
export type OwnerId = string;
export type InvestmentId = string;
export type ClassificationId = string;

export type Household = { id: HouseholdId; name: string; currency: "USD" };
export type Owner = { id: OwnerId; householdId: HouseholdId; name: string };
export type Investment = {
  id: InvestmentId;
  householdId: HouseholdId;
  name: string;
  status: InvestmentStatus;
  closedOn: string | null;
  ownerIds: OwnerId[];
};

export type ClassificationDimension =
  | "assetClass" | "accountType" | "taxStatus" | "liquidity" | "institution" | "customGroup";
export type Classification = { id: ClassificationId; householdId: HouseholdId; label: string };

/** Closing preserves history but stops ordinary forward data entry. */
export function canRecordInvestmentActivity(status: InvestmentStatus): boolean {
  return status === "active";
}

/** Canonical display names use the same boundary for ordinary entry and migration. */
export function normalizeInvestmentName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 200) throw new Error("Invalid investment name.");
  return name;
}
