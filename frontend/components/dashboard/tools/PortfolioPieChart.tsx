export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

interface PortfolioPieChartProps {
  slices: PieSlice[];
  size?: number;
  // "labeled" (default) writes each slice's own name inside it and its
  // percentage just outside — ideal for short tickers. "legend" skips
  // both (sector names are often too long to fit legibly inside or
  // beside a slice) and instead renders a proper legend underneath the
  // chart, with a color swatch, the full name and its percentage.
  variant?: "labeled" | "legend";
}

const TAU_START_DEG = -90; // 12 o'clock

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

// A real, dependency-free pie chart: plain SVG arc paths, no charting
// library. In "labeled" mode, each slice carries its ticker name INSIDE
// the slice itself and its percentage just OUTSIDE the circle next to
// that same slice, so the chart reads on its own without a separate
// legend. In "legend" mode (used for sector names, which are too long
// to place on the chart itself) the slices stay unlabeled and a legend
// list below the chart carries the names and percentages instead.
export function PortfolioPieChart({ slices, size = 220, variant = "labeled" }: PortfolioPieChartProps) {
  const total = slices.reduce((sum, s) => sum + s.value, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 34; // leaves room for the outside % labels
  const insideLabelRadius = radius * 0.62;
  const outsideLabelRadius = radius + 18;

  let cursorDeg = TAU_START_DEG;

  const parts = slices.map((s) => {
    const pct = (s.value / total) * 100;
    const sweep = (s.value / total) * 360;
    const startDeg = cursorDeg;
    const endDeg = cursorDeg + sweep;
    cursorDeg = endDeg;
    const midDeg = (startDeg + endDeg) / 2;

    const startX = cx + radius * Math.cos(toRad(startDeg));
    const startY = cy + radius * Math.sin(toRad(startDeg));
    const endX = cx + radius * Math.cos(toRad(endDeg));
    const endY = cy + radius * Math.sin(toRad(endDeg));
    const largeArc = sweep > 180 ? 1 : 0;
    const path = `M ${cx} ${cy} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY} Z`;

    const insideX = cx + insideLabelRadius * Math.cos(toRad(midDeg));
    const insideY = cy + insideLabelRadius * Math.sin(toRad(midDeg));
    const outsideX = cx + outsideLabelRadius * Math.cos(toRad(midDeg));
    const outsideY = cy + outsideLabelRadius * Math.sin(toRad(midDeg));
    const cosVal = Math.cos(toRad(midDeg));
    const anchor: "start" | "end" | "middle" = cosVal > 0.15 ? "start" : cosVal < -0.15 ? "end" : "middle";

    return {
      key: s.label,
      path,
      color: s.color,
      pctLabel: `${pct.toFixed(1)}%`,
      insideX,
      insideY,
      outsideX,
      outsideY,
      anchor,
      label: s.label,
      showInside: variant === "labeled" && pct >= 2.5,
    };
  });

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="גרף עוגה של הרכב התיק"
        style={{ overflow: "visible" }}
      >
        {parts.map((p) => (
          <path key={p.key} d={p.path} fill={p.color} stroke="#171a21" strokeWidth={1.5} />
        ))}
        {parts.map(
          (p) =>
            p.showInside && (
              <text
                key={`in-${p.key}`}
                x={p.insideX}
                y={p.insideY}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                fontWeight={800}
                fill="#ffffff"
                stroke="#00000090"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {p.label}
              </text>
            )
        )}
        {variant === "labeled" &&
          parts.map((p) => (
            <text
              key={`out-${p.key}`}
              x={p.outsideX}
              y={p.outsideY}
              textAnchor={p.anchor}
              dominantBaseline="middle"
              fontSize={11}
              fontWeight={700}
              fill="#cbd5e1"
            >
              {p.pctLabel}
            </text>
          ))}
      </svg>

      {variant === "legend" && (
        <div className="grid w-full max-w-xs grid-cols-1 gap-1.5">
          {parts.map((p) => (
            <div key={`legend-${p.key}`} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: p.color }}
                  aria-hidden="true"
                />
                <span className="truncate text-slate-700">{p.label}</span>
              </span>
              <span className="shrink-0 font-semibold text-slate-500">{p.pctLabel}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
