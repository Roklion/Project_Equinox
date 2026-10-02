import type { LineSeriesOption } from "echarts/charts";
import { compositionData, trendData, type CompositionSeries } from "./model";

export type PlotSeries = LineSeriesOption & { paletteIndex?: number; totalNav?: boolean };

/** Signed stacking is chart geometry only; the total line uses supplied analytics. */
export function compositionPlotSeries(points: CompositionSeries["points"], universe = points): PlotSeries[] {
  const mapped = compositionData(points, universe);
  const bands: PlotSeries[] = mapped.segments.flatMap((segment, index) => {
    const last = segment.data.at(-1)?.[1];
    return (segment.data.some((item) => item[1] !== null && item[1]! < 0) ? [false, true] : [false]).map((negative) => ({
      name: segment.label, type: "line", step: "end", smooth: false, connectNulls: false,
      paletteIndex: index, stack: "nav", stackStrategy: "all", z: negative ? 3 : 2,
      symbolSize: 5, showSymbol: true, lineStyle: { width: 1.5 },
      endLabel: { show: negative ? typeof last === "number" && last < 0 : typeof last === "number" && last >= 0,
        formatter: () => String(index + 1), distance: 4, color: "inherit" },
      labelLayout: { moveOverlap: "shiftY" },
      areaStyle: { opacity: negative ? 0.35 : 0.6 },
      itemStyle: negative ? { decal: { symbol: "rect", dashArrayX: [1, 0], dashArrayY: [2, 5],
        rotation: -Math.PI / 4, color: "rgba(0, 0, 0, 0.55)" } } : undefined,
      // Zero in the other half keeps one continuous signed stack at each date.
      // Nulls stay gaps in both halves when the authoritative total is unavailable.
      data: segment.data.map(([date, value]) => [date, value === null ? null
        : negative ? Math.min(value, 0) : Math.max(value!, 0)]),
    }));
  });
  if (mapped.negative) bands.push({
    name: "Total NAV", type: "line", totalNav: true, z: 4, step: "end", connectNulls: false,
    showSymbol: false, lineStyle: { width: 2.5, type: "dashed" }, data: trendData(points, "navCents"),
  });
  return bands;
}
