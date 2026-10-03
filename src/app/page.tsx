import Link from "next/link";
import { withAnalyticsService } from "@/app/add/entry-data";
import { LocalReportingDate } from "@/components/financial/local-reporting-date";
import { SurfaceState } from "@/components/financial/primitives";
import { optionalDate, overviewRange, periodStart, singleParam, type PageQuery } from "@/components/financial/reporting-context";
import { Overview } from "@/components/overview/overview";
import { queryOverview } from "@/application/overview";
import { scopeSelection, snapshotScope, scopeParams } from "@/components/overview/reporting-scope";

export const dynamic = "force-dynamic";
export default async function HomePage({ searchParams }: { searchParams: Promise<PageQuery> }) {
  const query = await searchParams;
  const range = overviewRange(query.range);
  const selection = scopeSelection(query);
  if (!singleParam(query.date)) return <LocalReportingDate pathname="/" range={range} scopeQuery={scopeParams(selection).toString()} />;
  let data;
  try {
    const date = optionalDate(query.date)!;
    const start = periodStart(date, range);
    data = await withAnalyticsService(async ({ householdId, analytics, service }) => {
      const [overview, choices, investments] = await Promise.all([
        queryOverview(analytics, householdId, date, start, snapshotScope(selection)),
        service.getInvestmentChoices(householdId), service.getInvestments(householdId),
      ]);
      return { ...overview, choices: { ...choices, investments: investments.map(({ id, name }) => ({ id, label: name })) } };
    });
  } catch {
    const retry = new URLSearchParams(scopeParams(selection));
    if (singleParam(query.date)) retry.set("date", singleParam(query.date)!);
    retry.set("range", range);
    return <><h1>Overview</h1><SurfaceState kind="error" title="Overview could not be loaded" action={<Link href={"/?" + retry}>Try again</Link>}>
      Check the reporting date and try again. Your records have not changed.</SurfaceState></>;
  }

  if (!data) return <><h1>Overview</h1><SurfaceState kind="empty" title="Household setup needed">Configure one household and its owners before recording investments.</SurfaceState></>;
  return <Overview data={data} range={range} selection={selection} choices={data.choices} />;
}
