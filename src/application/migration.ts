import { createHash } from "node:crypto";
import { validateMigration, classificationDimensions, compare } from "@/domain/migration/validate";
import { normalizeInvestmentName, type ClassificationDimension } from "@/domain/investment";
import type { MigrationInvestment } from "@/domain/migration/contracts";
import type { CreateInvestment } from "./ports";
import type { ImportCatalog, ImportInput, ImportPlan, ImportManifest, MigrationRepository, ImportFinding } from "./migration-ports";

export class MigrationError extends Error {
  constructor(public readonly code: "preflight_failed" | "read_failed" | "write_failed", public readonly findings: ImportFinding[] = []) {
    super(code === "preflight_failed" ? "Migration preflight failed." : code === "read_failed" ? "Migration target could not be read." : "Migration transaction response failed; the commit outcome may be unknown. Inspect the target before retrying.");
  }
}
/** Stable opaque IDs prevent repeat creation without persisting a separate migration ledger. */
export function migrationInvestmentId(householdId: string, datasetId: string, sourceKey: string): string {
  const hex = createHash("sha256").update(JSON.stringify(["equinox-migration-v1", householdId, datasetId, sourceKey])).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
function mappedInvestment(input: ImportInput, sourceKey: string): string | null | undefined {
  const mapping = input.mapping.investments;
  return mapping && Object.hasOwn(mapping, sourceKey) ? mapping[sourceKey] : undefined;
}
function investmentRecords(input: ImportInput) {
  return input.dataset.records.filter((r): r is MigrationInvestment => r.kind === "investment").sort((a,b) => compare(a.sourceKey,b.sourceKey));
}
function classificationRequests(input: ImportInput) {
  const requests: Array<{ dimension: ClassificationDimension; key: string; sourceKey: string }> = [];
  for (const investment of investmentRecords(input)) {
    if (mappedInvestment(input, investment.sourceKey)) continue;
    for (const [dimension,key] of Object.entries(investment.classifications)) requests.push({ dimension: dimension as ClassificationDimension, key, sourceKey: investment.sourceKey });
    for (const key of investment.customGroupKeys) requests.push({ dimension: "customGroup", key, sourceKey: investment.sourceKey });
  }
  return requests.sort((a,b) => compare(a.dimension,b.dimension) || compare(a.key,b.key));
}
export function planMigration(input: ImportInput, catalog: ImportCatalog): ImportPlan {
  const { dataset, mapping } = input;
  const findings: ImportFinding[] = validateMigration(dataset, mapping, catalog);
  const add = (code: ImportFinding["code"], sourceKey?: string) => findings.push({ code, severity: "error", ...(sourceKey ? {sourceKey} : {}) });
  if (!catalog.exists) add("target_missing");
  const counts = { investments: 0, existingInvestments: 0, classifications: 0, contributions: 0, withdrawals: 0, transfers: 0, valuations: 0, closures: 0 };
  const mappedIds = new Set<string>();
  for (const record of investmentRecords(input)) {
    const mapped = mappedInvestment(input, record.sourceKey);
    if (catalog.investments.length && mapped === undefined) add("explicit_investment_mapping_required", record.sourceKey);
    const id = mapped ?? migrationInvestmentId(mapping.householdId, dataset.datasetId, record.sourceKey);
    const existing = catalog.investments.find(i => i.id === id);
    if (mappedIds.has(id)) add("investment_collision", record.sourceKey);
    mappedIds.add(id);
    if (mapped != null) {
      counts.existingInvestments++;
      if (!existing) add("target_investment_missing", record.sourceKey);
      else {
        if (existing.hasHistory) add("existing_history", record.sourceKey);
        if (existing.status !== record.status || existing.closedOn !== record.closedOn) add("invalid_lifecycle", record.sourceKey);
      }
    } else { counts.investments++; if (existing) add("investment_collision", record.sourceKey); }
    if (record.status === "closed" && mapped == null) counts.closures++;
  }
  const newLabels = new Set<string>();
  for (const request of classificationRequests(input)) {
    const target = mapping.classifications[request.dimension]?.[request.key];
    if (target?.normalizedLabel !== undefined) {
      const matches = catalog.classifications.filter(c => c.dimension === request.dimension && c.label === target.normalizedLabel);
      if (matches.length > 1) add("ambiguous_classification", request.sourceKey);
      if (!matches.length) newLabels.add(JSON.stringify([request.dimension,target.normalizedLabel]));
    }
  }
  counts.classifications = newLabels.size;
  for (const record of dataset.records) {
    if (record.kind === "contribution") counts.contributions++;
    if (record.kind === "withdrawal") counts.withdrawals++;
    if (record.kind === "transfer") counts.transfers++;
    if (record.kind === "valuation") counts.valuations++;
  }
  return { datasetId: dataset.datasetId, householdId: mapping.householdId, counts, findings: findings.sort((a,b) => compare(a.sourceKey ?? "",b.sourceKey ?? "") || compare(a.code,b.code) || compare(a.field ?? "",b.field ?? "")) };
}
export function createMigrationService(repository: MigrationRepository) {
  return {
    async preflight(input: ImportInput) {
      try { return planMigration(input, await repository.catalog(input.mapping.householdId)); }
      catch { throw new MigrationError("read_failed"); }
    },
    async apply(input: ImportInput): Promise<ImportManifest> {
      try {
        return await repository.transaction(async session => {
          const catalog = await session.catalog(input.mapping.householdId);
          const plan = planMigration(input, catalog);
          if (plan.findings.length) throw new MigrationError("preflight_failed",plan.findings);
          const { dataset, mapping } = input;
          const ids: Record<string,string> = Object.create(null);
          const lookupIds = new Map<string,string>();
          for (const request of classificationRequests(input)) {
            const key = JSON.stringify([request.dimension,request.key]);
            if (lookupIds.has(key)) continue;
            const target = mapping.classifications[request.dimension]![request.key];
            const id = target.canonicalId ?? catalog.classifications.find(c => c.dimension === request.dimension && c.label === target.normalizedLabel)?.id
              ?? await session.createClassification(mapping.householdId,request.dimension,target.normalizedLabel!);
            lookupIds.set(key,id);
            if (!catalog.classifications.some(c => c.id === id)) catalog.classifications.push({id, dimension: request.dimension,label: target.normalizedLabel!});
          }
          for (const record of investmentRecords(input)) {
            const existing = mappedInvestment(input, record.sourceKey);
            const id = existing ?? migrationInvestmentId(mapping.householdId,dataset.datasetId,record.sourceKey);
            if (!existing) {
              const metadata: CreateInvestment = { householdId: mapping.householdId, name: normalizeInvestmentName(record.name), ownerIds: record.ownerKeys.map(k => mapping.owners[k]), groupIds: record.customGroupKeys.map(k => lookupIds.get(JSON.stringify(["customGroup",k]))!) };
              for (const dimension of classificationDimensions) {
                if (dimension === "customGroup") continue;
                const key = record.classifications[dimension];
                if (key !== undefined) metadata[`${dimension}Id`] = lookupIds.get(JSON.stringify([dimension,key]));
              }
              await session.createInvestment(metadata,id);
            }
            ids[record.sourceKey] = id;
          }
          const records = [...dataset.records].sort((a,b) => compare(a.sourceKey,b.sourceKey));
          for (const record of records) {
            const common = { householdId: mapping.householdId, source: "import" as const };
            if (record.kind === "contribution" || record.kind === "withdrawal") {
              ids[record.sourceKey] = (await session.portfolio.recordExternalAction({ ...common, investmentId: ids[record.investmentKey], kind: record.kind, effectiveDate: record.effectiveDate, amount: record.amount })).id;
            } else if (record.kind === "transfer") {
              ids[record.sourceKey] = (await session.portfolio.recordTransfer({ ...common, sourceInvestmentId: ids[record.sourceInvestmentKey], destinationInvestmentId: ids[record.destinationInvestmentKey], effectiveDate: record.effectiveDate, amount: record.amount })).id;
            }
          }
          for (const record of records) if (record.kind === "valuation") ids[record.sourceKey] = (await session.portfolio.recordValuationMark({ householdId: mapping.householdId, investmentId: ids[record.investmentKey], asOfDate: record.asOfDate, grossValue: record.grossValue, debt: record.debt, source: "import" })).id;
          for (const record of investmentRecords(input)) if (record.status === "closed" && !mappedInvestment(input, record.sourceKey)) await session.portfolio.closeInvestment(mapping.householdId,ids[record.sourceKey],record.closedOn!);
          return { datasetId: dataset.datasetId, householdId: mapping.householdId, ids, counts: plan.counts };
        });
      } catch (error) { if (error instanceof MigrationError) throw error; throw new MigrationError("write_failed"); }
    },
  };
}
