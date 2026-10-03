import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { assertCalendarDate, formatCents, parseCents } from "@/domain/financial";
import type { MigrationDataset, MigrationRecord, SourceExpectation } from "@/domain/migration/contracts";
import { compare } from "@/domain/migration/validate";

export type CellMapping = { column: string; separator?: string } | { value: string | number | null };
export type SheetMapping = {
  sheet: string; firstRow: number; lastRow: number; key: CellMapping;
  kind: MigrationRecord["kind"] | "scope" | "expectation";
  fields: Record<string, CellMapping>;
};
export type WorkbookMapping = { datasetId: string; sheets: SheetMapping[] };
export type AdapterFinding = { severity: "error" | "warning"; code: "invalid_mapping" | "workbook_unreadable" | "unsupported_cell" | "invalid_money" | "invalid_date" | "formula_value_unavailable" | "missing_sheet"; sourceKey?: string; field?: string };
class CellError extends Error { constructor(public code: AdapterFinding["code"]) { super(code); } }
const blank = (value: unknown) => value === null || value === undefined || value === "";
function readCell(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  // ExcelJS value omits falsy cached results; its dedicated result getter preserves zero.
  if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value)) {
    const result = cell.result;
    if (result === undefined || result === null) throw new CellError("formula_value_unavailable");
    return scalar(result);
  }
  return scalar(value);
}
function scalar(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if ("formula" in value || "sharedFormula" in value) {
      if (!Object.hasOwn(value,"result") || value.result === undefined || value.result === null) throw new CellError("formula_value_unavailable");
      return scalar(value.result);
    }
    throw new CellError("unsupported_cell");
  }
  return value;
}
export function normalizeWorkbookDate(value: unknown, date1904 = false): string {
  let date: string;
  if (typeof value === "string") date = value;
  else if (value instanceof Date && Number.isFinite(value.getTime()) && value.toISOString().endsWith("T00:00:00.000Z")) date = value.toISOString().slice(0,10);
  else if (typeof value === "number" && Number.isSafeInteger(value) && value >= (date1904 ? 0 : 1) && (date1904 || value !== 60)) {
    const base = Date.UTC(date1904 ? 1904 : 1899,date1904 ? 0 : 11,date1904 ? 1 : 31);
    const instant = new Date(base + (value - (!date1904 && value > 60 ? 1 : 0)) * 86400000);
    if (!Number.isFinite(instant.getTime())) throw new CellError("invalid_date");
    date = instant.toISOString().slice(0,10);
  } else throw new CellError("invalid_date");
  try { assertCalendarDate(date); } catch { throw new CellError("invalid_date"); }
  return date;
}
export function normalizeWorkbookMoney(value: unknown, signed = false, aggregate = false): string {
  if (typeof value !== "string" && typeof value !== "number") throw new CellError("invalid_money");
  // Numeric cells cannot preserve cents beyond the safe integer boundary. Use text there.
  if (typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100)) throw new CellError("invalid_money");
  const text = String(value);
  if (!(signed ? /^-?(0|[1-9]\d*)(\.\d{1,2})?$/ : /^(0|[1-9]\d*)(\.\d{1,2})?$/).test(text)) throw new CellError("invalid_money");
  const negative = text.startsWith("-");
  const absolute = negative ? text.slice(1) : text;
  if (!aggregate) { try { parseCents(absolute,true); } catch { throw new CellError("invalid_money"); } }
  const [whole,fraction = ""] = absolute.split(".");
  return formatCents((BigInt(whole) * 100n + BigInt(fraction.padEnd(2,"0"))) * (negative ? -1n : 1n));
}
const mappedFields: Record<SheetMapping["kind"], readonly string[]> = {
  investment: ["name", "ownerKeys", "assetClass", "accountType", "taxStatus", "liquidity", "institution", "customGroupKeys", "status", "closedOn"],
  contribution: ["investmentKey", "effectiveDate", "amount"],
  withdrawal: ["investmentKey", "effectiveDate", "amount"],
  transfer: ["sourceInvestmentKey", "destinationInvestmentKey", "effectiveDate", "amount"],
  valuation: ["investmentKey", "asOfDate", "grossValue", "debt"],
  scope: ["investmentKeys"],
  expectation: ["scopeKey", "measure", "asOfDate", "startDate", "endDate", "expected", "state", "sourceDefinitionTag", "historicalComponent"],
};
function validateMapping(value: unknown): value is WorkbookMapping {
  if (!value || typeof value !== "object") return false;
  const m = value as WorkbookMapping;
  const ref = (v: unknown): boolean => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    const cell = v as Partial<{column:string;separator:string;value:unknown}>;
    if (Object.hasOwn(cell,"column")) {
      return !Object.hasOwn(cell,"value") && typeof cell.column === "string" && /^[A-Z]{1,3}$/.test(cell.column)
        && (!Object.hasOwn(cell,"separator") || typeof cell.separator === "string" && !!cell.separator);
    }
    return Object.hasOwn(cell,"value") && (cell.value === null || typeof cell.value === "string" || typeof cell.value === "number" && Number.isFinite(cell.value));
  };
  return typeof m.datasetId === "string" && !!m.datasetId.trim() && Array.isArray(m.sheets) && m.sheets.every(s =>
    s && typeof s.sheet === "string" && !!s.sheet && Number.isInteger(s.firstRow) && s.firstRow >= 1 && Number.isInteger(s.lastRow) && s.lastRow >= s.firstRow &&
    ["investment","contribution","withdrawal","transfer","valuation","scope","expectation"].includes(s.kind) && ref(s.key) && s.fields && typeof s.fields === "object" && !Array.isArray(s.fields) && Object.entries(s.fields).every(([name, value]) => mappedFields[s.kind].includes(name) && ref(value)) && (s.kind !== "expectation" || (s.fields.asOfDate
      ? !s.fields.startDate && !s.fields.endDate
      : !!s.fields.startDate && !!s.fields.endDate)));
}
/** Explicit local files only; no database, network fetch, or formula calculation. */
export async function parseWorkbook(path: string, mapping: unknown): Promise<{ dataset: MigrationDataset | null; findings: AdapterFinding[] }> {
  if (!validateMapping(mapping)) return { dataset: null, findings: [{severity:"error",code:"invalid_mapping"}] };
  const book = new ExcelJS.Workbook();
  try { if (!isAbsolute(path)) throw new Error(); await book.xlsx.readFile(path); }
  catch { return { dataset: null, findings: [{severity:"error",code:"workbook_unreadable"}] }; }
  const dataset: MigrationDataset = { datasetId: mapping.datasetId, records: [], scopes: [], expectations: [] };
  const findings: AdapterFinding[] = [];
  for (const section of mapping.sheets) {
    const sheet = book.getWorksheet(section.sheet);
    if (!sheet) { findings.push({severity:"error",code:"missing_sheet"}); continue; }
    for (let row = section.firstRow; row <= section.lastRow; row++) {
      let sourceKey: string | undefined;
      let field = "sourceKey";
      const get = (ref: CellMapping | undefined) => ref ? "value" in ref ? ref.value : readCell(sheet.getCell(`${ref.column}${row}`)) : undefined;
      try {
        const key = get(section.key);
        if (blank(key) && Object.values(section.fields).every(ref => !("column" in ref) || blank(sheet.getCell(`${ref.column}${row}`).value))) continue;
        if (typeof key !== "string" || !key.trim()) throw new CellError("unsupported_cell");
        sourceKey = key;
        const value = (name: string) => { field = name; return get(section.fields[name]); };
        const text = (name: string, optional = false): string | undefined => {
          const raw = value(name); if (optional && blank(raw)) return undefined;
          if (typeof raw !== "string" || !raw.trim()) throw new CellError("unsupported_cell"); return raw;
        };
        const list = (name: string, optional = false) => {
          const raw = text(name,optional); if (raw === undefined) return [];
          const ref = section.fields[name]; const separator = ref && "column" in ref ? ref.separator : undefined;
          const values = separator ? raw.split(separator) : [raw];
          if (values.some(v => !v.trim())) throw new CellError("unsupported_cell"); return values;
        };
        const date = (name: string) => normalizeWorkbookDate(value(name),book.properties.date1904);
        const money = (name: string, signed = false, aggregate = false) => normalizeWorkbookMoney(value(name),signed,aggregate);
        const base = {sourceKey,sourceKind:"spreadsheet"};
        switch (section.kind) {
          case "investment": {
            const name = text("name")!; const ownerKeys = list("ownerKeys"); const customGroupKeys = list("customGroupKeys",true);
            const classifications: Extract<MigrationRecord,{kind:"investment"}>["classifications"] = {};
            for (const dimension of ["assetClass","accountType","taxStatus","liquidity","institution"] as const) { const key = text(dimension,true); if (key !== undefined) classifications[dimension] = key; }
            const status = text("status")!; if (status !== "active" && status !== "closed") throw new CellError("unsupported_cell");
            const close = value("closedOn"); const closedOn = blank(close) ? null : normalizeWorkbookDate(close,book.properties.date1904);
            dataset.records.push({...base,kind:"investment",name,ownerKeys,customGroupKeys,classifications,status,closedOn}); break;
          }
          case "contribution": case "withdrawal": dataset.records.push({...base,kind:section.kind,investmentKey:text("investmentKey")!,effectiveDate:date("effectiveDate"),amount:money("amount")}); break;
          case "transfer": dataset.records.push({...base,kind:"transfer",sourceInvestmentKey:text("sourceInvestmentKey")!,destinationInvestmentKey:text("destinationInvestmentKey")!,effectiveDate:date("effectiveDate"),amount:money("amount")}); break;
          case "valuation": dataset.records.push({...base,kind:"valuation",investmentKey:text("investmentKey")!,asOfDate:date("asOfDate"),grossValue:money("grossValue"),debt:money("debt")}); break;
          case "scope": dataset.scopes.push({...base,investmentKeys:list("investmentKeys")}); break;
          case "expectation": {
            const historicalComponent = text("historicalComponent",true);
            if (historicalComponent !== undefined && !["grossValue","debt","nav"].includes(historicalComponent)) throw new CellError("unsupported_cell");
            const scopeKey = text("scopeKey")!; const measure = text("measure")!; const sourceDefinitionTag = text("sourceDefinitionTag",true);
            if (!["grossValue","debt","nav","contributions","distributions","pnl","historicalValue","moic","xirr"].includes(measure)) throw new CellError("unsupported_cell");
            const timing = section.fields.asOfDate ? {asOfDate:date("asOfDate")} : {startDate:date("startDate"),endDate:date("endDate")};
            if (measure === "historicalValue" && !("asOfDate" in timing)) { field = "timing"; throw new CellError("invalid_date"); }
            let expected: SourceExpectation["expected"];
            try {
              const state = text("state",true) ?? "available";
              if (state === "missing" || state === "not_computable") expected = {status:state};
              else if (state !== "available") throw new CellError("unsupported_cell");
              else {
                const raw = value("expected");
                if (blank(raw)) expected = {status:"missing"};
                else if (measure === "moic" || measure === "xirr") {
                  if (typeof raw !== "number" || !Number.isFinite(raw)) throw new CellError("unsupported_cell");
                  expected = {status:"available",value:raw};
                } else expected = {status:"available",value:normalizeWorkbookMoney(raw,["nav","pnl","historicalValue"].includes(measure),true)};
              }
            } catch (error) {
              const ref = section.fields.expected;
              const cell = ref && "column" in ref ? sheet.getCell(`${ref.column}${row}`).value : null;
              const formula = cell && typeof cell === "object" && ("formula" in cell || "sharedFormula" in cell);
              if (!(error instanceof CellError) || !formula || field !== "expected") throw error;
              expected = {status:"not_computable",reason:"cached_formula_value_unavailable"};
              findings.push({severity:"warning",code:"formula_value_unavailable",sourceKey,field:"expected"});
            }
            dataset.expectations.push({...base,scopeKey,measure,timing,expected,...(historicalComponent ? {historicalComponent} : {}),...(sourceDefinitionTag ? {sourceDefinitionTag} : {})} as SourceExpectation); break;
          }
        }
      } catch (error) { findings.push({severity:"error",code:error instanceof CellError ? error.code : "unsupported_cell",...(sourceKey ? {sourceKey} : {}),field}); }
    }
  }
  findings.sort((a,b) => compare(a.sourceKey ?? "",b.sourceKey ?? "") || compare(a.code,b.code) || compare(a.field ?? "",b.field ?? ""));
  return {dataset: findings.some(f => f.severity === "error") ? null : dataset,findings};
}
export async function readWorkbookMapping(path: string): Promise<WorkbookMapping> {
  try { if (!isAbsolute(path)) throw new Error(); const value: unknown = JSON.parse(await readFile(path,"utf8")); if (!validateMapping(value)) throw new Error(); return value; }
  catch { throw new Error("Workbook mapping is unreadable or unsupported."); }
}
