export type ActionKind = "contribution" | "withdrawal" | "transfer";
export type Provenance = { source?: "manual" | "import" | "system"; sourceReference?: string; notes?: string };
export type EconomicAction = {
  id: string; householdId: string; kind: ActionKind; effectiveDate: string; amount: string;
} & Provenance;
export type Movement = {
  id: string; householdId: string; actionId: string; investmentId: string;
  role: "external" | "source" | "destination"; direction: "in" | "out"; amount: string;
};
export type ValuationMark = {
  id: string; householdId: string; investmentId: string; asOfDate: string;
  grossValue: string; debt: string;
} & Provenance;

/** Financial dates are calendar dates, never instants. */
export function assertCalendarDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Expected a YYYY-MM-DD calendar date.");
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
    throw new Error("Invalid calendar date.");
  }
}

export function parseCents(value: string, allowZero = false): bigint {
  if (!/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(value)) {
    throw new Error("Expected a nonnegative USD amount with at most two decimal places.");
  }
  const [whole, fraction = ""] = value.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (!allowZero && cents === 0n) throw new Error("Amount must be positive.");
  return cents;
}

export function formatCents(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

export function netValue(grossValue: string, debt: string): string {
  return formatCents(parseCents(grossValue, true) - parseCents(debt, true));
}
