"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { BenchmarkId, PerformancePeriod, PerformancePeriodId } from "@/lib/types";

// Real replacement for frontend/lib/mock-data/performance.ts's fixed
// mockPerformance array — see backend/app/services/portfolio_performance.py
// for the calculation (today's holdings priced historically against real
// ETF-proxy benchmark returns) and its documented approximation.

interface RawPerformancePeriod {
  id: PerformancePeriodId;
  label_he: string;
  return_pct: number;
  benchmark_returns: Partial<Record<BenchmarkId, number>>;
}

interface RawPerformanceResponse {
  periods: RawPerformancePeriod[];
  skipped_tickers: string[];
  unavailable_benchmarks: string[];
}

interface UseLivePortfolioPerformanceResult {
  periods: PerformancePeriod[];
  skippedTickers: string[];
  isLoading: boolean;
  error: string | null;
}

export function useLivePortfolioPerformance(): UseLivePortfolioPerformanceResult {
  const [periods, setPeriods] = useState<PerformancePeriod[]>([]);
  const [skippedTickers, setSkippedTickers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiFetch<RawPerformanceResponse>("/api/portfolio/performance")
      .then((data) => {
        if (cancelled) return;
        setPeriods(
          data.periods.map((p) => ({
            id: p.id,
            labelHe: p.label_he,
            returnPct: p.return_pct,
            benchmarkReturns: p.benchmark_returns,
          }))
        );
        setSkippedTickers(data.skipped_tickers);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "טעינת ביצועי התיק נכשלה");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { periods, skippedTickers, isLoading, error };
}
