import { NextRequest, NextResponse } from "next/server";
import { withEntryService } from "@/app/add/entry-data";
import { WorkflowError } from "@/application/errors";
import { assertCalendarDate, parseCents } from "@/domain/financial";

const unavailable = { formError: "History is unavailable right now. Please try again." };
function text(input: Record<string, unknown>, key: string) {
  return typeof input[key] === "string" ? input[key].trim() : "";
}
async function bodyFor(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin ||
    request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return null;
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  const investmentId = request.nextUrl.searchParams.get("investmentId") ?? "";
  try {
    const result = await withEntryService(async ({ householdId, service }) => {
      const investments = await service.getInvestments(householdId);
      if (investmentId && !investments.some((item) => item.id === investmentId)) return { investments, history: null };
      const history = investmentId ? await service.getInvestmentHistory(householdId, investmentId) : null;
      return { investments, history };
    });
    return result === null
      ? NextResponse.json({ formError: "Add a household before viewing history." }, { status: 409 })
      : NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json(unavailable, { status: 503 }); }
}

async function mutate(request: NextRequest, remove: boolean) {
  const input = await bodyFor(request);
  if (!input) return NextResponse.json({ formError: "Unable to read this change." }, { status: 400 });
  const kind = text(input, "kind");
  const investmentId = text(input, "investmentId");
  const actionId = text(input, "actionId");
  const originalAsOfDate = text(input, "originalAsOfDate");
  const date = text(input, "date");
  if (!investmentId || !["contribution", "withdrawal", "transfer", "valuation"].includes(kind) ||
    (kind === "valuation" ? !originalAsOfDate : !actionId)) {
    return NextResponse.json({ formError: "Select a history entry to change." }, { status: 400 });
  }
  if (!remove) {
    try {
      assertCalendarDate(date);
      parseCents(text(input, kind === "valuation" ? "grossValue" : "amount"), kind === "valuation");
      if (kind === "valuation") parseCents(text(input, "debt") || "0", true);
      if (kind === "transfer" && (!text(input, "sourceInvestmentId") || !text(input, "destinationInvestmentId") ||
        text(input, "sourceInvestmentId") === text(input, "destinationInvestmentId"))) throw new Error();
      if (text(input, "notes").length > 2000 || text(input, "sourceReference").length > 200) throw new Error();
    } catch { return NextResponse.json({ formError: "Review the date, investments, and nonnegative values before saving." }, { status: 400 }); }
  }
  try {
    const result = await withEntryService(async ({ householdId, service }) => {
      const investments = await service.getInvestments(householdId);
      if (!investments.some((item) => item.id === investmentId)) return false;
      const history = await service.getInvestmentHistory(householdId, investmentId);
      const found = kind === "valuation"
        ? history.marks.some((mark) => mark.asOfDate === originalAsOfDate)
        : history.movements.some((movement) => movement.actionId === actionId && movement.kind === kind);
      if (!found) return false;
      if (remove) {
        if (kind === "valuation") await service.deleteValuationMark(householdId, investmentId, originalAsOfDate);
        else if (kind === "transfer") await service.deleteTransfer(householdId, actionId);
        else await service.deleteExternalAction(householdId, actionId);
        return true;
      }
      const provenance = { source: "manual" as const, sourceReference: text(input, "sourceReference") || null,
        notes: text(input, "notes") || null };
      if (kind === "valuation") {
        if (date !== originalAsOfDate) {
          const context = await service.getValuationContext(householdId, investmentId, date);
          if (context.existing) throw new WorkflowError("mark_already_exists");
        }
        await service.editValuationMark({ householdId, investmentId, originalAsOfDate,
          asOfDate: date, grossValue: text(input, "grossValue"), debt: text(input, "debt") || "0", ...provenance });
      } else if (kind === "transfer") {
        await service.editTransfer({ householdId, actionId,
          sourceInvestmentId: text(input, "sourceInvestmentId"),
          destinationInvestmentId: text(input, "destinationInvestmentId"),
          effectiveDate: date, amount: text(input, "amount"), ...provenance });
      } else {
        await service.editExternalAction({ householdId, actionId, investmentId: text(input, "targetInvestmentId") || investmentId,
          kind: kind as "contribution" | "withdrawal", effectiveDate: date,
          amount: text(input, "amount"), ...provenance });
      }
      return true;
    });
    return result ? NextResponse.json({ ok: true })
      : NextResponse.json({ formError: "This history entry is no longer available. Refresh the list." }, { status: 409 });
  } catch (error) {
    if (error instanceof WorkflowError) {
      const message = error.code === "mark_already_exists" ? "Another mark already exists on that date. Choose a different date." :
        error.code === "investment_unavailable" ? "The selected investment is unavailable on that date." :
          error.code === "action_not_found" || error.code === "mark_not_found" ? "This entry is no longer available. Refresh the list." :
            "Unable to change this entry. Review the fields and try again.";
      return NextResponse.json({ formError: message }, { status: 409 });
    }
    return NextResponse.json({ formError: "Unable to change this entry. The original record remains unchanged." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) { return mutate(request, false); }
export async function DELETE(request: NextRequest) { return mutate(request, true); }
