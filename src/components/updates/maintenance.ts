import type { ConstituentSnapshot } from "@/domain/analytics/snapshot";

export function maintenanceBand(item: ConstituentSnapshot) {
  if (item.valuation.status !== "available") return { key: "missing", label: "Missing valuation", priority: 0 };
  const age = item.valuation.value.ageDays;
  if (age > 90) return { key: "stale", label: "Stale valuation", priority: 1 };
  if (age > 30) return { key: "due", label: "Update due", priority: 2 };
  return { key: "recent", label: "Recent valuation", priority: 3 };
}
export function routineInvestments(items: readonly ConstituentSnapshot[], date: string) {
  return items.filter(({ investment }) => investment.status !== "closed" || (investment.closedOn !== null && investment.closedOn > date))
    .sort((a, b) => maintenanceBand(a).priority - maintenanceBand(b).priority
      || (b.valuation.status === "available" ? b.valuation.value.ageDays : 0) - (a.valuation.status === "available" ? a.valuation.value.ageDays : 0)
      || a.investment.name.localeCompare(b.investment.name) || a.investment.id.localeCompare(b.investment.id));
}
