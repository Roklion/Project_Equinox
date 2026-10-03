import { expect, it } from "vitest";
import type { CashFlowSources } from "@/domain/analytics/cash-flow";
import type { AnalyticsInvestment } from "@/domain/analytics/snapshot";
import type { MigrationDataset, SourceExpectation } from "@/domain/migration/contracts";
import type { ImportManifest } from "./migration-ports";
import { createReconciliationService } from "./reconciliation";
const investment = (id:string): AnalyticsInvestment => ({id,name:`Synthetic ${id}`,status:"active",closedOn:null,owners:[],customGroups:[],classifications:{assetClass:null,accountType:null,taxStatus:null,liquidity:null,institution:null}});
const sources = (): CashFlowSources => ({
  investments:[investment("id-a"),investment("id-b")],
  marks:[
    {id:"a0",investmentId:"id-a",asOfDate:"2025-01-01",grossValue:"100",debt:"0"},
    {id:"b0",investmentId:"id-b",asOfDate:"2025-01-01",grossValue:"50",debt:"0"},
    {id:"a1",investmentId:"id-a",asOfDate:"2026-01-01",grossValue:"90",debt:"0"},
    {id:"b1",investmentId:"id-b",asOfDate:"2026-01-01",grossValue:"4",debt:"9"},
    {id:"future",investmentId:"id-a",asOfDate:"2027-01-01",grossValue:"900",debt:"0"},
  ],
  actions:[
    {id:"ca",kind:"contribution",effectiveDate:"2025-01-01",amount:"100",movements:[{investmentId:"id-a",role:"external",direction:"in",amount:"100"}]},
    {id:"cb",kind:"contribution",effectiveDate:"2025-01-01",amount:"50",movements:[{investmentId:"id-b",role:"external",direction:"in",amount:"50"}]},
    {id:"wa",kind:"withdrawal",effectiveDate:"2025-07-01",amount:"20",movements:[{investmentId:"id-a",role:"external",direction:"out",amount:"20"}]},
    {id:"t",kind:"transfer",effectiveDate:"2025-08-01",amount:"5",movements:[{investmentId:"id-a",role:"source",direction:"out",amount:"5"},{investmentId:"id-b",role:"destination",direction:"in",amount:"5"}]},
  ],
});
const manifest: ImportManifest = {datasetId:"synthetic",householdId:"house",ids:{a:"id-a",b:"id-b"},counts:{investments:2,existingInvestments:0,classifications:0,contributions:2,withdrawals:1,transfers:1,valuations:4,closures:0}};
function expectation(key:string,measure:SourceExpectation["measure"],value:string | number,scopeKey="all",date="2026-01-01"): SourceExpectation {
  return {sourceKey:key,sourceKind:"synthetic",scopeKey,measure,timing:{asOfDate:date},expected:{status:"available",value}} as SourceExpectation;
}
function dataset(expectations:SourceExpectation[]): MigrationDataset {
  return {datasetId:"synthetic",records:[],scopes:[{sourceKey:"all",sourceKind:"synthetic",investmentKeys:["a","b"]}],expectations};
}
const service = (source:CashFlowSources) => createReconciliationService({getSnapshotSources:async () => source,getCashFlowSources:async () => source});
it("compares exact totals, negative NAV, P&L and MOIC while internal transfers cancel", async () => {
  const expectations = [expectation("gross","grossValue","94"),expectation("debt","debt","9"),expectation("nav","nav","85"),expectation("in","contributions","150"),expectation("out","distributions","20"),expectation("pnl","pnl","-45"),expectation("moic","moic",0.7),expectation("negative","nav","-5","b"),expectation("a-out","distributions","25","a")];
  const results = await service(sources()).reconcile(dataset(expectations),manifest);
  expect(results.every(r => r.status === "match")).toBe(true);
  expect(results.find(r => r.sourceKey === "negative")?.equinox).toEqual({status:"available",value:"-5.00"});
});
it("exposes a one-cent difference, source absence, incomplete coverage and an unresolved manifest", async () => {
  const missing = expectation("missing","nav","0"); missing.expected = {status:"missing"};
  const notComputable = expectation("not-computable","xirr",0); notComputable.expected = {status:"not_computable"};
  const expectations = [expectation("cent","nav","85.01"),missing,notComputable,expectation("early","nav","0","all","2024-12-31"),expectation("unknown","nav","0","unknown")];
  const results = await service(sources()).reconcile(dataset(expectations),manifest);
  expect(results.find(r => r.sourceKey === "cent")).toMatchObject({status:"mapping_mismatch",difference:"-0.01",source:{value:"85.01"},equinox:{value:"85.00"}});
  expect(results.find(r => r.sourceKey === "missing")?.status).toBe("source_unavailable");
  expect(results.find(r => r.sourceKey === "not-computable")?.status).toBe("source_unavailable");
  expect(results.find(r => r.sourceKey === "early")).toMatchObject({status:"equinox_unavailable",equinox:{status:"incomplete",reason:"missing_valuation",missingInvestmentIds:["id-a","id-b"]}});
  expect(results.find(r => r.sourceKey === "unknown")?.status).toBe("mapping_mismatch");
  const absent = sources(); absent.investments.pop();
  expect((await service(absent).reconcile(dataset([expectation("absent","nav","0")]),manifest))[0].status).toBe("mapping_mismatch");
});
it("compares valid XIRR with numerical tolerance, preserving raw values, and unavailable states by reason", async () => {
  const source = sources(); source.investments = [investment("id-a")]; source.actions = [source.actions[0]];
  source.marks = [{id:"end",investmentId:"id-a",asOfDate:"2026-01-01",grossValue:"110",debt:"0"}];
  const good = expectation("good","xirr",0.100000001,"a");
  const bad = expectation("bad","xirr",0.101,"a");
  const results = await service(source).reconcile(dataset([good,bad]),manifest);
  expect(results.find(r => r.sourceKey === "good")).toMatchObject({status:"match",source:{value:0.100000001}});
  expect(results.find(r => r.sourceKey === "bad")?.status).toBe("numeric_difference");
  source.actions = [];
  const undefinedMoic = expectation("zero-capital","moic",0,"a"); undefinedMoic.expected = {status:"not_computable",reason:"zero_contributions"};
  const unavailableXirr = expectation("no-sign","xirr",0,"a"); unavailableXirr.expected = {status:"not_computable",reason:"no_sign_change"};
  const states = await service(source).reconcile(dataset([undefinedMoic,unavailableXirr,expectation("numeric-zero","moic",0,"a")]),manifest);
  expect(states.find(r => r.sourceKey === "zero-capital")?.status).toBe("match");
  expect(states.find(r => r.sourceKey === "no-sign")?.status).toBe("match");
  expect(states.find(r => r.sourceKey === "numeric-zero")?.status).toBe("equinox_unavailable");
});
it("annotates known definitions without altering values or concealing a difference as equality", async () => {
  const expected = expectation("definition","pnl","0"); expected.sourceDefinitionTag = "synthetic-approximation";
  const result = (await service(sources()).reconcile(dataset([expected]),manifest,[{sourceDefinitionTag:"synthetic-approximation",measure:"pnl",code:"approximation",note:"Synthetic source used a different definition."}]))[0];
  expect(result).toMatchObject({status:"definition_mismatch",difference:"-45.00",source:{value:"0"},equinox:{value:"-45.00"},explanation:{code:"approximation"}});
});
it("aligns historical gross/debt/NAV on requested dates with latest-on-or-before marks", async () => {
  const a = expectation("history-a","historicalValue","150","all","2025-06-01");
  const b = expectation("history-b","historicalValue","85.01","all","2026-01-02");
  const gross = expectation("history-gross","historicalValue","94"); gross.historicalComponent = "grossValue";
  const debt = expectation("history-debt","historicalValue","9"); debt.historicalComponent = "debt";
  const result = await service(sources()).reconcile(dataset([a,b,gross,debt]),manifest);
  expect(result.filter(r => r.status === "match")).toHaveLength(3);
  expect(result.find(r => r.sourceKey === "history-b")).toMatchObject({status:"mapping_mismatch",difference:"-0.01",equinox:{value:"85.00"}});
});
it("uses canonical period rules and marks unsupported period returns as definition differences", async () => {
  const pnl = expectation("period","pnl","-45"); pnl.timing = {startDate:"2025-01-01",endDate:"2026-01-01"};
  const inflows = expectation("period-in","contributions","0"); inflows.timing = pnl.timing;
  const xirr = expectation("period-xirr","xirr",0.1); xirr.timing = pnl.timing;
  const result = await service(sources()).reconcile(dataset([pnl,inflows,xirr]),manifest);
  expect(result.find(r => r.sourceKey === "period")?.status).toBe("match");
  expect(result.find(r => r.sourceKey === "period-in")?.status).toBe("match");
  expect(result.find(r => r.sourceKey === "period-xirr")).toMatchObject({status:"definition_mismatch",equinox:{reason:"period_return_not_defined"}});
});

it("rejects a mismatched manifest and ambiguous annotations", async () => {
  await expect(service(sources()).reconcile(dataset([]),{...manifest,datasetId:"other"})).rejects.toThrow("does not match");
  const rule = {sourceDefinitionTag:"synthetic",measure:"pnl" as const,code:"different"};
  await expect(service(sources()).reconcile(dataset([]),manifest,[rule,rule])).rejects.toThrow("ambiguous");
});

it("rejects historical ranges even when their end-point value would match", async () => {
  const history = expectation("history-range","historicalValue","85");
  history.timing = {startDate:"2025-01-01",endDate:"2026-01-01"};
  await expect(service(sources()).reconcile(dataset([history]),manifest)).rejects.toThrow("single as-of date");
});
