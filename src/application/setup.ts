import { WorkflowError } from "./errors";

export type HouseholdSetupState =
  | { status: "empty" }
  | { status: "configured"; householdId: string }
  | { status: "inconsistent" };
export type SetupHousehold = { name: string; ownerNames: string[] };
export interface HouseholdSetupRepository {
  getState(): Promise<HouseholdSetupState>;
  initialize(input: SetupHousehold): Promise<{ householdId: string }>;
}

export function createHouseholdSetupService(repository: HouseholdSetupRepository) {
  return {
    getState: () => repository.getState(),
    initialize(input: SetupHousehold) {
      const name = input.name.trim();
      if (!name || name.length > 200) throw new WorkflowError("invalid_name", "name");
      if (!input.ownerNames.length) throw new WorkflowError("owners_required", "ownerNames");
      const ownerNames = input.ownerNames.map((owner) => owner.trim());
      if (ownerNames.some((owner) => !owner || owner.length > 200)) {
        throw new WorkflowError("invalid_name", "ownerNames");
      }
      return repository.initialize({ name, ownerNames });
    },
  };
}
