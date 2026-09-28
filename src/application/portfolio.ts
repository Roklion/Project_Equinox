import { assertCalendarDate, formatCents, netValue, parseCents, parseSignedCents } from "@/domain/financial";
import { WorkflowError } from "./errors";
import type { CreateInvestment, EditExternalAction, EditTransfer, PortfolioRepository, RecordExternalAction, RecordTransfer, ReplaceValuationMark, SaveValuationBatch, WriteValuationMark } from "./ports";

function calendarDate(value: string) {
  try { assertCalendarDate(value); } catch { throw new WorkflowError("invalid_date"); }
}
function amount(value: string, allowZero = false) {
  try { return formatCents(parseCents(value, allowZero)); }
  catch { throw new WorkflowError("invalid_money"); }
}
const positiveAmount = (value: string) => amount(value);
const nonnegativeAmount = (value: string) => amount(value, true);

function validatedMark(input: WriteValuationMark): WriteValuationMark {
  calendarDate(input.asOfDate);
  return { ...input, grossValue: nonnegativeAmount(input.grossValue), debt: nonnegativeAmount(input.debt ?? "0") };
}

function validatedReplacement(input: ReplaceValuationMark): ReplaceValuationMark {
  calendarDate(input.asOfDate);
  if ([input.grossValue, input.debt, input.source, input.sourceReference, input.notes]
    .every((value) => value === undefined)) throw new WorkflowError("empty_correction");
  return { ...input,
    grossValue: input.grossValue === undefined ? undefined : nonnegativeAmount(input.grossValue),
    debt: input.debt === undefined ? undefined : nonnegativeAmount(input.debt),
  };
}

/** Shared commands and queries for the user-facing workflows. */
export function createPortfolioService(repository: PortfolioRepository) {
  return {
    createInvestment(input: CreateInvestment) {
      const ownerIds = [...new Set(input.ownerIds)];
      if (ownerIds.length === 0) throw new Error("An investment needs an owner.");
      return repository.createInvestment({ ...input, ownerIds });
    },
    closeInvestment(householdId: string, investmentId: string, closedOn: string) {
      calendarDate(closedOn);
      return repository.closeInvestment(householdId, investmentId, closedOn);
    },
    recordExternalAction(input: RecordExternalAction) {
      calendarDate(input.effectiveDate);
      return repository.recordExternalAction({ ...input, amount: positiveAmount(input.amount) });
    },
    editExternalAction(input: EditExternalAction) {
      calendarDate(input.effectiveDate);
      return repository.editExternalAction({ ...input, amount: positiveAmount(input.amount) });
    },
    deleteExternalAction(householdId: string, actionId: string) {
      return repository.deleteExternalAction({ householdId, actionId });
    },
    recordTransfer(input: RecordTransfer) {
      calendarDate(input.effectiveDate);
      if (input.sourceInvestmentId === input.destinationInvestmentId) throw new WorkflowError("invalid_transfer");
      return repository.recordTransfer({ ...input, amount: positiveAmount(input.amount) });
    },
    editTransfer(input: EditTransfer) {
      calendarDate(input.effectiveDate);
      if (input.sourceInvestmentId === input.destinationInvestmentId) throw new WorkflowError("invalid_transfer");
      return repository.editTransfer({ ...input, amount: positiveAmount(input.amount) });
    },
    deleteTransfer(householdId: string, actionId: string) {
      return repository.deleteTransfer({ householdId, actionId });
    },
    recordValuationMark(input: WriteValuationMark) {
      return repository.recordValuationMark(validatedMark(input));
    },
    /** Explicit correction of an existing mark. It never inserts a second mark. */
    replaceValuationMark(input: ReplaceValuationMark) {
      return repository.replaceValuationMark(validatedReplacement(input));
    },
    deleteValuationMark(householdId: string, investmentId: string, asOfDate: string) {
      calendarDate(asOfDate);
      return repository.deleteValuationMark(householdId, investmentId, asOfDate);
    },
    saveValuationBatch(input: SaveValuationBatch) {
      calendarDate(input.asOfDate);
      const seen = new Set<string>();
      const rows = input.rows.map((row) => {
        if (seen.has(row.investmentId)) throw new WorkflowError("duplicate_batch_investment");
        seen.add(row.investmentId);
        const command = { ...row, householdId: input.householdId, asOfDate: input.asOfDate };
        return row.operation === "create"
          ? { ...validatedMark(command as WriteValuationMark), operation: "create" as const }
          : { ...validatedReplacement(command as ReplaceValuationMark), operation: "replace" as const };
      });
      return repository.saveValuationBatch({ ...input, rows });
    },
    getEligibleInvestments(householdId: string, asOfDate: string) {
      calendarDate(asOfDate);
      return repository.getEligibleInvestments(householdId, asOfDate);
    },
    async getLatestValuationMarks(householdId: string) {
      const marks = await repository.getLatestValuationMarks(householdId);
      return marks.map((mark) => ({ ...mark, netValue: netValue(mark.grossValue, mark.debt) }));
    },
    async getValuationContext(householdId: string, investmentId: string, asOfDate: string) {
      calendarDate(asOfDate);
      const context = await repository.getValuationContext(householdId, investmentId, asOfDate);
      const withNet = (mark: typeof context.existing) => mark && { ...mark, netValue: netValue(mark.grossValue, mark.debt) };
      return { existing: withNet(context.existing), previous: withNet(context.previous) };
    },
    async previewValuationDelta(householdId: string, investmentId: string, asOfDate: string, grossValue: string, debt = "0") {
      const currentNet = netValue(nonnegativeAmount(grossValue), nonnegativeAmount(debt));
      calendarDate(asOfDate);
      const context = await repository.getValuationContext(householdId, investmentId, asOfDate);
      const previous = context.previous && { ...context.previous, netValue: netValue(context.previous.grossValue, context.previous.debt) };
      const existing = context.existing && { ...context.existing, netValue: netValue(context.existing.grossValue, context.existing.debt) };
      return { previous, existing, enteredNetValue: currentNet,
        enteredDelta: previous === null ? null : formatCents(parseSignedCents(currentNet) - parseSignedCents(previous.netValue)) };
    },
    async getInvestmentHistory(householdId: string, investmentId: string) {
      const history = await repository.getInvestmentHistory(householdId, investmentId);
      return {
        movements: history.movements,
        marks: history.marks.map((mark) => ({ ...mark, netValue: netValue(mark.grossValue, mark.debt) })),
      };
    },
  };
}
