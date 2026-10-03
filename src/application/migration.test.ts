import { expect, it } from "vitest";
import { planMigration, migrationInvestmentId } from "./migration";
import type { ImportCatalog } from "./migration-ports";
import { syntheticImport } from "@/migration/testing/normalized";
const input = () => syntheticImport("house","oa","ob");
const catalog = (): ImportCatalog => ({exists:true,householdId:"house",ownerIds:["oa","ob"],classificationIds:{},classifications:[],investments:[]});
it("plans all supported records deterministically, without changing input", () => {
  const source = input(); const before = structuredClone(source);
  expect(planMigration(source,catalog())).toEqual({datasetId:"synthetic-migration-v1",householdId:"house",counts:{investments:3,existingInvestments:0,classifications:2,contributions:3,withdrawals:2,transfers:1,valuations:6,closures:1},findings:[]});
  source.dataset.records.reverse(); expect(planMigration(source,catalog()).findings).toEqual([]);
  source.dataset.records.reverse(); expect(source).toEqual(before);
});
it("reports required mapping, household, owner, lifecycle and mark failures together", () => {
  const source = input(); const target = catalog(); target.exists = false; target.ownerIds = [];
  target.investments.push({id:"existing",status:"active",closedOn:null,hasHistory:true});
  source.dataset.records.push({sourceKey:"late",sourceKind:"synthetic",kind:"valuation",investmentKey:"c",asOfDate:"2026-01-02",grossValue:"1.001",debt:"0"});
  const findings = planMigration(source,target).findings;
  expect(findings.map(f => f.code)).toEqual(expect.arrayContaining(["target_missing","unresolved_owner","explicit_investment_mapping_required","invalid_lifecycle","invalid_money"]));
});
it("blocks history collisions, duplicate target IDs, incompatible lifecycle and ambiguous lookup reuse", () => {
  const source = input(); source.mapping.investments = {a:"same",b:"same",c:null};
  const target = catalog(); target.investments.push({id:"same",status:"closed",closedOn:"2025-01-01",hasHistory:true});
  target.classifications.push({id:"one",dimension:"assetClass",label:"Synthetic Asset"},{id:"two",dimension:"assetClass",label:"Synthetic Asset"});
  expect(planMigration(source,target).findings.map(f => f.code)).toEqual(expect.arrayContaining(["existing_history","investment_collision","invalid_lifecycle","ambiguous_classification"]));
  source.mapping.investments.c = "missing";
  expect(planMigration(source,target).findings.map(f => f.code)).toContain("target_investment_missing");
});
it("blocks stable-ID repeat creation even for investment-only imports with explicit create mapping", () => {
  const source = input(); source.dataset.records = source.dataset.records.filter(r => r.kind === "investment");
  source.mapping.investments = {a:null,b:null,c:null};
  const target = catalog(); target.investments.push({id:migrationInvestmentId("house",source.dataset.datasetId,"a"),status:"active",closedOn:null,hasHistory:false});
  expect(planMigration(source,target).findings).toEqual([{code:"investment_collision",severity:"error",sourceKey:"a"}]);
});

it("returns migration-safe preflight read errors without private driver details", async () => {
  const { createMigrationService } = await import("./migration");
  const service = createMigrationService({catalog:async () => {throw new Error("SYNTHETIC-PRIVATE-DRIVER-DETAIL");},transaction:async () => {throw new Error("unused");}});
  await expect(service.preflight(input())).rejects.toThrow("Migration target could not be read.");
  try {await service.preflight(input());} catch(error) {expect(String(error)).not.toContain("SYNTHETIC-PRIVATE-DRIVER-DETAIL");}
});
