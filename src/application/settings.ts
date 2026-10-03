import { WorkflowError } from "./errors";
import type { InvestmentChoices } from "./ports";

export const settingsDimensions = ["owners", "assetClasses", "accountTypes", "taxStatuses", "liquidities", "institutions", "customGroups"] as const;
export type SettingsDimension = typeof settingsDimensions[number];
export type SettingsData = { household: { id: string; name: string; currency: string }; choices: InvestmentChoices };
export type SettingsCommand = { householdId: string; dimension: SettingsDimension | "household"; operation: "create" | "rename" | "remove"; id?: string; label?: string };
export interface SettingsRepository {
  getSettings(householdId: string): Promise<SettingsData>;
  write(input: SettingsCommand): Promise<void>;
}

export function createSettingsService(repository: SettingsRepository) {
  return {
    getSettings: (householdId: string) => repository.getSettings(householdId),
    async write(input: SettingsCommand) {
      if (![...settingsDimensions, "household"].includes(input.dimension) ||
        !["create", "rename", "remove"].includes(input.operation) ||
        (input.dimension === "household" && input.operation !== "rename")) throw new WorkflowError("invalid_association");
      if (input.operation !== "create" && input.dimension !== "household" &&
        !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(input.id ?? "")) throw new WorkflowError("invalid_association");
      const label = input.label?.trim();
      if (input.operation !== "remove" && (!label || label.length > 200)) throw new WorkflowError("invalid_name", "label");
      await repository.write({ ...input, label });
    },
  };
}
