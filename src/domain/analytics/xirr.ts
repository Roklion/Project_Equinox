import { assertCalendarDate } from "@/domain/financial";
import type { MetricResult } from "./contracts";

export type DatedReturnFlow = { effectiveDate: string; amountCents: bigint };

// Rates are fractions: -99.99% through 100,000,000%, inclusive.
export const XIRR_POLICY = {
  minRate: -0.9999, maxRate: 1_000_000,
  logRateTolerance: 1e-12, residualTolerance: 1e-12, rootMergeTolerance: 1e-9,
} as const;

type Term = { years: number; coefficient: number };

/** Scale each evaluation by its largest absolute term to avoid exponential overflow.
 * The result is NPV / sum(abs(discounted flows)), with the same zeros and signs.
 */
function evaluate(terms: readonly Term[], x: number): number {
  const logs = terms.map((term) => Math.log(Math.abs(term.coefficient)) - term.years * x);
  const largest = Math.max(...logs);
  let sum = 0;
  let magnitude = 0;
  let compensation = 0;
  terms.forEach((term, index) => {
    const absolute = Math.exp(logs[index] - largest);
    const adjusted = Math.sign(term.coefficient) * absolute - compensation;
    const next = sum + adjusted;
    compensation = (next - sum) - adjusted;
    sum = next;
    magnitude += absolute;
  });
  return sum / magnitude;
}

function bisect(terms: readonly Term[], left: number, right: number): number {
  let leftValue = evaluate(terms, left);
  // The full bounded log-rate interval needs fewer than 50 halvings at this tolerance.
  for (let iteration = 0; iteration < 64; iteration++) {
    const middle = (left + right) / 2;
    const value = evaluate(terms, middle);
    if (value === 0 || right - left <= XIRR_POLICY.logRateTolerance) return middle;
    if (Math.sign(value) === Math.sign(leftValue)) {
      left = middle;
      leftValue = value;
    } else right = middle;
  }
  return (left + right) / 2;
}

/** Isolate roots of an exponential polynomial on a bounded log-rate domain.
 * Divide out the earliest exponential (positive, so roots are unchanged).
 * Its derivative has one fewer term. Recursively find derivative roots to split
 * the domain into monotone intervals, then bisect every sign-change bracket.
 * This also detects close roots that a fixed sampling grid could miss.
 */
function isolateRoots(input: readonly Term[], left: number, right: number): number[] {
  if (input.length < 2 || input.every((term) => term.coefficient > 0)
    || input.every((term) => term.coefficient < 0)) return [];
  const firstYears = input[0].years;
  const terms = input.map((term) => ({ ...term, years: term.years - firstYears }));
  const derivative = terms.slice(1).map((term) => ({
    years: term.years, coefficient: -term.years * term.coefficient,
  }));
  const scale = Math.max(...derivative.map((term) => Math.abs(term.coefficient)));
  const stationary = isolateRoots(derivative.map((term) => ({
    ...term, coefficient: term.coefficient / scale,
  })), left, right);
  const points = [left, ...stationary, right];
  const values = points.map((x) => evaluate(terms, x));
  const roots: number[] = [];
  points.forEach((point, index) => {
    if (Math.abs(values[index]) <= XIRR_POLICY.residualTolerance) roots.push(point);
    if (index > 0 && Math.sign(values[index - 1]) !== Math.sign(values[index])
      && values[index - 1] !== 0 && values[index] !== 0) {
      roots.push(bisect(terms, points[index - 1], point));
    }
  });
  return roots.sort((a, b) => a - b).filter((root, index, sorted) =>
    index === 0 || root - sorted[index - 1] > XIRR_POLICY.rootMergeTolerance);
}

/** Same-day investor flows are netted in bigint cents before normalization.
 * A usable stream needs opposite signs on distinct dates. An identically zero
 * stream has no identifiable annualized return and is unavailable.
 */
export function solveXirr(flows: readonly DatedReturnFlow[]): MetricResult<number> {
  const byDate = new Map<string, bigint>();
  for (const flow of flows) {
    assertCalendarDate(flow.effectiveDate);
    byDate.set(flow.effectiveDate, (byDate.get(flow.effectiveDate) ?? 0n) + flow.amountCents);
  }
  const dated = [...byDate].filter(([, cents]) => cents !== 0n).sort(([a], [b]) => a.localeCompare(b));
  if (!dated.some(([, cents]) => cents < 0n) || !dated.some(([, cents]) => cents > 0n)) {
    return { status: "unavailable", reason: "no_sign_change" };
  }
  const scale = dated.reduce((largest, [, cents]) => {
    const absolute = cents < 0n ? -cents : cents;
    return absolute > largest ? absolute : largest;
  }, 0n);
  const firstDay = Date.parse(dated[0][0] + "T00:00:00Z");
  const terms = dated.map(([date, cents]) => ({
    years: (Date.parse(date + "T00:00:00Z") - firstDay) / (86_400_000 * 365),
    coefficient: Number(cents) / Number(scale),
  }));
  const roots = isolateRoots(terms, Math.log1p(XIRR_POLICY.minRate), Math.log1p(XIRR_POLICY.maxRate));
  if (roots.length === 0) return { status: "unavailable", reason: "no_root" };
  if (roots.length > 1) return { status: "unavailable", reason: "multiple_roots" };
  return { status: "available", value: Math.expm1(roots[0]) };
}
