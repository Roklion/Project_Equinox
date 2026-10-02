import { assertCalendarDate } from "@/domain/financial";

export type PageQuery = Record<string, string | string[] | undefined>;
export function singleParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
export function optionalDate(value: string | string[] | undefined) {
  const date = singleParam(value);
  if (!date) return undefined;
  assertCalendarDate(date);
  return date;
}
export const overviewRanges = { ytd: "Year to date", "3m": "Last 3 months", "1y": "Last year" } as const;
export type OverviewRange = keyof typeof overviewRanges;
export function overviewRange(value: string | string[] | undefined): OverviewRange {
  const range = singleParam(value);
  return range && Object.hasOwn(overviewRanges, range) ? range as OverviewRange : "ytd";
}
/** Calendar ranges only; financial period semantics stay in the analytics service. */
export function periodStart(date: string, range: OverviewRange) {
  assertCalendarDate(date);
  if (range === "ytd") return date.slice(0, 4) + "-01-01";
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(0);
  target.setUTCFullYear(year, month - 1 - (range === "3m" ? 3 : 12), 1);
  const lastDay = new Date(target);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  target.setUTCDate(Math.min(day, lastDay.getUTCDate()));
  return target.toISOString().slice(0, 10);
}
