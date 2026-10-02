import { expect, it } from "vitest";
import { init, use as register } from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { compositionPlotSeries } from "./composition-series";
import { calculateCompositionSeries } from "@/domain/analytics/series";
import { canonicalSources, ids, startDate, endDate } from "@/domain/analytics/testing/canonical-fixture";
register([LineChart, GridComponent, SVGRenderer]);

it("subtracts negative NAV in the renderer instead of creating a separate negative stack", () => {
  const points = calculateCompositionSeries(canonicalSources(), startDate, endDate, "investment").points;
  const options = compositionPlotSeries(points);
  const chart = init(null, undefined, { renderer: "svg", ssr: true, width: 600, height: 300 });
  try {
    chart.setOption({ animation: false, xAxis: { type: "time" }, yAxis: { type: "value" }, series: options });
    // Verify the renderer's actual cumulative coordinates, not just its configuration.
    const model = (chart as unknown as { getModel(): { getSeries(): { getData(): {
      getCalculationInfo(key: string): string; get(dimension: string, index: number): number;
    } }[] } }).getModel();
    let cumulative = 0;
    for (const [index, option] of options.filter((item) => !item.totalNav).entries()) {
      const values = option.data as number[][];
      cumulative += values.at(-1)![1];
      const data = model.getSeries()[index].getData();
      expect(data.get(data.getCalculationInfo("stackResultDimension"), points.length - 1)).toBeCloseTo(cumulative);
    }
    expect(cumulative).toBeCloseTo(607.8);
    expect(options.at(-1)!.data).toEqual(points.map((point) => [Date.parse(point.asOfDate + "T00:00:00Z"),
      point.totals.status === "available" ? Number(point.totals.value.navCents) / 100 : null]));
  } finally { chart.dispose(); }
});

it("patterns only the negative half of a bucket crossing zero and preserves missing-total gaps", () => {
  const points = calculateCompositionSeries(canonicalSources(), startDate, endDate, "investment").points;
  const options = compositionPlotSeries(points);
  const negativeIndex = points.at(-1)!.breakdown.toSorted((a, b) => a.key.localeCompare(b.key)).findIndex((bucket) => bucket.key === ids.negative);
  const halves = options.filter((option) => option.paletteIndex === negativeIndex);
  expect(halves).toHaveLength(2);
  expect(halves[0].itemStyle?.decal).toBeUndefined();
  expect(halves[1].itemStyle?.decal).toBeDefined();
  expect((halves[0].data as number[][]).map((item) => item[1])).toEqual([50, 50, 0]);
  expect((halves[1].data as number[][]).map((item) => item[1])).toEqual([0, 0, -20]);
  const missing = { ...canonicalSources(), marks: canonicalSources().marks.filter((mark) => mark.investmentId !== ids.partial) };
  const incomplete = calculateCompositionSeries(missing, startDate, endDate, "investment").points;
  for (const option of compositionPlotSeries(incomplete)) {
    expect((option.data as (number | null)[][]).every((item) => item[1] === null)).toBe(true);
  }
});
