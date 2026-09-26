"use client";

import { PerformancePanel } from "@/components/dashboard/PerformancePanel";
import { useLivePortfolioPerformance } from "@/lib/hooks/useLivePortfolioPerformance";
import { benchmarkOptions } from "@/lib/mock-data/benchmarks";

// Wraps PerformancePanel with the real loading/error/empty states that
// replacing frontend/lib/mock-data/performance.ts's fixed mock array with
// a live backend call (GET /api/portfolio/performance) requires — the
// panel component itself stays purely presentational.
export function PortfolioPerformanceSection() {
  const { periods, skippedTickers, isLoading, error } = useLivePortfolioPerformance();

  if (isLoading) {
    return (
      <section className="rounded-xl border border-surface-border bg-surface-card p-5 shadow-sm">
        <p className="text-sm text-slate-500">טוען ביצועי תיק...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-xl border border-surface-border bg-surface-card p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">ביצועי תיק לפי תקופה</h2>
        <p className="mt-2 text-sm text-negative">{error}</p>
      </section>
    );
  }

  if (periods.length === 0) {
    return (
      <section className="rounded-xl border border-surface-border bg-surface-card p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">ביצועי תיק לפי תקופה</h2>
        <p className="mt-2 text-sm text-slate-500">
          הוסיפו נייר ל"התיק שלי" כדי לראות כאן את ביצועי התיק שלכם מול מדדי ייחוס.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-2">
      <PerformancePanel periods={periods} benchmarks={benchmarkOptions} />
      {skippedTickers.length > 0 && (
        <p className="px-1 text-[11px] text-slate-500">
          לא נמצאו נתוני מחיר היסטוריים עבור: {skippedTickers.join(", ")} — ניירות אלו לא נכללו
          בחישוב.
        </p>
      )}
    </div>
  );
}
