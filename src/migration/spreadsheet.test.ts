import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { normalizeWorkbookDate, normalizeWorkbookMoney, parseWorkbook, readWorkbookMapping } from "./spreadsheet";
import { validateMigration } from "@/domain/migration/validate";

const fixture = resolve("src/migration/testing/synthetic.xlsx");
const config = resolve("src/migration/testing/synthetic-mapping.json");
it("parses the inspectable synthetic workbook, including cached formulas, joint owners, debt and explicit transfer", async () => {
  const mapping = await readWorkbookMapping(config);
  const {dataset,findings} = await parseWorkbook(fixture,mapping);
  expect(findings).toEqual([]); expect(dataset!.records).toHaveLength(15);
  expect(dataset!.records.find(r => r.sourceKey === "i-a")).toMatchObject({ownerKeys:["owner-a","owner-b"],classifications:{assetClass:"class-a"},customGroupKeys:["group-a"]});
  expect(dataset!.records.find(r => r.sourceKey === "i-b")).toMatchObject({classifications:{},customGroupKeys:[]});
  expect(dataset!.records.find(r => r.sourceKey === "i-c")).toMatchObject({status:"closed",closedOn:"2026-01-01"});
  expect(dataset!.records.find(r => r.sourceKey === "t-a")).toMatchObject({kind:"transfer",sourceInvestmentKey:"i-a",destinationInvestmentKey:"i-b",amount:"5.00"});
  expect(dataset!.records.find(r => r.sourceKey === "v-a0")).toMatchObject({asOfDate:"2025-01-01",debt:"0.00"});
  expect(dataset!.records.find(r => r.sourceKey === "v-b1")).toMatchObject({grossValue:"4.00",debt:"9.00"});
  expect(dataset!.expectations.find(e => e.sourceKey === "e-nav")!.expected).toEqual({status:"available",value:"85.00"});
  expect(validateMigration(dataset!, {householdId:"house",owners:{"owner-a":"oa","owner-b":"ob"},classifications:{assetClass:{"class-a":{normalizedLabel:"Synthetic Asset"}},customGroup:{"group-a":{normalizedLabel:"Synthetic Group"}}}}, {householdId:"house",ownerIds:["oa","ob"],classificationIds:{}})).toEqual([]);
});
it("reports unavailable cached formula outputs as states; zero stays available and blank stays missing", async () => {
  const directory = await mkdtemp(join(tmpdir(),"equinox-adapter-test-"));
  try {
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(fixture);
    const sheet = workbook.getWorksheet("Example Controls")!;
    sheet.getCell("E2").value = {formula:"SUM(1,2)"};
    sheet.getCell("E3").value = {formula:"1-1",result:0};
    sheet.getCell("E4").value = null;
    const path = join(directory,"synthetic.xlsx"); await workbook.xlsx.writeFile(path);
    const result = await parseWorkbook(path,await readWorkbookMapping(config));
    expect(result.findings).toEqual([{severity:"warning",code:"formula_value_unavailable",sourceKey:"e-gross",field:"expected"}]);
    expect(result.dataset!.expectations.find(e => e.sourceKey === "e-gross")!.expected.status).toBe("not_computable");
    expect(result.dataset!.expectations.find(e => e.sourceKey === "e-debt")!.expected).toEqual({status:"available",value:"0.00"});
    expect(result.dataset!.expectations.find(e => e.sourceKey === "e-nav")!.expected).toEqual({status:"missing"});
  } finally {await rm(directory,{recursive:true,force:true});}
});
it("fails closed on bad financial cells without dumping content or creating a partial import", async () => {
  const directory = await mkdtemp(join(tmpdir(),"equinox-adapter-test-"));
  try {
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(fixture);
    workbook.getWorksheet("Example Marks")!.getCell("D2").value = "PRIVATE-LIKE-TEST-MARKER";
    workbook.getWorksheet("Example Moves")!.getCell("C2").value = null;
    const path = join(directory,"synthetic.xlsx"); await workbook.xlsx.writeFile(path);
    const result = await parseWorkbook(path,await readWorkbookMapping(config));
    expect(result.dataset).toBeNull();
    expect(result.findings).toEqual(expect.arrayContaining([
      {severity:"error",code:"invalid_money",sourceKey:"v-a0",field:"grossValue"},
      {severity:"error",code:"unsupported_cell",sourceKey:"t-a",field:"destinationInvestmentKey"},
    ]));
    expect(JSON.stringify(result.findings)).not.toContain("PRIVATE-LIKE-TEST-MARKER");
  } finally {await rm(directory,{recursive:true,force:true});}
});
it("rejects malformed configurations and unreadable/relative workbook paths safely", async () => {
  expect((await parseWorkbook(fixture,{datasetId:"x",sheets:[{fields:null}]})).findings[0].code).toBe("invalid_mapping");
  expect((await parseWorkbook("relative.xlsx",await readWorkbookMapping(config))).findings[0].code).toBe("workbook_unreadable");
  await expect(readWorkbookMapping("relative.json")).rejects.toThrow("mapping is unreadable");
});
describe("exact date and money normalization", () => {
  it("supports ISO, Excel epochs and UTC date-only objects", () => {
    expect(normalizeWorkbookDate(45658)).toBe("2025-01-01");
    expect(normalizeWorkbookDate(44196,true)).toBe("2025-01-01");
    expect(normalizeWorkbookDate(new Date("2025-01-01T00:00:00Z"))).toBe("2025-01-01");
    for (const date of [60,45658.5,"2025-02-29","01/02/2025","2025-01-01T00:00:00Z",new Date("2025-01-01T12:00:00Z")]) expect(() => normalizeWorkbookDate(date)).toThrow();
  });
  it("preserves exact cents and rejects coercion/rounding", () => {
    expect(normalizeWorkbookMoney(0)).toBe("0.00"); expect(normalizeWorkbookMoney("9999999999999999.99")).toBe("9999999999999999.99");
    expect(normalizeWorkbookMoney("-5",true)).toBe("-5.00");
    for (const amount of [null,"",true,"1,000","$10","1.001",0.1+0.2,NaN,1e16]) expect(() => normalizeWorkbookMoney(amount)).toThrow();
  });
});

it("classifies an unusable cached formula as not comparable and rejects ambiguous timing mappings", async () => {
  const directory = await mkdtemp(join(tmpdir(),"equinox-adapter-test-"));
  try {
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(fixture);
    workbook.getWorksheet("Example Controls")!.getCell("E2").value = {formula:"1/0",result:{error:"#DIV/0!"}};
    const path = join(directory,"synthetic.xlsx"); await workbook.xlsx.writeFile(path);
    const mapping = await readWorkbookMapping(config);
    const result = await parseWorkbook(path,mapping);
    expect(result.dataset!.expectations.find(e => e.sourceKey === "e-gross")!.expected.status).toBe("not_computable");
    expect(result.findings).toEqual([{severity:"warning",code:"formula_value_unavailable",sourceKey:"e-gross",field:"expected"}]);
    mapping.sheets.find(s => s.kind === "expectation")!.fields.startDate = {value:"2025-01-01"};
    expect((await parseWorkbook(path,mapping)).findings).toEqual([{severity:"error",code:"invalid_mapping"}]);
  } finally {await rm(directory,{recursive:true,force:true});}
});

it("rejects unknown mapping fields instead of silently omitting intended metadata", async () => {
  for (const field of ["assetClass", "customGroupKeys"]) {
    const mapping = await readWorkbookMapping(config);
    const investment = mapping.sheets.find(s => s.kind === "investment")!;
    investment.fields[field + "Typo"] = investment.fields[field];
    delete investment.fields[field];
    expect(await parseWorkbook(fixture, mapping)).toEqual({dataset: null, findings: [{severity: "error", code: "invalid_mapping"}]});
  }
  const mapping = await readWorkbookMapping(config);
  for (const section of mapping.sheets) {
    expect(await parseWorkbook(fixture, {...mapping, sheets: [{...section, fields: {...section.fields, unsupported: {value: "synthetic"}}}]}))
      .toEqual({dataset: null, findings: [{severity: "error", code: "invalid_mapping"}]});
  }
});
