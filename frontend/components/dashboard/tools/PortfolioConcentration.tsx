"use client";

import clsx from "clsx";
import { usePortfolio } from "@/lib/portfolio-context";
import { mockStockDetails } from "@/lib/mock-data/stock-details";

function concentrationLevel(weightPct: number): "high" | "medium" | "low" {
  if (weightPct >= 20) return "high";
  if (weightPct >= 10) return "medium";
  return "low";
}

const LEVEL_STYLES = {
  high: { bar: "bg-negative", text: "text-negative", labelHe: "ריכוזיות גבוהה" },
  medium: { bar: "bg-amber-500", text: "text-amber-400", labelHe: "ריכוזיות בינונית" },
  low: { bar: "bg-positive", text: "text-positive", labelHe: "מפוזר" },
};

// Concentration risk — the hedge-fund-desk question of "how much of the
// portfolio rides on one bet": per-holding weight with a simple
// traffic-light flag, plus the single largest sector's combined weight
// (a few uncorrelated-looking tickers in the same sector is still one
// concentrated bet). Computed straight from the current holdings.
export function PortfolioConcentration() {
  const { summary } = usePortfolio();
  const { holdings } = summary;
  const sorted = [...holdings].sort((a, b) => b.weightPct - a.weightPct);

  if (holdings.length === 0) {
    return (
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          ריכוזיות התיק
        </p>
        <p className="text-sm text-slate-500">אין עדיין אחזקות בתיק כדי לחשב ריכוזיות.</p>
      </div>
    );
  }

  const sectorWeights = new Map<string, number>();
  for (const h of holdings) {
    const sector = mockStockDetails[h.ticker]?.sectorNameHe ?? "לא מסווג";
    sectorWeights.set(sector, (sectorWeights.get(sector) ?? 0) + h.weightPct);
  }
  const topSector = [...sectorWeights.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        ריכוזיות התיק
      </p>
      <div className="space-y-1.5">
        {sorted.map((h) => {
          const level = concentrationLevel(h.weightPct);
          const style = LEVEL_STYLES[level];
          return (
            <div key={h.ticker} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs font-medium text-slate-700">{h.ticker}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-raised">
                <div
                  className={clsx("h-full rounded-full", style.bar)}
                  style={{ width: `${Math.min(h.weightPct, 100)}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-left text-xs font-semibold text-slate-700">
                {h.weightPct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>

      {topSector && (
        <p className="mt-2.5 text-xs text-slate-500">
          החשיפה הסקטוריאלית הגדולה ביותר:{" "}
          <span className="font-semibold text-slate-800">{topSector[0]}</span> —{" "}
          <span
            className={clsx(
              "font-semibold",
              topSector[1] >= 40 ? "text-negative" : "text-slate-700"
            )}
          >
            {topSector[1].toFixed(1)}%
          </span>{" "}
          מהתיק
          {topSector[1] >= 40 && " — ריכוזיות גבוהה בסקטור בודד"}
        </p>
      )}
    </div>
  );
}
