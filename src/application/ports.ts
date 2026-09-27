import type { ActionKind, Provenance } from "@/domain/financial";
import type { ClassificationId, HouseholdId, InvestmentId, OwnerId } from "@/domain/investment";

export type CreateInvestment = {
  householdId: HouseholdId; name: string; ownerIds: OwnerId[];
  assetClassId?: ClassificationId; accountTypeId?: ClassificationId;
  taxStatusId?: ClassificationId; liquidityId?: ClassificationId; institutionId?: ClassificationId;
};
export type RecordExternalAction = {
  householdId: HouseholdId; investmentId: InvestmentId;
  kind: Extract<ActionKind, "contribution" | "withdrawal">;
  effectiveDate: string; amount: string;
} & Provenance;
export type RecordTransfer = {
  householdId: HouseholdId; sourceInvestmentId: InvestmentId;
  destinationInvestmentId: InvestmentId; effectiveDate: string; amount: string;
} & Provenance;
export type WriteValuationMark = {
  householdId: HouseholdId; investmentId: InvestmentId; asOfDate: string;
  grossValue: string; debt?: string;
} & Provenance;
export type ReplaceValuationMark = Omit<WriteValuationMark, "grossValue"> & { grossValue?: string };

export type StoredMovement = {
  actionId: string; kind: ActionKind; effectiveDate: string;
  investmentId: InvestmentId; role: "external" | "source" | "destination";
  direction: "in" | "out"; amount: string;
  source?: string | null; sourceReference?: string | null; notes?: string | null;
};
export type StoredMark = {
  id: string; asOfDate: string; grossValue: string; debt: string;
  source?: string | null; sourceReference?: string | null; notes?: string | null;
};

/** Application-owned contract: no SQL, Drizzle, or framework request types. */
export interface PortfolioRepository {
  createInvestment(input: CreateInvestment): Promise<{ id: InvestmentId }>;
  closeInvestment(householdId: HouseholdId, investmentId: InvestmentId, closedOn: string): Promise<{ id: InvestmentId }>;
  recordExternalAction(input: RecordExternalAction): Promise<{ id: string }>;
  recordTransfer(input: RecordTransfer): Promise<{ id: string }>;
  recordValuationMark(input: WriteValuationMark): Promise<StoredMark>;
  replaceValuationMark(input: ReplaceValuationMark): Promise<StoredMark>;
  getInvestmentHistory(householdId: HouseholdId, investmentId: InvestmentId): Promise<{
    movements: StoredMovement[]; marks: StoredMark[];
  }>;
}
