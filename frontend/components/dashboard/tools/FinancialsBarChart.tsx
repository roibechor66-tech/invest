"use client";

import { useState } from "react";
import clsx from "clsx";
import { FinancialPeriodPoint, formatUsdM } from "@/lib/mock-data/financial-statements";

export interface BarSeriesConfig {
  key: keyof Pick<FinancialPeriodPoint, "revenueUsdM" | "ebitdaUsdM" | "netIncomeUsdM" | "cashUsdM" | "debtUsdM">;
  labelHe: string;
  color: string;
}

interface FinancialsBarChartProps {
  titleHe: string;
  annualData: FinancialPeriodPoint[];
  quarterlyData: FinancialPeriodPoint[];
  series: BarSeriesConfig[];
}

const Y_AXIS_TICKS = 4;
const MAX_BAR_WIDTH = 24;

// Builds an SVG path for a bar that grows from a baseline with rounded
// top (data-end) corners and a square bottom, per the dataviz mark spec
// — a plain <rect rx> rounds every corner, which looks wrong at the
// baseline.
function roundedTopBarPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height);
  if (r <= 0) return `M ${x} ${y} h ${width} v ${height} h ${-width} Z`;
  return [
    `M ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `L ${x + width} ${y + height}`,
    `L ${x} ${y + height}`,
    "Z",
  ].join(" ");
}

// GuruFocus-style grouped bar chart: one bar per series per period
// (revenue/EBITDA/net income, or cash/debt), with a period toggle between
// the last ~8 fiscal years and the last ~8 quarters. Hand-rolled SVG, same
// convention as MetricTrendChart — no charting library in this project.
//
// Per explicit request, every bar carries its own direct value label (not
// just the latest period) — the most recent period's labels stay brighter
// for emphasis, older periods are dimmer, and every bar also gets a native
// hover tooltip for its exact value plus the y-axis for the overall scale.
export function FinancialsBarChart({ titleHe, annualData, quarterlyData, series }: FinancialsBarChartProps) {
  const [periodMode, setPeriodMode] = useState<"annual" | "quarterly">("annual");
  const data = periodMode === "annual" ? annualData : quarterlyData;

  const width = 640;
  const height = 240;
  const paddingTop = 28;
  const paddingBottom = 30;
  const paddingLeft = 56;
  const paddingRight = 12;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const allValues = data.flatMap((point) => series.map((s) => point[s.key]));
  const maxValue = Math.max(...allValues, 0.001);
  const minValue = Math.min(...allValues, 0);
  const range = Math.max(maxValue - minValue, 0.001);

  function toY(value: number) {
    const ratio = (value - minValue) / range;
    return paddingTop + (chartHeight - ratio * chartHeight);
  }
  const zeroY = toY(0);

  const groupWidth = chartWidth / data.length;
  const barGap = 2;
  const rawBarWidth = (groupWidth - barGap * (series.length + 1)) / series.length;
  const barWidth = Math.min(Math.max(rawBarWidth, 4), MAX_BAR_WIDTH);
  // Center the (possibly capped) bars within their group instead of
  // hugging the left edge, so a wide chart doesn't look lopsided.
  const groupContentWidth = barWidth * series.length + barGap * (series.length - 1);
  const groupInset = (groupWidth - groupContentWidth) / 2;

  const yTicks = Array.from({ length: Y_AXIS_TICKS + 1 }, (_, i) => {
    const value = minValue + (range * i) / Y_AXIS_TICKS;
    return { value, y: toY(value) };
  });

  const lastIndex = data.length - 1;

  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-semibold text-slate-700">{titleHe}</p>
          {/* Legend — the dependable identity channel for 2+ series. */}
          <div className="flex items-center gap-2">
            {series.map((s) => (
              <span key={s.key} className="flex items-center gap-1 text-[11px] text-slate-500">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.labelHe}
              </span>
            ))}
          </div>
        </div>
        <div className="flex rounded-lg border border-surface-border p-0.5">
          <button
            type="button"
            onClick={() => setPeriodMode("annual")}
            className={clsx(
              "rounded-md px-2.5 py-1 text-xs font-medium transition",
              periodMode === "annual" ? "bg-brand-500 text-white" : "text-slate-500 hover:text-slate-800"
            )}
          >
            שנתי
          </button>
          <button
            type="button"
            onClick={() => setPeriodMode("quarterly")}
            className={clsx(
              "rounded-md px-2.5 py-1 text-xs font-medium transition",
              periodMode === "quarterly" ? "bg-brand-500 text-white" : "text-slate-500 hover:text-slate-800"
            )}
          >
            רבעוני
          </button>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={titleHe}>
        {/* Y-axis: gridlines, value labels, small tick marks, a solid
            vertical axis line and an X-axis baseline — a full coordinate
            frame so the scale reads clearly at a glance. */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={paddingLeft}
              x2={width - paddingRight}
              y1={tick.y}
              y2={tick.y}
              stroke={Math.abs(tick.value) < 0.001 ? "#475569" : "#272b35"}
              strokeWidth={Math.abs(tick.value) < 0.001 ? 1.5 : 1}
              strokeDasharray={Math.abs(tick.value) < 0.001 ? undefined : "3 3"}
            />
            <line x1={paddingLeft - 4} x2={paddingLeft} y1={tick.y} y2={tick.y} stroke="#94a3b8" strokeWidth={1} />
            <text x={paddingLeft - 8} y={tick.y + 3} textAnchor="end" fontSize="9" fontWeight={600} fill="#94a3b8">
              {formatUsdM(tick.value)}
            </text>
          </g>
        ))}
        <line x1={paddingLeft} x2={paddingLeft} y1={paddingTop} y2={height - paddingBottom} stroke="#94a3b8" strokeWidth={1.5} />
        <line x1={paddingLeft} x2={width - paddingRight} y1={height - paddingBottom} y2={height - paddingBottom} stroke="#94a3b8" strokeWidth={1.5} />

        {data.map((point, groupIndex) => {
          const groupX = paddingLeft + groupIndex * groupWidth + groupInset;
          const isLastGroup = groupIndex === lastIndex;
          return (
            <g key={point.periodLabelHe}>
              {series.map((s, seriesIndex) => {
                const value = point[s.key];
                const barX = groupX + seriesIndex * (barWidth + barGap);
                const y = toY(value);
                const barY = Math.min(y, zeroY);
                const barHeight = Math.max(Math.abs(zeroY - y), 1);
                return (
                  <g key={s.key}>
                    <path d={roundedTopBarPath(barX, barY, barWidth, barHeight, 3)} fill={s.color}>
                      {/* Native hover tooltip carries the exact value for
                          every bar, so nothing is hidden even though only
                          the latest period is directly labeled. */}
                      <title>{`${point.periodLabelHe} · ${s.labelHe}: ${formatUsdM(value)}`}</title>
                    </path>
                    {/* Direct "value at the tip" label on every bar, per
                        explicit request — every column's number is always
                        visible, not just the latest period's. */}
                    <text
                      x={barX + barWidth / 2}
                      y={barY - 4}
                      textAnchor="middle"
                      fontSize="7.5"
                      fontWeight={700}
                      fill={isLastGroup ? "#e2e8f0" : "#94a3b8"}
                    >
                      {formatUsdM(value)}
                    </text>
                  </g>
                );
              })}
              <line
                x1={groupX + groupContentWidth / 2}
                x2={groupX + groupContentWidth / 2}
                y1={height - paddingBottom}
                y2={height - paddingBottom + 4}
                stroke="#94a3b8"
                strokeWidth={1}
              />
              <text
                x={groupX + groupContentWidth / 2}
                y={height - 10}
                textAnchor="middle"
                fontSize="9"
                fontWeight={isLastGroup ? 700 : 600}
                fill={isLastGroup ? "#e2e8f0" : "#94a3b8"}
              >
                {point.periodLabelHe}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
