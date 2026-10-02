import { NextRequest, NextResponse } from "next/server";
import { WorkflowError } from "@/application/errors";
import { householdSetupService } from "@/app/setup-data";

const headers = { "Cache-Control": "no-store" };
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin ||
    request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ formError: "Unable to submit setup." }, { status: 403, headers });
  }
  let input: { name: string; ownerNames: string[] };
  try {
    const body = await request.json();
    if (!body || typeof body.name !== "string" || !Array.isArray(body.ownerNames) ||
      body.ownerNames.some((name: unknown) => typeof name !== "string")) throw new Error();
    input = { name: body.name, ownerNames: body.ownerNames };
  } catch {
    return NextResponse.json({ formError: "Enter a household name and owner names." }, { status: 400, headers });
  }
  try {
    await householdSetupService().initialize(input);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    if (error instanceof WorkflowError) {
      if (error.field) return NextResponse.json({ fieldErrors: { [error.field]: error.code === "owners_required"
        ? "Add at least one owner." : "Enter names of 1–200 characters." } }, { status: 400, headers });
      return NextResponse.json({ formError: "Multiple households exist. Setup is paused; reconcile the database with your administrator before continuing." }, { status: 409, headers });
    }
    return NextResponse.json({ formError: "Setup is unavailable right now. Your values are still here; retry safely." }, { status: 503, headers });
  }
}
