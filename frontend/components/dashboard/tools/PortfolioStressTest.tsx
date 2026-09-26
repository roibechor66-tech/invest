"use client";

import { useState } from "react";
import clsx from "clsx";
import { usePortfolio } from "@/lib/portfolio-context";
import { mockBetaByTicker } from "@/lib/mock-data/portfolio-risk";

const SCENARIOS = [
  { id: "pullback", labelHe: "תיקון קל", marketMovePct: -5 },
  { id: "correction", labelHe: "תיקון", marketMovePct: -10 },
  { id: "bear", labelHe: "שוק דובי", marketMovePct: -20 },
  { id: "crash", labelHe: "משבר / קריסה", marketMovePct: -35 },
];

// Whole-market preset stress scenarios — the quick "what if the market
// drops X%" check a hedge fund runs across the whole book, simplified
// to one click: the market move is scaled by the portfolio's own beta
// (from PortfolioRiskStats) so a high-beta portfolio shows a bigger
// swing than the headline number, same as it would in reality.
export function PortfolioStressTest() {
  const { summary } = usePortfolio();
  const { holdings, totalValueUsd } = summary;
  const [activeId, setActiveId] = useState<string | null>(null);

  const portfolioBeta = holdings.reduce((sum, h) => {
    const beta = mockBetaByTicker[h.ticker] ?? 1;
    return sum + (h.weightPct / 100) * beta;
  }, 0);

  const activeScenario = SCENARIOS.find((s) => s.id === activeId) ?? null;
  const portfolioMovePct = activeScenario ? activeScenario.marketMovePct * portfolioBeta : 0;
  const lossUsd = totalValueUsd * (portfolioMovePct / 100);
  const newValue = totalValueUsd + lossUsd;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        תרחישי שוק מוכנים
      </p>
      <p className="mb-2 text-xs text-slate-500">
        סימולציה מיידית: אם השוק הרחב יזוז באחוז המצוין, כמה זה ישפיע על
        התיק שלכם לפי הבטא שלו.
      </p>
      <div className="grid grid-cols-4 gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveId(s.id)}
            className={clsx(
              "rounded-lg border px-2 py-2 text-center text-xs font-semibold transition",
              activeId === s.id
                ? "border-brand-500 bg-brand-500/10 text-brand-400"
                : "border-surface-border bg-surface-raised text-slate-700 hover:border-brand-500/40"
            )}
          >
            <div>{s.labelHe}</div>
            <div className="mt-0.5 text-[11px] font-normal text-slate-500">
              שוק {s.marketMovePct}%
            </div>
          </button>
        ))}
      </div>

      {activeScenario && (
        <div className="mt-3 rounded-lg border border-surface-border bg-surface-raised p-4">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-slate-500">שינוי משוער בתיק (לפי בטא {portfolioBeta.toFixed(2)})</span>
            <span className="text-base font-extrabold text-negative">
              {portfolioMovePct.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-slate-500">הפסד משוער</span>
            <span className="text-sm font-semibold text-negative">-${Math.abs(lossUsd).toFixed(0)}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-slate-500">שווי תיק אחרי התרחיש</span>
            <span className="text-sm font-semibold text-slate-800">
              ${newValue.toLocaleString("he-IL", { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
