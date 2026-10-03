import type { ImportMapping, ImportManifest } from "@/application/migration-ports";
import type { ReconciliationRule } from "@/application/reconciliation";
import { classificationDimensions } from "@/domain/migration/validate";

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && !!v.trim();
const uuid = (v: unknown): v is string => typeof v === "string" && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);
const only = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(k => keys.includes(k));
const measures = ["grossValue", "debt", "nav", "contributions", "distributions", "pnl", "historicalValue", "moic", "xirr"];
export const countKeys = ["investments", "existingInvestments", "classifications", "contributions", "withdrawals", "transfers", "valuations", "closures"];

/** JSON structural boundaries only; financial validation belongs to the existing services. */
export function readImportMapping(v: unknown): ImportMapping {
  if (!object(v) || !only(v, ["householdId", "owners", "classifications", "investments"]) || !uuid(v.householdId)
    || !object(v.owners) || !Object.values(v.owners).every(uuid) || !object(v.classifications)
    || !Object.entries(v.classifications).every(([dimension, entries]) => classificationDimensions.includes(dimension as typeof classificationDimensions[number])
      && object(entries) && Object.values(entries).every(target => object(target) && (only(target, ["canonicalId"]) && uuid(target.canonicalId)
        || only(target, ["normalizedLabel"]) && text(target.normalizedLabel) && target.normalizedLabel === target.normalizedLabel.trim())))
    || v.investments !== undefined && (!object(v.investments) || !Object.values(v.investments).every(id => id === null || uuid(id)))) throw new Error("invalid_target_mapping");
  return v as ImportMapping;
}
export function readManifest(v: unknown): ImportManifest {
  if (!object(v) || !only(v, ["datasetId", "householdId", "ids", "counts"]) || !text(v.datasetId) || !uuid(v.householdId)
    || !object(v.ids) || !Object.values(v.ids).every(uuid) || !object(v.counts) || !only(v.counts, countKeys)
    || !countKeys.every(k => typeof v.counts === "object" && v.counts !== null && Number.isSafeInteger((v.counts as Record<string, unknown>)[k]) && ((v.counts as Record<string, number>)[k] >= 0))) throw new Error("invalid_manifest");
  return v as ImportManifest;
}
export function readRules(v: unknown): ReconciliationRule[] {
  if (!Array.isArray(v) || !v.every(r => object(r) && only(r, ["sourceDefinitionTag", "measure", "code", "note"])
    && text(r.sourceDefinitionTag) && typeof r.measure === "string" && measures.includes(r.measure) && text(r.code)
    && (r.note === undefined || typeof r.note === "string"))) throw new Error("invalid_annotations");
  return v as ReconciliationRule[];
}
