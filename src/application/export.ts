import { serializeExportBundle, type ExportData } from "@/domain/portability/bundle";

/** Read all canonical data for exactly one existing household, in a consistent snapshot. */
export interface ExportRepository { readHousehold(householdId: string): Promise<ExportData>; }

export function createExportService(repository: ExportRepository) {
  return {
    async exportHousehold(householdId: string, generatedAt = new Date().toISOString()): Promise<string> {
      if (!householdId.trim()) throw new Error("An explicit household is required.");
      const data = await repository.readHousehold(householdId);
      if (data.household.id !== householdId) throw new Error("Export household mismatch.");
      return serializeExportBundle({ format: "equinox-canonical", version: 1, generatedAt, data });
    },
  };
}
