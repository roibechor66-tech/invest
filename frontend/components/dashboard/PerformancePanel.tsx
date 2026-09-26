"use client";

import { useState } from "react";
import clsx from "clsx";
import { BenchmarkOption, PerformancePeriod } from "@/lib/types";

interface PerformancePanelProps {
  periods: PerformancePeriod[];
  benchmarks: BenchmarkOption[];
}

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

// Portfolio performance broken down by standard reporting periods
// (weekly / monthly / quarterly / YTD / yearly), each shown against a
// benchmark the user picks from a dropdown. Both sides are real (FMP-
// backed) as of Phase 3 — see useLivePortfolioPerformance.ts and
// backend/app/services/portfolio_performance.py. A benchmark with no
// live historical data for its ETF proxy is shown as "אין נתון" rather
// than a fabricated number (see hasBenchmark below).
export function PerformancePanel({ periods, benchmarks }: PerformancePanelProps) {
  const [benchmarkId, setBenchmarkId] = useState(benchmarks[0].id);
  const activeBenchmark = benchmarks.find((b) => b.id === benchmarkId) ?? benchmarks[0];

  return (
    <section className="rounded-xl border border-surface-border bg-surface-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">ביצועי תיק לפי תקופה</h2>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">השוואה מול:</label>
          <select
            value={benchmarkId}
            onChange={(e) => setBenchmarkId(e.target.value as typeof benchmarkId)}
            className="rounded-lg border border-surface-border bg-surface-raised px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-brand-500"
          >
            {benchmarks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.labelHe}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {periods.map((period) => {
          const benchmarkReturn = period.benchmarkReturns[activeBenchmark.id];
          const hasBenchmark = benchmarkReturn !== undefined;
          const isUp = period.returnPct >= 0;
          const beatsBenchmark = hasBenchmark && period.returnPct >= benchmarkReturn;
          return (
            <div
              key={period.id}
              className="rounded-lg border border-surface-border bg-surface-raised p-3.5"
            >
              <p className="text-xs text-slate-500">{period.labelHe}</p>
              <p
                className={clsx(
                  "mt-1 text-xl font-extrabold",
                  isUp ? "text-positive" : "text-negative"
                )}
              >
                {formatPct(period.returnPct)}
              </p>
              <p
                className={clsx(
                  "mt-1 text-[11px]",
                  !hasBenchmark || beatsBenchmark ? "text-slate-500" : "text-negative/80"
                )}
              >
                {activeBenchmark.labelHe}: {hasBenchmark ? formatPct(benchmarkReturn) : "אין נתון"}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
