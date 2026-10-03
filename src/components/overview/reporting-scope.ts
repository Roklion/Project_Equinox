import type { InvestmentChoices } from "@/application/ports";
import { classificationDimensions, type SnapshotScope, type IdentityLabel } from "@/domain/analytics/snapshot";
import type { PageQuery } from "@/components/financial/reporting-context";

export const scopeFields = [
  { key: "owner", label: "Owner", choices: "owners" },
  { key: "group", label: "Custom group", choices: "customGroups" },
  { key: "assetClass", label: "Asset class", choices: "assetClasses" },
  { key: "accountType", label: "Account type", choices: "accountTypes" },
  { key: "taxStatus", label: "Tax status", choices: "taxStatuses" },
  { key: "liquidity", label: "Liquidity", choices: "liquidities" },
  { key: "institution", label: "Institution", choices: "institutions" },
  { key: "investment", label: "Investment", choices: "investments" },
] as const;
export type ScopeKey = typeof scopeFields[number]["key"];
export type ScopeSelection = Partial<Record<ScopeKey, string[]>>;
export type ScopeChoices = InvestmentChoices & { investments: IdentityLabel[] };

/** Translate URL identities only; matching and financial semantics belong to analytics. */
export function scopeSelection(query: PageQuery): ScopeSelection {
  return Object.fromEntries(scopeFields.flatMap(({ key }) => {
    const raw = query[key];
    const ids = [...new Set((typeof raw === "string" ? [raw] : raw ?? []).filter(Boolean))].sort();
    return ids.length ? [[key, ids]] : [];
  }));
}
export function snapshotScope(selection: ScopeSelection): SnapshotScope {
  return {
    ...(selection.owner ? { ownerIds: selection.owner } : {}),
    ...(selection.group ? { customGroupIds: selection.group } : {}),
    ...(selection.investment ? { investmentIds: selection.investment } : {}),
    classifications: Object.fromEntries(classificationDimensions.flatMap((key) =>
      selection[key] ? [[key, selection[key]]] : [])),
  };
}
export function scopeParams(selection: ScopeSelection) {
  const params = new URLSearchParams();
  for (const { key } of scopeFields) for (const id of selection[key] ?? []) params.append(key, id);
  return params;
}
export function scopeLabel(selection: ScopeSelection, choices: ScopeChoices) {
  const labels = scopeFields.flatMap(({ key, label, choices: choiceKey }) => {
    const ids = selection[key];
    return ids?.length ? [label + ": " + ids.map((id) =>
      choices[choiceKey].find((choice) => choice.id === id)?.label ?? "Unavailable selection").join(" or ")] : [];
  });
  return labels.join(" · ") || "All tracked investments";
}
