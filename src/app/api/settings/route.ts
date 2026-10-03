import { NextRequest, NextResponse } from "next/server";
import { WorkflowError } from "@/application/errors";
import { settingsDimensions, type SettingsDimension } from "@/application/settings";
import { withSettingsService } from "@/app/settings-data";

const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  if (error instanceof WorkflowError) {
    if (error.code === "invalid_name" || error.code === "duplicate_label") return NextResponse.json({ fieldErrors: { label:
      error.code === "duplicate_label" ? "This label already exists in this classification. Choose another label." : "Enter a name of 1–200 characters." } }, { status: 409, headers });
    return NextResponse.json({ formError: error.code === "record_in_use"
      ? "This value is used by an investment. Edit its associations in Manage investment before removing it. Closed investments also retain their associations."
      : "This record is unavailable. Refresh and try again." }, { status: 409, headers });
  }
  return NextResponse.json({ formError: "Settings are unavailable right now. Please try again." }, { status: 503, headers });
}
const unconfigured = () => NextResponse.json({ formError: "Set up a household before managing settings." }, { status: 409, headers });
export async function GET() {
  try {
    const data = await withSettingsService(({ householdId, service }) => service.getSettings(householdId));
    return data === null ? unconfigured() : NextResponse.json(data, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin ||
    request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ formError: "Unable to save settings." }, { status: 403, headers });
  }
  let input: Record<string, unknown>;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    input = body as Record<string, unknown>;
  } catch { return NextResponse.json({ formError: "Unable to read settings." }, { status: 400, headers }); }
  const { dimension, operation, id, label } = input;
  if (typeof dimension !== "string" || ![...settingsDimensions, "household"].includes(dimension as SettingsDimension | "household") ||
    (operation !== "create" && operation !== "rename" && operation !== "remove") ||
    (dimension === "household" && operation !== "rename") ||
    (operation !== "create" && dimension !== "household" && typeof id !== "string") ||
    (operation !== "remove" && typeof label !== "string") || (operation === "remove" && input.confirmed !== true)) {
    return NextResponse.json({ formError: "Choose a valid operation and confirm removals." }, { status: 400, headers });
  }
  try {
    const result = await withSettingsService(async ({ householdId, service }) => {
      await service.write({ householdId, dimension: dimension as SettingsDimension | "household", operation,
        id: typeof id === "string" ? id : undefined, label: typeof label === "string" ? label : undefined });
      return { ok: true };
    });
    return result === null ? unconfigured() : NextResponse.json(result, { headers });
  } catch (error) { return failure(error); }
}
