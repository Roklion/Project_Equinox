import type { ActionKind, Provenance } from "@/domain/financial";
import type { ClassificationId, HouseholdId, InvestmentId, OwnerId } from "@/domain/investment";

export type CreateInvestment = {
  householdId: HouseholdId; name: string; ownerIds: OwnerId[];
  assetClassId?: ClassificationId | null; accountTypeId?: ClassificationId | null;
  taxStatusId?: ClassificationId | null; liquidityId?: ClassificationId | null; institutionId?: ClassificationId | null;
  groupIds?: ClassificationId[];
};
/** Full metadata replacement; omitted classifications/groups are cleared. */
export type EditInvestment = CreateInvestment & { investmentId: InvestmentId };
export type InvestmentMetadata = Omit<CreateInvestment, "householdId"> & {
  id: InvestmentId; status: "active" | "closed"; closedOn: string | null; groupIds: ClassificationId[];
};
export type InvestmentChoices = {
  owners: Array<{ id: string; label: string }>;
  assetClasses: Array<{ id: string; label: string }>;
  accountTypes: Array<{ id: string; label: string }>;
  taxStatuses: Array<{ id: string; label: string }>;
  liquidities: Array<{ id: string; label: string }>;
  institutions: Array<{ id: string; label: string }>;
  customGroups: Array<{ id: string; label: string }>;
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
type CorrectableProvenance = {
  source?: Provenance["source"] | null;
  sourceReference?: string | null;
  notes?: string | null;
};
export type EditExternalAction = Omit<RecordExternalAction, keyof Provenance> & CorrectableProvenance & { actionId: string };
export type EditTransfer = Omit<RecordTransfer, keyof Provenance> & CorrectableProvenance & { actionId: string };
export type DeleteAction = { householdId: HouseholdId; actionId: string };
export type WriteValuationMark = {
  householdId: HouseholdId; investmentId: InvestmentId; asOfDate: string;
  grossValue: string; debt?: string;
} & Provenance;
export type ReplaceValuationMark = Omit<WriteValuationMark, "grossValue" | "source" | "sourceReference" | "notes"> & {
  grossValue?: string;
  source?: Provenance["source"] | null;
  sourceReference?: Provenance["sourceReference"] | null;
  notes?: Provenance["notes"] | null;
};
export type ValuationBatchRow =
  | ({ operation: "create" } & Omit<WriteValuationMark, "householdId" | "asOfDate">)
  | ({ operation: "replace" } & Omit<ReplaceValuationMark, "householdId" | "asOfDate">);
export type SaveValuationBatch = { householdId: HouseholdId; asOfDate: string; rows: ValuationBatchRow[] };
export type EditValuationMark = Omit<WriteValuationMark, keyof Provenance> & CorrectableProvenance & { originalAsOfDate: string };
export type InvestmentOption = {
  id: InvestmentId; name: string; status: "active" | "closed"; closedOn: string | null;
  assetClass: string | null; accountType: string | null; taxStatus: string | null;
  liquidity: string | null; institution: string | null;
};

export type StoredMovement = {
  actionId: string; kind: ActionKind; effectiveDate: string;
  investmentId: InvestmentId; role: "external" | "source" | "destination";
  direction: "in" | "out"; amount: string;
  counterpartyInvestmentId: InvestmentId | null;
  source?: string | null; sourceReference?: string | null; notes?: string | null;
};
export type StoredMark = {
  id: string; asOfDate: string; grossValue: string; debt: string;
  source?: string | null; sourceReference?: string | null; notes?: string | null;
};

/** Application-owned contract: no SQL, Drizzle, or framework request types. */
export interface PortfolioRepository {
  createInvestment(input: CreateInvestment): Promise<{ id: InvestmentId }>;
  editInvestment(input: EditInvestment): Promise<{ id: InvestmentId }>;
  getInvestmentMetadata(householdId: HouseholdId, investmentId: InvestmentId): Promise<InvestmentMetadata>;
  getInvestmentChoices(householdId: HouseholdId): Promise<InvestmentChoices>;
  closeInvestment(householdId: HouseholdId, investmentId: InvestmentId, closedOn: string): Promise<{ id: InvestmentId }>;
  recordExternalAction(input: RecordExternalAction): Promise<{ id: string }>;
  editExternalAction(input: EditExternalAction): Promise<{ id: string }>;
  deleteExternalAction(input: DeleteAction): Promise<void>;
  recordTransfer(input: RecordTransfer): Promise<{ id: string }>;
  editTransfer(input: EditTransfer): Promise<{ id: string }>;
  deleteTransfer(input: DeleteAction): Promise<void>;
  recordValuationMark(input: WriteValuationMark): Promise<StoredMark>;
  replaceValuationMark(input: ReplaceValuationMark): Promise<StoredMark>;
  editValuationMark(input: EditValuationMark): Promise<StoredMark>;
  deleteValuationMark(householdId: HouseholdId, investmentId: InvestmentId, asOfDate: string): Promise<void>;
  saveValuationBatch(input: SaveValuationBatch): Promise<StoredMark[]>;
  getEligibleInvestments(householdId: HouseholdId, asOfDate: string): Promise<InvestmentOption[]>;
  getInvestments(householdId: HouseholdId): Promise<InvestmentOption[]>;
  getLatestValuationMarks(householdId: HouseholdId): Promise<Array<StoredMark & { investmentId: InvestmentId }>>;
  getValuationContext(householdId: HouseholdId, investmentId: InvestmentId, asOfDate: string): Promise<{
    existing: StoredMark | null; previous: StoredMark | null;
  }>;
  getInvestmentHistory(householdId: HouseholdId, investmentId: InvestmentId): Promise<{
    movements: StoredMovement[]; marks: StoredMark[];
  }>;
}
