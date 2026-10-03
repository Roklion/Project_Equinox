import { assertCalendarDate, formatCents } from "@/domain/financial";
import type { MetricResult } from "@/domain/analytics/contracts";
import type { SourceExpectation, MigrationDataset } from "@/domain/migration/contracts";
import { compare } from "@/domain/migration/validate";
import { createAnalyticsService } from "./analytics";
import type { AnalyticsRepository } from "./analytics-ports";
import type { ImportManifest } from "./migration-ports";

export const RECONCILIATION_TOLERANCE = { absolute: 1e-8, relative: 1e-8 } as const;
export type ReconciliationRule = { sourceDefinitionTag: string; measure: SourceExpectation["measure"]; code: string; note?: string };
export type ComparedResult = {status:"available";value:string | number} | {status:"missing" | "not_computable" | "incomplete" | "unavailable";reason?:string;missingInvestmentIds?:string[]};
export type ReconciliationStatus = "match" | "source_unavailable" | "equinox_unavailable" | "mapping_mismatch" | "definition_mismatch" | "numeric_difference";
export type ReconciliationRecord = {
  sourceKey: string; scopeKey: string; canonicalInvestmentIds: string[]; measure: SourceExpectation["measure"];
  timing: SourceExpectation["timing"]; historicalComponent?: "grossValue" | "debt" | "nav"; source: ComparedResult; equinox: ComparedResult;
  difference?: string | number; status: ReconciliationStatus; explanation?: {code:string;note?:string};
};
function monetary(result: MetricResult<bigint>): ComparedResult {
  return result.status === "available" ? {status:"available",value:formatCents(result.value)} : result;
}
function cents(text: string): bigint {
  if (!/^-?(0|[1-9]\d*)(\.\d{1,2})?$/.test(text)) throw new Error("Invalid normalized reconciliation money.");
  const negative = text.startsWith("-"); const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2,"0"))) * (negative ? -1n : 1n);
}
/** Compares only; all financial results come from the existing analytics service. */
export function createReconciliationService(repository: AnalyticsRepository) {
  const analytics = createAnalyticsService(repository);
  return {
    async reconcile(dataset: Pick<MigrationDataset,"datasetId" | "scopes" | "expectations">, manifest: ImportManifest, rules: readonly ReconciliationRule[] = []): Promise<ReconciliationRecord[]> {
      if (manifest.datasetId !== dataset.datasetId) throw new Error("Reconciliation dataset does not match its manifest.");
      const ruleKeys = rules.map(r => JSON.stringify([r.sourceDefinitionTag,r.measure]));
      if (new Set(ruleKeys).size !== rules.length || rules.some(r => !r.code.trim() || !r.sourceDefinitionTag.trim())) throw new Error("Reconciliation annotations are ambiguous or invalid.");
      const records: ReconciliationRecord[] = [];
      for (const expectation of [...dataset.expectations].sort((a,b) => compare(a.sourceKey,b.sourceKey))) {
        const {timing,measure} = expectation;
        if (measure === "historicalValue" && (timing.asOfDate === undefined || timing.startDate !== undefined || timing.endDate !== undefined)) throw new Error("Historical expectations require a single as-of date.");
        const endDate = timing.asOfDate ?? timing.endDate;
        assertCalendarDate(endDate);
        if (timing.startDate !== undefined) { assertCalendarDate(timing.startDate); if (timing.startDate > endDate) throw new Error("Invalid reconciliation period."); }
        const scope = dataset.scopes.find(s => s.sourceKey === expectation.scopeKey);
        const keys = scope ? scope.investmentKeys : [expectation.scopeKey];
        const ids = [...new Set(keys.map(key => Object.hasOwn(manifest.ids,key) ? manifest.ids[key] : undefined).filter((id): id is string => !!id))].sort(compare);
        const source = expectation.expected;
        let equinox: ComparedResult;
        let status: ReconciliationStatus;
        let difference: string | number | undefined;
        let explanation: ReconciliationRecord["explanation"];
        if (!keys.length || keys.some(key => !Object.hasOwn(manifest.ids,key)) || ids.length !== new Set(keys).size) {
          equinox = {status:"unavailable",reason:"unresolved_manifest_scope"}; status = "mapping_mismatch";
        } else {
          const selected = {investmentIds:ids};
          const snapshot = await analytics.snapshot(manifest.householdId,endDate,selected);
          if (snapshot.constituents.length !== ids.length) {
            equinox = {status:"unavailable",reason:"canonical_investment_missing"}; status = "mapping_mismatch";
          } else {
            if (measure === "grossValue" || measure === "debt" || measure === "nav" || measure === "historicalValue") {
              const component = measure === "historicalValue" ? expectation.historicalComponent ?? "nav" : measure;
              equinox = snapshot.totals.status === "available" ? {status:"available",value:formatCents(snapshot.totals.value[`${component}Cents`])} : snapshot.totals;
            } else if (timing.startDate !== undefined && (measure === "moic" || measure === "xirr")) {
              equinox = {status:"unavailable",reason:"period_return_not_defined"};
            } else if (measure === "moic" || measure === "xirr") {
              const result = await analytics.returns(manifest.householdId,endDate,selected);
              equinox = result[measure];
            } else {
              const result = timing.startDate !== undefined ? await analytics.period(manifest.householdId,timing.startDate,endDate,selected) : await analytics.inception(manifest.householdId,endDate,selected);
              if (measure === "contributions" || measure === "distributions") equinox = {status:"available",value:formatCents(result.cashFlows[`${measure}Cents`])};
              else if ("pnl" in result) equinox = monetary(result.pnl);
              else equinox = result.change.status === "available" ? {status:"available",value:formatCents(result.change.value.pnlCents)} : result.change;
            }
            const rule = rules.find(r => r.sourceDefinitionTag === expectation.sourceDefinitionTag && r.measure === measure);
            if (source.status === "available" && equinox.status === "available") {
              if (typeof source.value === "string" && typeof equinox.value === "string") {
                const delta = cents(equinox.value) - cents(source.value); difference = formatCents(delta);
                status = delta === 0n ? "match" : "mapping_mismatch";
              } else if (typeof source.value === "number" && typeof equinox.value === "number" && Number.isFinite(source.value) && Number.isFinite(equinox.value)) {
                const delta = equinox.value - source.value; difference = delta;
                status = Math.abs(delta) <= Math.max(RECONCILIATION_TOLERANCE.absolute, RECONCILIATION_TOLERANCE.relative * Math.max(Math.abs(equinox.value),Math.abs(source.value))) ? "match" : "numeric_difference";
              } else { status = "mapping_mismatch"; }
            } else if (source.status === "not_computable" && equinox.status === "unavailable" && source.reason !== undefined && source.reason === equinox.reason) status = "match";
            else if (source.status !== "available") status = "source_unavailable";
            else status = "equinox_unavailable";
            if (rule) { status = "definition_mismatch"; explanation = {code:rule.code,...(rule.note === undefined ? {} : {note:rule.note})}; }
            else if (equinox.status === "unavailable" && equinox.reason === "period_return_not_defined") status = "definition_mismatch";
          }
        }
        records.push({sourceKey:expectation.sourceKey,scopeKey:expectation.scopeKey,canonicalInvestmentIds:ids,measure,timing,...(measure === "historicalValue" ? {historicalComponent:expectation.historicalComponent ?? "nav"} : {}),source,equinox,status,...(difference === undefined ? {} : {difference}),...(explanation ? {explanation} : {})});
      }
      return records;
    },
  };
}
