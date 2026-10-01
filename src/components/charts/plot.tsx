"use client";
import { useEffect, useRef, type PointerEvent } from "react";
import { init, use as register, type EChartsCoreOption } from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { Snapshot } from "@/domain/analytics/snapshot";
import { nearestPoint, selectedFraction, timestamp } from "./model";
register([LineChart, GridComponent, SVGRenderer]);

export function HistoryPlot({ points, selected, onSelect, series }: {
  points: readonly Snapshot[]; selected: number; onSelect: (index: number) => void;
  series: EChartsCoreOption["series"];
}) {
  const host = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; horizontal: boolean } | null>(null);
  useEffect(() => {
    if (!host.current || !points.length) return;
    const colors = getComputedStyle(host.current);
    const chart = init(host.current, undefined, { renderer: "svg" });
    const first = timestamp(points[0].asOfDate), last = timestamp(points.at(-1)!.asOfDate);
    chart.setOption({
      animation: false, useUTC: true,
      color: Array.from({ length: 8 }, (_, i) => colors.getPropertyValue("--chart-series-" + (i + 1)).trim()),
      grid: { left: 56, right: 16, top: 16, bottom: 40 },
      xAxis: { type: "time", min: first === last ? first - 86400000 : first,
        max: first === last ? last + 86400000 : last, splitNumber: 3,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: colors.getPropertyValue("--color-muted"), hideOverlap: true } },
      yAxis: { type: "value", axisLabel: { color: colors.getPropertyValue("--color-muted"),
        formatter: (value: number) => new Intl.NumberFormat("en-US", { notation: "compact", style: "currency", currency: "USD", maximumFractionDigits: 1 }).format(value) },
        splitLine: { lineStyle: { color: colors.getPropertyValue("--color-border") } } },
      series,
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(host.current);
    return () => { observer.disconnect(); chart.dispose(); };
  }, [points, series]);
  function inspect(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    onSelect(nearestPoint(points, (event.clientX - box.left - 56) / (box.width - 72)));
  }
  return <div className="history-plot" aria-hidden="true"
    onPointerDown={(event) => {
      if (event.pointerType !== "mouse") gesture.current = { x: event.clientX, y: event.clientY, horizontal: false };
      inspect(event);
    }}
    onPointerMove={(event) => {
      if (event.pointerType === "mouse") { inspect(event); return; }
      const start = gesture.current;
      if (!start) return;
      const dx = Math.abs(event.clientX - start.x), dy = Math.abs(event.clientY - start.y);
      if (!start.horizontal && dy > dx && dy > 8) { gesture.current = null; return; }
      if (dx > 8 && dx > dy) {
        start.horizontal = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      if (start.horizontal) inspect(event);
    }}
    onPointerUp={() => { gesture.current = null; }}
    onPointerCancel={() => { gesture.current = null; }}>
    <div ref={host} className="history-renderer" />
    {points.length > 0 && <div className="history-crosshair" style={{
      left: "calc(56px + (100% - 72px) * " + selectedFraction(points, selected) + ")",
    }} />}
  </div>;
}
