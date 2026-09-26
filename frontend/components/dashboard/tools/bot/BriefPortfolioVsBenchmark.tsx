function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

interface BriefPortfolioVsBenchmarkProps {
  portfolioReturnPct: number;
  benchmarkReturnPct: number;
  benchmarkLabelHe: string;
}

// The comparison every portfolio-holder actually wants from a brief:
// not just "how did the market do" but "how did *I* do relative to it".
export function BriefPortfolioVsBenchmark({
  portfolioReturnPct,
  benchmarkReturnPct,
  benchmarkLabelHe,
}: BriefPortfolioVsBenchmarkProps) {
  const deltaPct = portfolioReturnPct - benchmarkReturnPct;
  const isAhead = deltaPct >= 0;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">התיק שלכם מול {benchmarkLabelHe}</p>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-surface-border bg-surface-raised p-2.5 text-center">
          <p className="text-[11px] text-slate-500">תשואת התיק</p>
          <p className={`mt-1 text-sm font-bold ${portfolioReturnPct >= 0 ? "text-positive" : "text-negative"}`}>
            {formatPct(portfolioReturnPct)}
          </p>
        </div>
        <div className="rounded-lg border border-surface-border bg-surface-raised p-2.5 text-center">
          <p className="text-[11px] text-slate-500">{benchmarkLabelHe}</p>
          <p className={`mt-1 text-sm font-bold ${benchmarkReturnPct >= 0 ? "text-positive" : "text-negative"}`}>
            {formatPct(benchmarkReturnPct)}
          </p>
        </div>
        <div className="rounded-lg border border-surface-border bg-surface-raised p-2.5 text-center">
          <p className="text-[11px] text-slate-500">פער</p>
          <p className={`mt-1 text-sm font-bold ${isAhead ? "text-positive" : "text-negative"}`}>
            {isAhead ? "+" : ""}
            {deltaPct.toFixed(2)}%
          </p>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">
        {isAhead
          ? `התיק שלכם עוקף את ${benchmarkLabelHe} בתקופה הזו.`
          : `התיק שלכם מפגר אחרי ${benchmarkLabelHe} בתקופה הזו.`}
      </p>
    </div>
  );
}
