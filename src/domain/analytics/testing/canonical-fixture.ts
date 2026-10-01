import type { AnalyticsAction, CashFlowSources } from "../cash-flow";
import type { AnalyticsInvestment, AnalyticsMark } from "../snapshot";

// Invented USD examples. IDs also work in the canonical PostgreSQL UUID columns.
export const fixtureId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const startDate = "2021-01-01";
export const middleDate = "2022-01-01";
export const endDate = "2023-01-01"; // Two exact 365-day years.
export const ownerA = { id: fixtureId(1), label: "Owner A" };
export const ownerB = { id: fixtureId(2), label: "Owner B" };
export const groupA = { id: fixtureId(3), label: "Group A" };
export const groupB = { id: fixtureId(4), label: "Group B" };
export const ids = { active: fixtureId(10), closed: fixtureId(11), partial: fixtureId(12),
  leveraged: fixtureId(13), negative: fixtureId(14), missing: fixtureId(15) };

export function investment(id: string, name = "Example investment"): AnalyticsInvestment {
  return { id, name, status: "active", closedOn: null, owners: [ownerA], customGroups: [],
    classifications: { assetClass: null, accountType: null, taxStatus: null, liquidity: null, institution: null } };
}
export function external(id: string, investmentId: string, kind: "contribution" | "withdrawal",
  effectiveDate: string, amount: string): AnalyticsAction {
  return { id, kind, effectiveDate, amount,
    movements: [{ investmentId, role: "external", direction: kind === "contribution" ? "in" : "out", amount }] };
}

/** Compact ledger with independently specified expectations below, not production calculations. */
export function canonicalSources(): CashFlowSources {
  const active = investment(ids.active, "Active example");
  active.owners = [ownerB, ownerA]; // Deliberately unsorted joint ownership.
  active.classifications.assetClass = { id: fixtureId(70), label: "Example market assets" };
  active.customGroups = [groupA, groupB]; // Deliberately overlapping filters.
  const closed = investment(ids.closed, "Realized example");
  closed.status = "closed";
  closed.closedOn = endDate;
  const partial = investment(ids.partial, "Partial realization example");
  partial.owners = [ownerA, ownerB];
  partial.classifications.assetClass = active.classifications.assetClass;
  const leveraged = investment(ids.leveraged, "Leveraged example");
  leveraged.classifications.assetClass = { id: fixtureId(71), label: "Example property assets" };
  const negative = investment(ids.negative, "Negative equity example");
  const marks: AnalyticsMark[] = [
    { id: fixtureId(20), investmentId: ids.active, asOfDate: startDate, grossValue: "100", debt: "0" },
    { id: fixtureId(21), investmentId: ids.closed, asOfDate: startDate, grossValue: "200", debt: "0" },
    { id: fixtureId(22), investmentId: ids.partial, asOfDate: startDate, grossValue: "100", debt: "0" },
    { id: fixtureId(23), investmentId: ids.leveraged, asOfDate: startDate, grossValue: "400", debt: "100" },
    { id: fixtureId(24), investmentId: ids.negative, asOfDate: startDate, grossValue: "50", debt: "0" },
    { id: fixtureId(25), investmentId: ids.leveraged, asOfDate: middleDate, grossValue: "400", debt: "100" },
    { id: fixtureId(26), investmentId: ids.active, asOfDate: endDate, grossValue: "121", debt: "0" },
    { id: fixtureId(27), investmentId: ids.closed, asOfDate: endDate, grossValue: "0", debt: "0" },
    { id: fixtureId(28), investmentId: ids.partial, asOfDate: endDate, grossValue: "206.80", debt: "0" },
    { id: fixtureId(29), investmentId: ids.negative, asOfDate: endDate, grossValue: "20", debt: "40" },
  ];
  const actions = [
    external(fixtureId(30), ids.active, "contribution", startDate, "100"),
    external(fixtureId(31), ids.closed, "contribution", startDate, "200"),
    external(fixtureId(32), ids.partial, "contribution", startDate, "100"),
    external(fixtureId(33), ids.leveraged, "contribution", startDate, "300"),
    external(fixtureId(34), ids.negative, "contribution", startDate, "50"),
    external(fixtureId(35), ids.partial, "contribution", middleDate, "100"),
    external(fixtureId(36), ids.partial, "withdrawal", middleDate, "22"),
    external(fixtureId(37), ids.closed, "withdrawal", endDate, "288"),
  ];
  return { investments: [active, closed, partial, leveraged, negative], marks, actions };
}

// All monetary expectations are literal cents. Check by hand:
// active: 100 * 1.1^2 = 121; closed: 200 * 1.2^2 = 288, then zero NAV.
// partial: 100 * 1.1^2 + (100 - 22) * 1.1 = 206.80.
// leveraged: 400 - 100 = 300; negative: 20 - 40 = -20.
export const expectedInvestments = [
  { id: ids.active, gross: 12100n, debt: 0n, nav: 12100n, contributions: 10000n, distributions: 0n, pnl: 2100n, moic: 1.21, rate: 0.1 },
  { id: ids.closed, gross: 0n, debt: 0n, nav: 0n, contributions: 20000n, distributions: 28800n, pnl: 8800n, moic: 1.44, rate: 0.2 },
  { id: ids.partial, gross: 20680n, debt: 0n, nav: 20680n, contributions: 20000n, distributions: 2200n, pnl: 2880n, moic: 1.144, rate: 0.1 },
  { id: ids.leveraged, gross: 40000n, debt: 10000n, nav: 30000n, contributions: 30000n, distributions: 0n, pnl: 0n, moic: 1, rate: 0 },
  { id: ids.negative, gross: 2000n, debt: 4000n, nav: -2000n, contributions: 5000n, distributions: 0n, pnl: -7000n, moic: -0.4, rate: null },
];
export const expectedHousehold = { gross: 74780n, debt: 14000n, nav: 60780n,
  contributions: 85000n, distributions: 31000n, pnl: 6780n,
  beginningNav: 75000n, navChange: -14220n, periodNetFlow: -21000n };

/** A pure transfer changes neither household capital nor performance. */
export function transferSources(): CashFlowSources {
  const source = investment(ids.active, "Transfer source");
  const destination = investment(ids.leveraged, "Transfer destination");
  return { investments: [source, destination], marks: [
    { id: fixtureId(40), investmentId: source.id, asOfDate: startDate, grossValue: "100", debt: "0" },
    { id: fixtureId(41), investmentId: destination.id, asOfDate: startDate, grossValue: "0", debt: "0" },
    { id: fixtureId(42), investmentId: source.id, asOfDate: endDate, grossValue: "60", debt: "0" },
    { id: fixtureId(43), investmentId: destination.id, asOfDate: endDate, grossValue: "40", debt: "0" },
  ], actions: [external(fixtureId(44), source.id, "contribution", startDate, "100"),
    { id: fixtureId(45), kind: "transfer", effectiveDate: middleDate, amount: "40", movements: [
      { investmentId: source.id, role: "source", direction: "out", amount: "40" },
      { investmentId: destination.id, role: "destination", direction: "in", amount: "40" },
    ] }] };
}
