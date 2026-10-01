import { createRoot } from "react-dom/client";
import { calculateValueSeries, calculateCompositionSeries } from "../src/domain/analytics/series";
import { canonicalSources, ids } from "../src/domain/analytics/testing/canonical-fixture";
import { CompositionChart, ValueTrendChart } from "../src/components/charts/history-charts";
import { groupings } from "../src/components/charts/model";
const sources = canonicalSources();
for (const mark of sources.marks) mark.asOfDate = ({ "2021-01-01": "2026-01-01", "2022-01-01": "2026-07-01", "2023-01-01": "2026-10-01" })[mark.asOfDate]!;
for (const investment of sources.investments) if (investment.closedOn) investment.closedOn = "2026-10-01";
const start = "2026-01-01", end = "2026-10-01";
const positive = { ...sources, marks: sources.marks.map((mark) => ({ ...mark, debt: "0" })) };
const partial = { ...sources, marks: sources.marks.filter((mark) => !(mark.investmentId === ids.partial && mark.asOfDate === start)) };
const compositions = (input: typeof sources) => Object.fromEntries(groupings.map(({ value }) =>
  [value, calculateCompositionSeries(input, start, end, value)]));
createRoot(document.getElementById("root")!).render(<main className="app-shell">
  <h1>Synthetic chart validation</h1>
  <div data-testid="complete"><ValueTrendChart series={calculateValueSeries(sources, start, end)} allowMeasureSwitch />
    <CompositionChart seriesByGrouping={compositions(positive)} /></div>
  <div data-testid="negative"><ValueTrendChart series={calculateValueSeries(sources, start, end, { investmentIds: [ids.negative] })} />
    <CompositionChart seriesByGrouping={compositions(sources)} /></div>
  <div data-testid="partial"><ValueTrendChart series={calculateValueSeries(partial, start, end)} />
    <CompositionChart seriesByGrouping={compositions(partial)} /></div>
  <div data-testid="sparse"><ValueTrendChart series={calculateValueSeries(sources, end, end)} /></div>
  <div data-testid="empty"><ValueTrendChart series={calculateValueSeries(sources, "2026-08-01", "2026-09-01")} /></div>
</main>);
