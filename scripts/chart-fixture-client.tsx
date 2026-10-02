import { createRoot } from "react-dom/client";
import { calculateValueSeries, calculateCompositionSeries } from "../src/domain/analytics/series";
import { canonicalSources, ids, investment, fixtureId } from "../src/domain/analytics/testing/canonical-fixture";
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
const many = {
  investments: Array.from({ length: 9 }, (_, index) => investment(fixtureId(100 + index), "Example bucket " + (index + 1))),
  marks: Array.from({ length: 9 }, (_, index) => ({
    id: fixtureId(200 + index), investmentId: fixtureId(100 + index), asOfDate: end,
    grossValue: String((index + 1) * 100), debt: "0",
  })),
};
const signed = {
  investments: [investment(fixtureId(300), "Positive A"), investment(fixtureId(301), "Signed B"), investment(fixtureId(302), "Positive C")],
  marks: [start, "2026-07-01", end].flatMap((date, observation) =>
    [200, [-60, 20, -50][observation], 100].map((nav, bucket) => ({
      id: fixtureId(400 + observation * 3 + bucket), investmentId: fixtureId(300 + bucket), asOfDate: date,
      grossValue: String(Math.max(nav, 0)), debt: String(Math.max(-nav, 0)),
    }))),
};
createRoot(document.getElementById("root")!).render(<main className="app-shell">
  <h1>Synthetic chart validation</h1>
  <div data-testid="complete"><ValueTrendChart series={calculateValueSeries(sources, start, end)} allowMeasureSwitch />
    <CompositionChart seriesByGrouping={compositions(positive)} /></div>
  <div data-testid="negative"><ValueTrendChart series={calculateValueSeries(sources, start, end, { investmentIds: [ids.negative] })} />
    <CompositionChart seriesByGrouping={compositions(sources)} /></div>
  <div data-testid="partial"><ValueTrendChart series={calculateValueSeries(partial, start, end)} />
    <CompositionChart seriesByGrouping={compositions(partial)} /></div>
  <div data-testid="sparse"><ValueTrendChart series={calculateValueSeries(sources, end, end)} /></div>
  <div data-testid="many"><CompositionChart seriesByGrouping={{ investment: calculateCompositionSeries(many, start, end, "investment") }} /></div>
  <div data-testid="signed"><CompositionChart seriesByGrouping={{ investment: calculateCompositionSeries(signed, start, end, "investment") }} /></div>
  <div data-testid="empty"><ValueTrendChart series={calculateValueSeries(sources, "2026-08-01", "2026-09-01")} /></div>
</main>);
