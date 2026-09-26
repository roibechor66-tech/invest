"use client";

import { usePortfolio } from "@/lib/portfolio-context";
import {
  ASSUMED_MARKET_ANNUAL_VOL_PCT,
  TRADING_DAYS_PER_YEAR,
  Z_SCORE_95,
  mockBetaByTicker,
} from "@/lib/mock-data/portfolio-risk";

// Three headline risk stats a hedge fund risk desk would check first,
// computed automatically from the current holdings — no input needed.
// Portfolio beta: weighted average sensitivity to the broad market.
// Estimated annual volatility: beta scaled by an assumed market
// volatility. 1-day 95% VaR: a simplified parametric (variance-
// covariance) estimate of the most one would typically expect to lose
// in a single day, 19 days out of 20. All figures are illustrative
// (Phase 1/2 mock beta assumptions) — Phase 3 replaces them with betas
// and volatility pulled from a live market-data feed.
export function PortfolioRiskStats() {
  const { summary } = usePortfolio();
  const { holdings, totalValueUsd } = summary;

  if (holdings.length === 0) {
    return (
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          תמונת סיכון כללית (מחושב אוטומטית מהתיק)
        </p>
        <p className="text-sm text-slate-500">אין עדיין אחזקות בתיק כדי לחשב סטטיסטיקות סיכון.</p>
      </div>
    );
  }

  const portfolioBeta = holdings.reduce((sum, h) => {
    const beta = mockBetaByTicker[h.ticker] ?? 1;
    return sum + (h.weightPct / 100) * beta;
  }, 0);

  const annualVolPct = portfolioBeta * ASSUMED_MARKET_ANNUAL_VOL_PCT;
  const dailyVolPct = annualVolPct / Math.sqrt(TRADING_DAYS_PER_YEAR);
  const varPct = dailyVolPct * Z_SCORE_95;
  const varUsd = totalValueUsd * (varPct / 100);

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        תמונת סיכון כללית (מחושב אוטומטית מהתיק)
      </p>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-surface-border bg-surface-raised p-3 text-center">
          <p className="text-xs text-slate-500">בטא של התיק</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{portfolioBeta.toFixed(2)}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {portfolioBeta > 1 ? "תנודתי מהשוק" : "פחות תנודתי מהשוק"}
          </p>
        </div>
        <div className="rounded-lg border border-surface-border bg-surface-raised p-3 text-center">
          <p className="text-xs text-slate-500">תנודתיות שנתית משוערת</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{annualVolPct.toFixed(1)}%</p>
          <p className="mt-0.5 text-[11px] text-slate-500">הערכה, לא נתון היסטורי בפועל</p>
        </div>
        <div className="rounded-lg border border-surface-border bg-surface-raised p-3 text-center">
          <p className="text-xs text-slate-500">VaR יומי (95%)</p>
          <p className="mt-1 text-lg font-bold text-negative">-${varUsd.toFixed(0)}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">-{varPct.toFixed(1)}% מהתיק ביום גרוע</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        VaR (Value at Risk) יומי של 95% אומר: ב-19 מתוך 20 ימי מסחר, ההפסד
        הצפוי ביום לא אמור לעבור את הסכום הזה — אך זו הערכה סטטיסטית ולא
        הבטחה, וימי קיצון (כמו משברים) יכולים לחרוג ממנה.
      </p>
    </div>
  );
}
