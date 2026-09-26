"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { usePortfolio } from "@/lib/portfolio-context";
import { mockPerformance } from "@/lib/mock-data/performance";
import {
  mockVolatilityByTicker,
  mockCorrelationMatrix,
  RISK_FREE_RATE_PCT,
} from "@/lib/mock-data/portfolio-risk";
import { SharpeExplanationModal, SharpeRiskContribution } from "@/components/dashboard/tools/SharpeExplanationModal";

// Sharpe ratio computed the way a risk desk actually would: build the
// portfolio's covariance matrix from each holding's own volatility and
// its pairwise correlation with every other holding — not just a single
// market-wide beta — derive the portfolio's own volatility from that
// matrix (portfolio variance = sum over every pair of weight_i *
// weight_j * vol_i * vol_j * correlation_ij), then compare the
// portfolio's annual return to the risk-free rate per unit of that
// volatility. Two holdings that move together contribute more to
// portfolio risk than two that don't, even at the same individual
// volatility — which a simple weighted-beta estimate can't capture.
export function PortfolioSharpeRatio() {
  const [explainOpen, setExplainOpen] = useState(false);
  const { summary } = usePortfolio();
  const { holdings } = summary;
  if (holdings.length === 0) {
    return (
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          יחס שארפ (Sharpe Ratio)
        </p>
        <p className="text-sm text-slate-500">אין עדיין אחזקות בתיק כדי לחשב יחס שארפ.</p>
      </div>
    );
  }

  const totalWeight = holdings.reduce((sum, h) => sum + h.weightPct, 0);
  const weights = holdings.map((h) => ({
    ticker: h.ticker,
    nameHe: h.nameHe,
    weight: totalWeight ? h.weightPct / totalWeight : 0,
  }));

  // Build the full covariance matrix once: variance is the sum of every
  // pairwise term, and each holding's own covariance-with-the-portfolio
  // (covWithPortfolio) is what its risk *contribution* is derived from
  // below — a holding's contribution to total variance is exactly
  // weight_i * covWithPortfolio_i, and those contributions sum to the
  // portfolio's total variance.
  let variance = 0;
  const covWithPortfolio: Record<string, number> = {};
  for (const a of weights) {
    let covA = 0;
    for (const b of weights) {
      const volA = (mockVolatilityByTicker[a.ticker] ?? 25) / 100;
      const volB = (mockVolatilityByTicker[b.ticker] ?? 25) / 100;
      const correlation =
        a.ticker === b.ticker ? 1 : mockCorrelationMatrix[a.ticker]?.[b.ticker] ?? 0.3;
      const term = a.weight * b.weight * volA * volB * correlation;
      variance += term;
      covA += b.weight * volA * volB * correlation;
    }
    covWithPortfolio[a.ticker] = covA;
  }
  const portfolioVolPct = Math.sqrt(Math.max(variance, 0)) * 100;

  const annualReturnPct = mockPerformance.find((p) => p.id === "yearly")?.returnPct ?? 0;

  const sharpeRatio = portfolioVolPct
    ? (annualReturnPct - RISK_FREE_RATE_PCT) / portfolioVolPct
    : 0;

  const quality =
    sharpeRatio >= 1.5
      ? { labelHe: "מצוין", className: "text-positive" }
      : sharpeRatio >= 1
        ? { labelHe: "טוב", className: "text-slate-900" }
        : sharpeRatio >= 0.5
          ? { labelHe: "סביר", className: "text-amber-400" }
          : { labelHe: "חלש", className: "text-negative" };

  // Per-holding breakdown for the explanation modal: each holding's
  // actual share of total portfolio risk (not just its capital weight),
  // plus its average correlation with the rest of the book and its
  // single most-correlated peer, which together explain *why* it does
  // or doesn't drive risk.
  const contributions: SharpeRiskContribution[] = weights
    .map((w) => {
      const contributionShare = variance > 0 ? (w.weight * covWithPortfolio[w.ticker]) / variance : 0;
      const others = weights.filter((o) => o.ticker !== w.ticker);
      const otherWeightTotal = others.reduce((sum, o) => sum + o.weight, 0);
      let avgCorrelationWithRest = 0;
      let topCorrelatedTicker: string | null = null;
      let topCorrelation = -Infinity;
      for (const other of others) {
        const corr = mockCorrelationMatrix[w.ticker]?.[other.ticker] ?? 0.3;
        avgCorrelationWithRest += otherWeightTotal ? (other.weight / otherWeightTotal) * corr : 0;
        if (corr > topCorrelation) {
          topCorrelation = corr;
          topCorrelatedTicker = other.ticker;
        }
      }
      return {
        ticker: w.ticker,
        nameHe: w.nameHe,
        weightPct: w.weight * 100,
        volatilityPct: mockVolatilityByTicker[w.ticker] ?? 25,
        contributionPct: contributionShare * 100,
        avgCorrelationWithRest,
        topCorrelatedTicker,
        topCorrelation: topCorrelation === -Infinity ? 0 : topCorrelation,
      };
    })
    .sort((a, b) => b.contributionPct - a.contributionPct);

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          יחס שארפ (Sharpe Ratio)
        </p>
        <button
          type="button"
          onClick={() => setExplainOpen(true)}
          className="text-slate-500 transition hover:text-brand-400"
          aria-label="הסבר על יחס שארפ"
        >
          <HelpCircle size={14} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-surface-border bg-surface-raised p-3 text-center">
          <p className="text-xs text-slate-500">תשואה שנתית</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{annualReturnPct.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-surface-border bg-surface-raised p-3 text-center">
          <p className="text-xs text-slate-500">תנודתיות התיק (ממטריצת קורלציות)</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{portfolioVolPct.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-surface-border bg-surface-raised p-3 text-center">
          <p className="text-xs text-slate-500">יחס שארפ</p>
          <p className={`mt-1 text-lg font-bold ${quality.className}`}>{sharpeRatio.toFixed(2)}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{quality.labelHe}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        יחס שארפ מודד תשואה עודפת (מעבר לריבית חסרת סיכון, כאן{" "}
        {RISK_FREE_RATE_PCT}%) ביחס לתנודתיות. בשונה מהבטא הכללית למעלה,
        התנודתיות כאן נבנית ממטריצת קורלציות בין האחזקות עצמן — ככל
        שהאחזקות שלכם פחות מתואמות זו עם זו, התנודתיות הכוללת של התיק
        יורדת ויחס שארפ משתפר, גם בלי לשנות את התשואה.
      </p>

      {explainOpen && (
        <SharpeExplanationModal
          onClose={() => setExplainOpen(false)}
          annualReturnPct={annualReturnPct}
          portfolioVolPct={portfolioVolPct}
          sharpeRatio={sharpeRatio}
          quality={quality}
          contributions={contributions}
        />
      )}
    </div>
  );
}
