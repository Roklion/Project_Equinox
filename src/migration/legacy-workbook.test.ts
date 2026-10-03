import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parseWorkbook } from "./spreadsheet";
import { legacyWorkbookMapping, writeLegacyWorkbook } from "./testing/legacy-workbook";

it("maps configured joint owners without workbook owner/taxonomy columns or inferred classifications", async () => {
  const directory = await mkdtemp(join(tmpdir(), "equinox-synthetic-legacy-"));
  try {
    const path = join(directory, "synthetic.xlsx");
    await writeLegacyWorkbook(path);
    const mapping = legacyWorkbookMapping();
    const parsed = await parseWorkbook(path, mapping);
    expect(parsed.findings).toEqual([]);
    expect(parsed.dataset?.records.filter(r => r.kind === "investment")).toMatchObject([
      { ownerKeys: ["owner-a", "owner-b"], classifications: {}, customGroupKeys: [] },
      { ownerKeys: ["owner-b"], classifications: {}, customGroupKeys: [] },
      { ownerKeys: ["owner-a"], classifications: {}, customGroupKeys: [] },
    ]);
    expect(JSON.stringify(parsed.dataset)).not.toContain("Legacy bucket");
    const invalid = structuredClone(mapping);
    Object.assign(invalid.sheets[0].fields.ownerKeys!, { separator: "" });
    expect((await parseWorkbook(path, invalid)).findings).toEqual([{ severity: "error", code: "invalid_mapping" }]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
