import { NextRequest, NextResponse } from "next/server";
import { WorkflowError } from "@/application/errors";
import { withEntryService } from "@/app/add/entry-data";

const noStore = { "Cache-Control": "no-store" };
const messages: Record<string, string> = {
  invalid_name: "Enter a name of 1–200 characters.", owners_required: "Choose at least one owner.",
  invalid_association: "This choice is unavailable. Refresh the form and choose again.",
  invalid_date: "Enter a valid calendar date.",
  close_date_conflict: "The close date cannot be earlier than recorded actions or valuations.",
};
function failure(error: unknown) {
  if (error instanceof WorkflowError) {
    const field = error.field ?? (error.code === "invalid_date" ? "closedOn" : undefined);
    return NextResponse.json(field ? { fieldErrors: { [field]: messages[error.code] ?? "Review this field." } }
      : { formError: "This investment is unavailable. Refresh and try again." }, { status: 409, headers: noStore });
  }
  return NextResponse.json({ formError: "Investment management is unavailable right now. Please try again." }, { status: 503, headers: noStore });
}

export async function GET(request: NextRequest) {
  try {
    const result = await withEntryService(async ({ householdId, service }) => {
      const investmentId = request.nextUrl.searchParams.get("investmentId");
      if (investmentId) return { choices: await service.getInvestmentChoices(householdId),
        investment: await service.getInvestmentMetadata(householdId, investmentId) };
      return { choices: await service.getInvestmentChoices(householdId), investments: await service.getInvestments(householdId) };
    });
    return result === null
      ? NextResponse.json({ formError: "Set up a household before managing investments." }, { status: 409, headers: noStore })
      : NextResponse.json(result, { headers: noStore });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin ||
    request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ formError: "Unable to save this investment." }, { status: 403 });
  }
  let input: Record<string, unknown>;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    input = body as Record<string, unknown>;
  } catch { return NextResponse.json({ formError: "Unable to read this investment." }, { status: 400 }); }
  const text = (key: string) => typeof input[key] === "string" ? input[key].trim() : "";
  const operation = text("operation");
  if (!["create", "edit", "close"].includes(operation)) return NextResponse.json({ formError: "Choose a supported investment operation." }, { status: 400 });
  const errors: Record<string, string> = {};
  if (operation !== "create" && !text("investmentId")) errors.investmentId = "Choose an investment.";
  if (operation === "close" && input.confirmed !== true) errors.confirmed = "Confirm closure to preserve history and stop later activity.";
  if (operation !== "close") {
    for (const field of ["ownerIds", "groupIds"]) {
      if (!Array.isArray(input[field]) || input[field].some((id: unknown) => typeof id !== "string" || !id)) errors[field] = "Choose valid records.";
    }
    for (const field of ["assetClassId", "accountTypeId", "taxStatusId", "liquidityId", "institutionId"]) {
      if (input[field] !== undefined && input[field] !== null && typeof input[field] !== "string") errors[field] = "Choose a valid classification.";
    }
  }
  if (Object.keys(errors).length) return NextResponse.json({ fieldErrors: errors }, { status: 400 });
  try {
    const result = await withEntryService(async ({ householdId, service }) => {
      if (operation === "close") return service.closeInvestment(householdId, text("investmentId"), text("closedOn"));
      const metadata = { householdId, name: text("name"), ownerIds: input.ownerIds as string[], groupIds: input.groupIds as string[],
        assetClassId: text("assetClassId") || null, accountTypeId: text("accountTypeId") || null,
        taxStatusId: text("taxStatusId") || null, liquidityId: text("liquidityId") || null, institutionId: text("institutionId") || null };
      return operation === "create" ? service.createInvestment(metadata) : service.editInvestment({ ...metadata, investmentId: text("investmentId") });
    });
    return result === null ? NextResponse.json({ formError: "Set up a household before managing investments." }, { status: 409 })
      : NextResponse.json({ ok: true, id: result.id }, { headers: noStore });
  } catch (error) { return failure(error); }
}
