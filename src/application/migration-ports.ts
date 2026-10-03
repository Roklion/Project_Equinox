import type { ClassificationDimension } from "@/domain/investment";
import type { MigrationDataset, MigrationMapping, MigrationTarget, ValidationFinding } from "@/domain/migration/contracts";
import type { CreateInvestment, PortfolioRepository } from "./ports";

/** In a populated target every investment explicitly selects an ID or null (create). */
export type ImportMapping = MigrationMapping & { investments?: Record<string, string | null> };
export type ImportCatalog = MigrationTarget & {
  exists: boolean;
  investments: Array<{ id: string; status: "active" | "closed"; closedOn: string | null; hasHistory: boolean }>;
  classifications: Array<{ id: string; dimension: ClassificationDimension; label: string }>;
};
export type ImportFinding = Omit<ValidationFinding, "code"> & { code: ValidationFinding["code"] | "target_missing" | "explicit_investment_mapping_required" | "target_investment_missing" | "existing_history" | "investment_collision" | "ambiguous_classification" };
export type ImportCounts = { investments: number; existingInvestments: number; classifications: number; contributions: number; withdrawals: number; transfers: number; valuations: number; closures: number };
export type ImportPlan = { datasetId: string; householdId: string; counts: ImportCounts; findings: ImportFinding[] };
export type ImportManifest = { datasetId: string; householdId: string; ids: Record<string, string>; counts: ImportCounts };
export interface ImportSession {
  catalog(householdId: string): Promise<ImportCatalog>;
  createClassification(householdId: string, dimension: ClassificationDimension, label: string): Promise<string>;
  createInvestment(input: CreateInvestment, id: string): Promise<{ id: string }>;
  portfolio: Pick<PortfolioRepository, "recordExternalAction" | "recordTransfer" | "recordValuationMark" | "closeInvestment">;
}
export interface MigrationRepository {
  catalog(householdId: string): Promise<ImportCatalog>;
  transaction<T>(work: (session: ImportSession) => Promise<T>): Promise<T>;
}
export type ImportInput = { dataset: MigrationDataset; mapping: ImportMapping };
