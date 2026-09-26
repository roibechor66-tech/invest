import { MetricHistoryPoint } from "@/lib/types";

interface MetricTrendChartProps {
  points: MetricHistoryPoint[];
  labelHe: string;
  suffix?: string;
}

const Y_AXIS_TICKS = 4;

// Small inline SVG line chart showing a multiple/ratio quarter over
// quarter, so the jump right after each quarterly earnings report is
// visible at a glance. No charting library needed — a scaled polyline
// with a dot marker at every data point, latest point highlighted, plus
// a y-axis with gridlines and numeric labels so values can be read off
// the scale and not just estimated from the line itself.
export function MetricTrendChart({ points, labelHe, suffix = "" }: MetricTrendChartProps) {
  const width = 560;
  const height = 170;
  const paddingBottom = 28;
  const paddingTop = 18;
  const paddingLeft = 40; // room for the y-axis value labels
  const paddingRight = 16;

  const values = points.map((p) => p.value);
  const maxValue = Math.max(...values, 0.001);
  const minValue = Math.min(...values, 0);
  // Give the line some breathing room instead of touching the top/bottom.
  const range = Math.max(maxValue - minValue, 0.001);
  const chartHeight = height - paddingBottom - paddingTop;
  const chartWidth = width - paddingLeft - paddingRight;
  const stepX = points.length > 1 ? chartWidth / (points.length - 1) : 0;

  function toX(i: number) {
    return paddingLeft + i * stepX;
  }
  function toY(value: number) {
    const ratio = (value - minValue) / range;
    return paddingTop + (chartHeight - ratio * chartHeight);
  }

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.value).toFixed(1)}`)
    .join(" ");

  // Evenly spaced y-axis ticks between the min and max value shown.
  const yTicks = Array.from({ length: Y_AXIS_TICKS + 1 }, (_, i) => {
    const value = minValue + (range * i) / Y_AXIS_TICKS;
    return { value, y: toY(value) };
  });

  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <p className="mb-2 text-xs font-semibold text-slate-700">
        {labelHe} — מגמה רבעונית ({points.length} רבעונים אחרונים)
      </p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={`מגמת ${labelHe} רבעון מול רבעון`}>
        {/* Y-axis gridlines + numeric labels */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={paddingLeft}
              x2={width - paddingRight}
              y1={tick.y}
              y2={tick.y}
              stroke="#272b35"
              strokeWidth={1}
              strokeDasharray={i === 0 ? undefined : "3 3"}
            />
            <text x={paddingLeft - 6} y={tick.y + 3} textAnchor="end" fontSize="9" fill="#64748b">
              {tick.value.toFixed(1)}
              {suffix}
            </text>
          </g>
        ))}

        <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point, i) => {
          const x = toX(i);
          const y = toY(point.value);
          const isLast = i === points.length - 1;
          return (
            <g key={point.periodLabelHe}>
              <circle cx={x} cy={y} r={isLast ? 4.5 : 3.5} fill={isLast ? "#3b82f6" : "#0f1115"} stroke="#3b82f6" strokeWidth={1.5} />
              <text
                x={x}
                y={y - 10}
                textAnchor="middle"
                fontSize="10"
                fill="#94a3b8"
              >
                {point.value.toFixed(1)}
                {suffix}
              </text>
              <text
                x={x}
                y={height - 8}
                textAnchor="middle"
                fontSize="9"
                fill="#64748b"
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
