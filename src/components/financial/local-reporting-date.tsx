import { ChartReportingDate } from "@/components/charts/reporting-date";
import { SurfaceState } from "./primitives";

/** Reuse chart date synchronization before requesting dated summary analytics. */
export function LocalReportingDate({ pathname, range, scopeQuery }: { pathname: "/" | "/updates"; range?: string; scopeQuery?: string }) {
  return <><ChartReportingDate resolvePath={pathname} range={range} scopeQuery={scopeQuery} />
    <SurfaceState kind="loading" title="Loading your investment context">Using your local calendar date.</SurfaceState></>;
}
