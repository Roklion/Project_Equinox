"use client";
import { useId, useMemo, useState, type ReactNode } from "react";
import type { GroupingDimension, Snapshot } from "@/domain/analytics/snapshot";
import { AsOfDate, ChartFrame, HeadlineValue, MetricValue } from "@/components/financial/primitives";
import { formatDate, formatMoney } from "@/components/financial/format";
import { HistoryPlot } from "./plot";
import { compositionData, groupings, measures, trendData, visiblePoints,
  type CompositionSeries, type Measure, type Range, type ValueSeries } from "./model";

function Coverage({ point }: { point: Snapshot }) {
  return <div className="metric-context"><p>{point.totals.status === "available" ? "Complete valuation coverage" : "Incomplete valuation coverage"}
    {" · "}{point.coverage.valuedCount} of {point.coverage.selectedCount} investments valued</p>
    <details><summary>Constituent valuation dates</summary><ul>
      {point.constituents.map(({ investment, valuation }) => <li key={investment.id}>{investment.name}:{" "}
        {valuation.status === "available" ? <><time dateTime={valuation.value.markAsOfDate}>{formatDate(valuation.value.markAsOfDate)}</time>
          {valuation.value.ageDays > 0 && " · " + valuation.value.ageDays + " days old"}</> : "Valuation missing"}</li>)}
    </ul></details></div>;
}
function Inspector({ points, endDate, title, summary, series, controls, onPoint }: {
  points: ValueSeries["points"]; endDate: string; title: string;
  summary: (point: Snapshot) => ReactNode; series: React.ComponentProps<typeof HistoryPlot>["series"];
  controls?: ReactNode; onPoint?: (point: Snapshot) => ReactNode;
}) {
  const [date, setDate] = useState<string | null>(null);
  const id = useId();
  if (date !== null && !points.some((point) => point.asOfDate === date)) {
    setDate(points.at(-1)?.asOfDate ?? null);
  }
  const index = Math.max(0, date && points.some((point) => point.asOfDate === date)
    ? points.findIndex((point) => point.asOfDate === date) : points.length - 1);
  const point = points[index];
  return <ChartFrame title={title} summary={point ? <>{summary(point)}<Coverage point={point} /></>
    : <><p>No valuation observations in this range.</p><AsOfDate date={endDate} label="Range ends" /></>}>
    {controls}
    {point && <>
      <HistoryPlot points={points} selected={index} onSelect={(next) => setDate(points[next].asOfDate)} series={series} />
      <label className="chart-date-control" htmlFor={id}>Inspect recorded date
        <select id={id} value={point.asOfDate} onChange={(event) => setDate(event.target.value)}>
          {points.map((item) => <option key={item.asOfDate} value={item.asOfDate}>{formatDate(item.asOfDate)}
            {item.totals.status !== "available" ? " · incomplete" : ""}</option>)}
        </select>
      </label>
      <p className="metric-context">Hover or drag horizontally to inspect. Swipe vertically to scroll.
        {" "}Steps connect recorded snapshots; no intermediate observations are generated.
        {points.length === 1 && " Only one observation is available."}</p>
      {points.some((item) => item.totals.status !== "available") &&
        <p className="chart-coverage-note">Gaps indicate incomplete totals. Choose a recorded date to inspect its coverage.</p>}
      {onPoint?.(point)}
    </>}
  </ChartFrame>;
}
function RangeControls({ range, onChange }: { range: Range; onChange: (range: Range) => void }) {
  return <div className="chart-ranges" role="group" aria-label="Time range">
    {(["3M", "1Y", "All"] as const).map((item) =>
      <button type="button" key={item} aria-pressed={range === item} onClick={() => onChange(item)}>{item}</button>)}
  </div>;
}
/** Accepts authoritative application valueSeries outputs for any reporting scope. */
export function ValueTrendChart({ series, allowMeasureSwitch = false }: { series: ValueSeries; allowMeasureSwitch?: boolean }) {
  const [range, setRange] = useState<Range>("All");
  const [measure, setMeasure] = useState<Measure>("navCents");
  const id = useId();
  const points = useMemo(() => visiblePoints(series.points, series.endDate, range), [series, range]);
  const lines = useMemo(() => [{ name: measures[measure], type: "line", step: "end", smooth: false,
    connectNulls: false, symbolSize: 7, showSymbol: true, lineStyle: { width: 2 },
    areaStyle: { opacity: 0.06 }, data: trendData(points, measure) }], [points, measure]);
  return <Inspector points={points} endDate={series.endDate} title="Value over time" series={lines}
    summary={(point) => <HeadlineValue label={measures[measure]} asOfDate={point.asOfDate}
      result={point.totals.status === "available" ? { status: "available", value: point.totals.value[measure] } : point.totals} />}
    controls={<div className="chart-controls"><RangeControls range={range} onChange={setRange} />
      {allowMeasureSwitch && <label htmlFor={id}>Measure<select id={id} value={measure} onChange={(event) => setMeasure(event.target.value as Measure)}>
        {Object.entries(measures).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>}</div>} />;
}
/** Only additive compositionSeries outputs are offered; custom groups remain scope filters. */
export function CompositionChart({ seriesByGrouping }: {
  seriesByGrouping: Partial<Record<GroupingDimension, CompositionSeries>>;
}) {
  const supported = groupings.filter((group) => seriesByGrouping[group.value]);
  const [group, setGroup] = useState<GroupingDimension>(supported[0]?.value ?? "investment");
  const [range, setRange] = useState<Range>("All");
  const id = useId();
  const series = seriesByGrouping[group] ?? seriesByGrouping[supported[0]?.value];
  const points = useMemo(() => series ? visiblePoints(series.points, series.endDate, range) : [], [series, range]);
  const mapped = useMemo(() => compositionData(points, series?.points), [points, series]);
  const lines = useMemo(() => mapped.segments.map((segment, index) => ({
    name: segment.label, type: "line", step: "end", smooth: false, connectNulls: false,
    stack: mapped.negative ? undefined : "nav", symbolSize: 5, showSymbol: true,
    lineStyle: { width: mapped.negative ? 2 : 1 },
    endLabel: { show: true, formatter: () => String(index + 1), distance: 4, color: "inherit" },
    labelLayout: { moveOverlap: "shiftY" },
    areaStyle: mapped.negative ? undefined : { opacity: 0.55 }, data: segment.data,
  })), [mapped]);
  if (!series) return <p>No composition series supplied.</p>;
  return <Inspector points={points} endDate={series.endDate} title="Composition over time" series={lines}
    summary={(point) => <HeadlineValue label="Total net investment value" asOfDate={point.asOfDate}
      result={point.totals.status === "available" ? { status: "available", value: point.totals.value.navCents } : point.totals} />}
    controls={<div className="chart-controls"><RangeControls range={range} onChange={setRange} />
      <label htmlFor={id}>Group by<select id={id} value={series.groupBy} onChange={(event) => setGroup(event.target.value as GroupingDimension)}>
        {supported.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select></label></div>}
    onPoint={(point) => {
      const selected = points.find((item) => item.asOfDate === point.asOfDate)!;
      return <>{mapped.negative && <p className="chart-coverage-note">Negative segments are present. Separate lines replace stacking for this range; exact values remain below.</p>}
        <dl className="chart-segments">{mapped.segments.map((segment, index) => {
          const bucket = selected.breakdown.find((item) => item.key === segment.key);
          return <div key={segment.key}><dt><span className="chart-swatch" aria-hidden="true"
            style={{ backgroundColor: "var(--chart-series-" + (index % 8 + 1) + ")" }} />{index + 1}. {segment.label}</dt>
            <dd>{bucket ? <MetricValue result={bucket.totals.status === "available"
              ? { status: "available", value: bucket.totals.value.navCents } : bucket.totals} format={formatMoney} />
              : "Not in scope on this date"}</dd></div>;
        })}</dl></>;
    }} />;
}
