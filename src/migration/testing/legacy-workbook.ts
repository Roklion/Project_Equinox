import ExcelJS from "exceljs";
import source from "./synthetic-data.json";
import originalMapping from "./synthetic-mapping.json";

/** Synthetic regression input only. Owners are operator configuration, not workbook taxonomy.
 * Reuse the established XLSX test writer so CI needs no private file or office application.
 */
export async function writeLegacyWorkbook(path: string) {
  const workbook = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(source)) workbook.addWorksheet(name).addRows(rows);
  const holdings = workbook.getWorksheet("Example Holdings")!;
  holdings.spliceRows(1, 4,
    ["Key", "Name", "Obsolete grouping", "Status", "Closed on"],
    ["i-a", "Synthetic Amber", "Legacy bucket", "active", null],
    ["i-b", "Synthetic Birch", "Legacy bucket", "active", null],
    ["i-c", "Synthetic Cedar", "Legacy bucket", "closed", "2026-01-01"],
  );
  // Fractional cents are forbidden, but exact nonzero cents must survive every boundary.
  workbook.getWorksheet("Example Moves")!.getCell("E2").value = "5.01";
  const controls = workbook.getWorksheet("Example Controls")!;
  controls.getCell("E4").value = "85.00";
  controls.addRows([
    ["e-closed-moic", "i-c", "2026-01-01", "moic", 1.2],
    ["e-closed-xirr", "i-c", "2026-01-01", "xirr", 0.2],
    ["e-missing", "scope-all", "2026-01-01", "nav", null],
    ["e-no-coverage", "scope-all", "2024-12-31", "nav", 0],
    ["e-legacy-pnl", "scope-all", "2026-01-01", "pnl", -66, "legacy-value-change"],
    ["e-history-between", "scope-all", "2025-06-01", "historicalValue", 160],
  ]);
  controls.getCell("F1").value = "Definition";
  await workbook.xlsx.writeFile(path);
}

export function legacyWorkbookMapping() {
  const mapping = structuredClone(originalMapping);
  const otherSheets = mapping.sheets.filter(s => s.kind !== "investment");
  const expectations = otherSheets.find(s => s.kind === "expectation")!;
  expectations.lastRow = 16;
  return {
    ...mapping, datasetId: "synthetic-legacy-v1",
    sheets: [
      ...([ [2, "owner-a|owner-b"], [3, "owner-b"], [4, "owner-a"] ] as const).map(([row, ownerKeys]) => ({
        sheet: "Example Holdings", firstRow: row, lastRow: row, kind: "investment",
        key: { column: "A" },
        fields: { name: { column: "B" }, ownerKeys: { value: ownerKeys, separator: "|" }, status: { column: "D" }, closedOn: { column: "E" } },
      })),
      ...otherSheets.map(s => s.kind === "expectation"
        ? { ...s, fields: { ...s.fields, sourceDefinitionTag: { column: "F" } } } : s),
    ],
  };
}
