import { assertCalendarDate, formatCents, netValue, parseCents } from "@/domain/financial";
import type { CreateInvestment, PortfolioRepository, RecordExternalAction, RecordTransfer, ReplaceValuationMark, WriteValuationMark } from "./ports";

const positiveAmount = (value: string) => formatCents(parseCents(value));
const nonnegativeAmount = (value: string) => formatCents(parseCents(value, true));

function validatedMark(input: WriteValuationMark): WriteValuationMark {
  assertCalendarDate(input.asOfDate);
  return { ...input, grossValue: nonnegativeAmount(input.grossValue), debt: nonnegativeAmount(input.debt ?? "0") };
}

function validatedReplacement(input: ReplaceValuationMark): ReplaceValuationMark {
  assertCalendarDate(input.asOfDate);
  if ([input.grossValue, input.debt, input.source, input.sourceReference, input.notes]
    .every((value) => value === undefined)) throw new Error("A mark correction needs a changed field.");
  return { ...input,
    grossValue: input.grossValue === undefined ? undefined : nonnegativeAmount(input.grossValue),
    debt: input.debt === undefined ? undefined : nonnegativeAmount(input.debt),
  };
}

/** Small commands and a history query; UI workflow orchestration belongs to later epics. */
export function createPortfolioService(repository: PortfolioRepository) {
  return {
    createInvestment(input: CreateInvestment) {
      const ownerIds = [...new Set(input.ownerIds)];
      if (ownerIds.length === 0) throw new Error("An investment needs an owner.");
      return repository.createInvestment({ ...input, ownerIds });
    },
    closeInvestment(householdId: string, investmentId: string, closedOn: string) {
      assertCalendarDate(closedOn);
      return repository.closeInvestment(householdId, investmentId, closedOn);
    },
    recordExternalAction(input: RecordExternalAction) {
      assertCalendarDate(input.effectiveDate);
      return repository.recordExternalAction({ ...input, amount: positiveAmount(input.amount) });
    },
    recordTransfer(input: RecordTransfer) {
      assertCalendarDate(input.effectiveDate);
      if (input.sourceInvestmentId === input.destinationInvestmentId) throw new Error("Transfer needs distinct investments.");
      return repository.recordTransfer({ ...input, amount: positiveAmount(input.amount) });
    },
    recordValuationMark(input: WriteValuationMark) {
      return repository.recordValuationMark(validatedMark(input));
    },
    /** Explicit correction of an existing mark. It never inserts a second mark. */
    replaceValuationMark(input: ReplaceValuationMark) {
      return repository.replaceValuationMark(validatedReplacement(input));
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
