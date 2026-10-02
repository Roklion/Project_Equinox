import { ChartReportingDate } from "@/components/charts/reporting-date";
import { SurfaceState } from "./primitives";

/** Reuse chart date synchronization before requesting dated summary analytics. */
export function LocalReportingDate({ pathname, range }: { pathname: "/" | "/updates"; range?: string }) {
  return <><ChartReportingDate resolvePath={pathname} range={range} />
    <SurfaceState kind="loading" title="Loading your investment context">Using your local calendar date.</SurfaceState></>;
}
