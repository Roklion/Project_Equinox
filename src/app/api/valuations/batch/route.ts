import { NextRequest, NextResponse } from "next/server";
import { withEntryService } from "@/app/add/entry-data";
import { WorkflowError } from "@/application/errors";
import { assertCalendarDate, parseCents } from "@/domain/financial";
import type { ValuationBatchRow } from "@/application/ports";

type InputRow = { investmentId: string; operation: "create" | "replace"; grossValue: string; debt: string };

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? "";
  try { assertCalendarDate(date); }
  catch { return NextResponse.json({ formError: "Choose a valid as-of date." }, { status: 400 }); }
  try {
    const data = await withEntryService(async ({ householdId, service }) => {
      const investments = (await service.getEligibleInvestments(householdId, date))
        .filter((investment) => investment.status === "active");
      const [contexts, latest] = await Promise.all([
        Promise.all(investments.map((investment) =>
          service.getValuationContext(householdId, investment.id, date))),
        service.getLatestValuationMarks(householdId),
      ]);
      return { investments: investments.map((investment, index) => ({ ...investment, ...contexts[index],
        latest: latest.find((mark) => mark.investmentId === investment.id) ?? null })) };
    });
    return data === null
      ? NextResponse.json({ formError: "Add a household and investment before recording marks." }, { status: 409 })
      : NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ formError: "Valuations are unavailable right now." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin ||
    request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ formError: "Unable to save marks." }, { status: 403 });
  }
  let date: string;
  let rows: InputRow[];
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    const input = body as Record<string, unknown>;
    date = input.date as string;
    assertCalendarDate(date);
    if (!Array.isArray(input.rows) || input.rows.length === 0) throw new Error();
    rows = input.rows as InputRow[];
  } catch {
    return NextResponse.json({ formError: "Choose a valid date and enter at least one mark." }, { status: 400 });
  }
  const rowErrors: Record<string, string> = {};
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== "object" || typeof row.investmentId !== "string" || !row.investmentId ||
      seen.has(row.investmentId) || !["create", "replace"].includes(row.operation) ||
      typeof row.grossValue !== "string" || typeof row.debt !== "string") {
      rowErrors[String(index)] = "Review this row and its create or correction choice.";
      continue;
    }
    seen.add(row.investmentId);
    try { parseCents(row.grossValue.trim(), true); parseCents(row.debt.trim() || "0", true); }
    catch { rowErrors[row.investmentId] = "Enter nonnegative gross value and debt with up to two decimal places."; }
  }
  if (Object.keys(rowErrors).length) return NextResponse.json({ rowErrors }, { status: 400 });
  try {
    const result = await withEntryService(async ({ householdId, service }) => {
      const investments = await service.getEligibleInvestments(householdId, date);
      const activeIds = new Set(investments.filter((item) => item.status === "active").map((item) => item.id));
      for (const row of rows) {
        if (!activeIds.has(row.investmentId)) rowErrors[row.investmentId] = "This investment is no longer active for batch entry.";
      }
      if (Object.keys(rowErrors).length) return false;
      const contexts = await Promise.all(rows.map((row) =>
        service.getValuationContext(householdId, row.investmentId, date)));
      rows.forEach((row, index) => {
        if (row.operation === "create" && contexts[index].existing) rowErrors[row.investmentId] =
          "A mark already exists on this date. Choose correction explicitly.";
        if (row.operation === "replace" && !contexts[index].existing) rowErrors[row.investmentId] =
          "The mark on this date is no longer available. Refresh the date.";
      });
      if (Object.keys(rowErrors).length) return false;
      const commands: ValuationBatchRow[] = rows.map((row) => ({
        operation: row.operation, investmentId: row.investmentId,
        grossValue: row.grossValue.trim(),
        debt: row.debt.trim() || (row.operation === "create" ? "0" : undefined), source: "manual",
      }));
      await service.saveValuationBatch({ householdId, asOfDate: date, rows: commands });
      return true;
    });
    if (Object.keys(rowErrors).length) return NextResponse.json({ rowErrors }, { status: 409 });
    return result === null
      ? NextResponse.json({ formError: "Add a household and investment before recording marks." }, { status: 409 })
      : NextResponse.json({ ok: true });
  } catch (error) {
    const conflict = error instanceof WorkflowError &&
      ["mark_already_exists", "mark_not_found", "investment_unavailable"].includes(error.code);
    return NextResponse.json({ formError: conflict
      ? "The marks changed while you were editing. No rows were saved. Refresh the date and review the choices."
      : "Unable to save marks. No rows were saved; your entries remain here." }, { status: conflict ? 409 : 503 });
  }
}
