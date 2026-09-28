import { NextRequest, NextResponse } from "next/server";
import { WorkflowError } from "@/application/errors";
import { assertCalendarDate, parseCents } from "@/domain/financial";
import { withEntryService } from "@/app/add/entry-data";

type FieldErrors = Record<string, string>;
type EntryInput = Record<string, unknown>;

function text(input: EntryInput, key: string): string {
  return typeof input[key] === "string" ? input[key].trim() : "";
}

function valuationDebt(input: EntryInput, blankFallback = "0"): string {
  return text(input, "debt") || blankFallback;
}

function validate(input: EntryInput): FieldErrors {
  const errors: FieldErrors = {};
  const kind = text(input, "kind");
  if (!["contribution", "withdrawal", "transfer", "valuation"].includes(kind)) {
    errors.kind = "Choose an action.";
    return errors;
  }
  try { assertCalendarDate(text(input, "date")); }
  catch { errors.date = "Enter a valid calendar date."; }
  if (!text(input, "investmentId") && kind !== "transfer") errors.investmentId = "Choose an investment.";
  if (kind === "transfer") {
    if (!text(input, "sourceInvestmentId")) errors.sourceInvestmentId = "Choose where value moves from.";
    if (!text(input, "destinationInvestmentId")) errors.destinationInvestmentId = "Choose where value moves to.";
    if (text(input, "sourceInvestmentId") && text(input, "sourceInvestmentId") === text(input, "destinationInvestmentId")) {
      errors.destinationInvestmentId = "Choose a different destination investment.";
    }
  }
  for (const field of kind === "valuation" ? ["grossValue", "debt"] : ["amount"]) {
    const value = field === "debt" ? valuationDebt(input) : text(input, field);
    try { parseCents(value, kind === "valuation"); }
    catch { errors[field] = kind === "valuation" ? "Enter zero or more, with up to two decimal places." : "Enter an amount greater than zero, with up to two decimal places."; }
  }
  if (kind === "valuation" && !["create", "replace"].includes(text(input, "operation"))) {
    errors.operation = "Choose whether to create or correct this mark.";
  }
  if (text(input, "notes").length > 2000) errors.notes = "Keep notes under 2,000 characters.";
  if (text(input, "sourceReference").length > 200) errors.sourceReference = "Keep the reference under 200 characters.";
  return errors;
}

function failure(code: string, kind: string) {
  switch (code) {
    case "invalid_date": return { date: "Enter a valid calendar date." };
    case "invalid_money": return kind === "valuation"
      ? { grossValue: "Enter a valid value." }
      : { amount: "Enter a valid amount." };
    case "invalid_transfer": return { destinationInvestmentId: "Choose a different destination investment." };
    case "investment_unavailable": return { investmentId: "This investment is unavailable on that date. Refresh the choices." };
    case "mark_already_exists": return { operation: "A mark already exists on this date. Refresh and choose the correction action." };
    case "mark_not_found": return { operation: "That mark is no longer available. Refresh and try again." };
    default: return {};
  }
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? "";
  try { assertCalendarDate(date); }
  catch { return NextResponse.json({ fieldErrors: { date: "Enter a valid calendar date." } }, { status: 400 }); }
  try {
    const result = await withEntryService(async ({ householdId, service }) => {
      const investments = await service.getEligibleInvestments(householdId, date);
      const investmentId = request.nextUrl.searchParams.get("investmentId");
      const selected = investmentId && investments.some((item) => item.id === investmentId);
      const context = selected
        ? await service.getValuationContext(householdId, investmentId, date) : null;
      const latest = selected
        ? (await service.getLatestValuationMarks(householdId)).find((mark) => mark.investmentId === investmentId) ?? null
        : null;
      return { investments, context, latest };
    });
    return result !== null
      ? NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ formError: "Add a household and investment before recording an entry." }, { status: 409 });
  } catch {
    return NextResponse.json({ formError: "Entries are unavailable right now. Please try again." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (origin !== request.nextUrl.origin || contentType !== "application/json") {
    return NextResponse.json({ formError: "Unable to save this entry." }, { status: 403 });
  }
  let input: EntryInput;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid body");
    input = parsed as EntryInput;
  } catch {
    return NextResponse.json({ formError: "Unable to read this entry." }, { status: 400 });
  }
  const fieldErrors = validate(input);
  if (Object.keys(fieldErrors).length) return NextResponse.json({ fieldErrors }, { status: 400 });
  try {
    const result = await withEntryService(async ({ householdId, service }) => {
      const date = text(input, "date");
      const provenance = {
        source: "manual" as const,
        sourceReference: text(input, "sourceReference") || undefined,
        notes: text(input, "notes") || undefined,
      };
      const kind = text(input, "kind");
      if (kind === "transfer") {
        return service.recordTransfer({ householdId, sourceInvestmentId: text(input, "sourceInvestmentId"),
          destinationInvestmentId: text(input, "destinationInvestmentId"), effectiveDate: date,
          amount: text(input, "amount"), ...provenance });
      }
      if (kind === "valuation") {
        const investmentId = text(input, "investmentId");
        const operation = text(input, "operation");
        const existing = operation === "replace"
          ? (await service.getValuationContext(householdId, investmentId, date)).existing
          : null;
        const mark = { householdId, investmentId, asOfDate: date,
          grossValue: text(input, "grossValue"), debt: valuationDebt(input, existing?.debt ?? "0"), ...provenance };
        return operation === "replace"
          ? service.replaceValuationMark(mark) : service.recordValuationMark(mark);
      }
      return service.recordExternalAction({ householdId, investmentId: text(input, "investmentId"),
        kind: kind as "contribution" | "withdrawal", effectiveDate: date,
        amount: text(input, "amount"), ...provenance });
    });
    return result !== null
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ formError: "Add a household and investment before recording an entry." }, { status: 409 });
  } catch (error) {
    if (error instanceof WorkflowError) {
      const fieldErrors = failure(error.code, text(input, "kind"));
      if (Object.keys(fieldErrors).length > 0) return NextResponse.json({ fieldErrors }, { status: 409 });
      return NextResponse.json({ formError: "Unable to save this entry. Please try again." }, { status: 409 });
    }
    return NextResponse.json({ formError: "Unable to save this entry. Please try again." }, { status: 503 });
  }
}
