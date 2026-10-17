import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import type { Config, Result } from "./engine";
import { copy, formatMoney, type Lang } from "./i18n";
echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  AriaComponent,
  CanvasRenderer,
]);
export const lineColors = {
  strategy: "#aacb94",
  sp500: "#88a9c6",
  nasdaq: "#d9b477",
};
export function seriesLabel(r: Result, lang: Lang) {
  return r.key === "sp500"
    ? copy[lang].sp
    : r.key === "nasdaq"
      ? copy[lang].nas
      : r.label;
}
export default function GrowthChart({
  results,
  config,
  lang,
  theme,
}: {
  results: Result[];
  config: Config;
  lang: Lang;
  theme: string;
}) {
  const host = useRef<HTMLDivElement>(null),
    instance = useRef<echarts.ECharts | null>(null);
  const [failed, setFailed] = useState(false);
  const t = copy[lang];
  useEffect(() => {
    if (!host.current) return;
    try {
      const chart = echarts.init(host.current, undefined, {
        renderer: "canvas",
      });
      instance.current = chart;
      const observer = new ResizeObserver(() => chart.resize());
      observer.observe(host.current);
      return () => {
        observer.disconnect();
        chart.dispose();
        instance.current = null;
      };
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    const chart = instance.current;
    if (!chart) return;
    const dark = theme === "dark",
      muted = dark ? "#91a8bd" : "#466078",
      grid = dark ? "#1b2c40" : "#ccdae5";
    const years = Array.from(
      { length: config.end - config.start + 2 },
      (_, i) => String(config.start - 1 + i),
    );
    const option: EChartsOption = {
      animation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      animationDuration: 600,
      animationDurationUpdate: 300,
      aria: {
        enabled: true,
        description:
          lang === "zh"
            ? "资金增长折线图，详细金额见下方年度表。"
            : "Capital growth line chart. Exact values are available in the annual table below.",
      },
      grid: { left: 12, right: 24, top: 36, bottom: 64, containLabel: true },
      tooltip: {
        trigger: "axis",
        confine: true,
        backgroundColor: dark ? "#11161b" : "#ffffff",
        borderColor: dark ? "#38424c" : "#8fa9bf",
        padding: 14,
        textStyle: {
          color: dark ? "#e8f4ff" : "#12263a",
          fontFamily: "ui-monospace,monospace",
        },
        axisPointer: {
          type: "cross",
          lineStyle: { color: "#7b9b6a", type: "dashed" },
          crossStyle: { color: muted },
          label: { backgroundColor: dark ? "#303b45" : "#405d78" },
        },
        valueFormatter: (v) =>
          typeof v === "number" ? formatMoney(v, lang) : "—",
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: years,
        axisLine: { lineStyle: { color: grid } },
        axisTick: { show: false },
        axisLabel: {
          color: muted,
          fontFamily: "ui-monospace,monospace",
          fontSize: 11,
          hideOverlap: true,
          margin: 16,
        },
      },
      yAxis: {
        type: "value",
        min: 0,
        splitNumber: 4,
        axisLabel: {
          color: muted,
          fontFamily: "ui-monospace,monospace",
          fontSize: 11,
          formatter: (v: number) =>
            v >= 1e6
              ? `$${+(v / 1e6).toFixed(1)}m`
              : v >= 1e3
                ? `$${+(v / 1e3).toFixed(1)}k`
                : `$${+v.toFixed(2)}`,
        },
        splitLine: { lineStyle: { color: grid, type: "dashed" } },
        axisPointer: {
          label: {
            formatter: (p) =>
              typeof p.value === "number"
                ? formatMoney(p.value, lang)
                : String(p.value),
          },
        },
      },
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          filterMode: "none",
          zoomOnMouseWheel: "ctrl",
          moveOnMouseWheel: false,
          moveOnMouseMove: true,
        },
        {
          type: "slider",
          xAxisIndex: 0,
          bottom: 4,
          height: 20,
          borderColor: grid,
          backgroundColor: "transparent",
          fillerColor: dark ? "rgba(170,203,148,.08)" : "rgba(62,108,55,.08)",
          dataBackground: {
            lineStyle: { color: muted },
            areaStyle: { color: grid },
          },
          selectedDataBackground: {
            lineStyle: { color: "#7b9b6a" },
            areaStyle: { color: "#354d31" },
          },
          handleStyle: { color: dark ? "#779965" : "#087b71", borderWidth: 0 },
          textStyle: { color: muted },
          showDetail: false,
          brushSelect: false,
        },
      ],
      series: results
        .filter((r) => !r.error)
        .map((r) => {
          const color =
            r.key === "sp500"
              ? dark
                ? lineColors.sp500
                : "#42698e"
              : r.key === "nasdaq"
                ? dark
                  ? lineColors.nasdaq
                  : "#927122"
                : dark
                  ? lineColors.strategy
                  : "#3e6c37";
          return {
            name: seriesLabel(r, lang),
            type: "line",
            connectNulls: false,
            smooth: false,
            showSymbol: false,
            symbol: "circle",
            symbolSize: 7,
            data: years.map((y) =>
              Number(y) === r.start - 1
                ? r.initial
                : (r.annual.find((a) => a.year === Number(y))?.value ?? null),
            ),
            lineStyle: {
              color,
              width: r.key.startsWith("top") ? 3 : 1.8,
              type: r.key === "nasdaq" ? "dashed" : "solid",
              shadowColor: r.key.startsWith("top") ? color : "transparent",
              shadowBlur: 0,
            },
            itemStyle: { color },
            emphasis: { focus: "series", lineStyle: { width: 3.5 } },
            z: r.key.startsWith("top") ? 3 : 2,
          };
        }),
    };
    chart.setOption(option, { notMerge: true });
  }, [results, config, lang, theme]);
  return (
    <>
      <div className="chart-actions">
        <span>{t.zoom}</span>
        <button
          type="button"
          onClick={() =>
            instance.current?.dispatchAction({
              type: "dataZoom",
              start: 0,
              end: 100,
            })
          }
        >
          {t.reset} ↺
        </button>
      </div>
      <div
        ref={host}
        className="growth-chart"
        role="img"
        aria-label={t.chart}
      />
      {failed && (
        <p role="status">
          {lang === "zh"
            ? "图表暂不可用，仍可查看下方完整年度表。"
            : "Chart unavailable. All values remain available in the annual table."}
        </p>
      )}
    </>
  );
}
