/** Stable, presentation-neutral failures for correctable workflow input. */
export type WorkflowErrorCode =
  | "invalid_date" | "invalid_grouping" | "invalid_money" | "invalid_transfer"
  | "investment_unavailable" | "action_not_found" | "mark_not_found"
  | "mark_already_exists" | "duplicate_batch_investment" | "empty_correction";

export class WorkflowError extends Error {
  constructor(public readonly code: WorkflowErrorCode) {
    super(code);
    this.name = "WorkflowError";
  }
}
