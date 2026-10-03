import { assertCalendarDate } from "@/domain/financial";
import type { ClassificationDimension, ConstituentSnapshot } from "@/domain/analytics/snapshot";

export type BrowseDimension = ClassificationDimension | "owner" | "group";
export type BrowseQuery = { date?: string; lifecycle?: string } & Partial<Record<BrowseDimension, string>>;
export function reportingDate(date?: string) {
  const value = date || new Date().toISOString().slice(0, 10);
  assertCalendarDate(value);
  return value;
}
/** Display selection only; financial values remain the supplied authoritative snapshot. */
export function browseInvestments(items: readonly ConstituentSnapshot[], query: BrowseQuery) {
  return items.filter(({ investment: item }) =>
    (query.lifecycle === "all" || item.status === (query.lifecycle === "closed" ? "closed" : "active"))
    && (!query.assetClass || item.classifications.assetClass?.id === query.assetClass)
    && (!query.accountType || item.classifications.accountType?.id === query.accountType)
    && (!query.taxStatus || item.classifications.taxStatus?.id === query.taxStatus)
    && (!query.liquidity || item.classifications.liquidity?.id === query.liquidity)
    && (!query.institution || item.classifications.institution?.id === query.institution)
    && (!query.owner || item.owners.some((owner) => owner.id === query.owner))
    && (!query.group || item.customGroups.some((group) => group.id === query.group)))
    .sort((a, b) => a.investment.name.localeCompare(b.investment.name) || a.investment.id.localeCompare(b.investment.id));
}
export function browseChoices(items: readonly ConstituentSnapshot[], dimension: BrowseDimension) {
  const values = items.flatMap(({ investment }) => dimension === "owner" ? investment.owners
    : dimension === "group" ? investment.customGroups
    : investment.classifications[dimension] ? [investment.classifications[dimension]!] : []);
  return [...new Map(values.map((item) => [item.id, item])).values()]
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}
