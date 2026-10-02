import type { Metadata } from "next";
import Link from "next/link";
import { withAnalyticsService } from "@/app/add/entry-data";
import { LocalReportingDate } from "@/components/financial/local-reporting-date";
import { SurfaceState } from "@/components/financial/primitives";
import { optionalDate, singleParam, type PageQuery } from "@/components/financial/reporting-context";
import { UpdateCenter } from "@/components/updates/update-center";

export const metadata: Metadata = { title: "Update Center | Equinox" };
export const dynamic = "force-dynamic";
export default async function UpdateCenterPage({ searchParams }: { searchParams: Promise<PageQuery> }) {
  const query = await searchParams;
  if (!singleParam(query.date)) return <LocalReportingDate pathname="/updates" />;
  let snapshot;
  try {
    const date = optionalDate(query.date)!;
    snapshot = await withAnalyticsService(({ householdId, analytics }) => analytics.snapshot(householdId, date));
  } catch {
    return <><h1>Update Center</h1><SurfaceState kind="error" title="Valuation maintenance could not be loaded"
      action={<Link href="/updates">Try again</Link>}>Check the reporting date and try again. Your records have not changed.</SurfaceState></>;
  }

  if (!snapshot) return <><h1>Update Center</h1><SurfaceState kind="empty" title="Household setup needed">Configure one household and its owners before recording investments.</SurfaceState></>;
  return <UpdateCenter snapshot={snapshot} />;
}
