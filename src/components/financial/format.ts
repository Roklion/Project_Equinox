import { parseSignedCents } from "@/domain/financial";

/** Display exact cents without converting monetary amounts to floating point. */
export function formatMoney(cents: bigint, signed = false): string {
  const magnitude = cents < 0n ? -cents : cents;
  const whole = (magnitude / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (magnitude % 100n).toString().padStart(2, "0");
  return `${cents < 0n ? "−" : signed && cents > 0n ? "+" : ""}$${whole}.${fraction}`;
}

/** Adapter for existing entry/history contracts that expose exact USD decimals. */
export function formatDecimalMoney(value: string): string {
  return formatMoney(parseSignedCents(value));
}

/** Calendar dates stay calendar dates; formatting never shifts their timezone. */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(date + "T00:00:00Z"));
}
