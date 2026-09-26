"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { FormField } from "@/components/dashboard/tools/FormField";
import { ResultRow } from "@/components/dashboard/tools/ResultRow";
import { usePortfolio } from "@/lib/portfolio-context";

interface PortfolioScenarioResult {
  ticker: string;
  current_price: number;
  scenario_price: number;
  position_value_before: number;
  position_value_after: number;
  position_value_change: number;
  portfolio_value_before: number;
  portfolio_value_after: number;
  portfolio_value_change_pct: number;
  weight_pct_before: number;
  weight_pct_after: number;
}

function formatUsd(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}$${value.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`;
}

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

// Investing-style risk management: "what happens to my portfolio if
// stock X drops/rises by Y%" — a scenario stress-test against the
// user's actual holdings, as opposed to the swing-trading calculators
// (position size, risk/reward) that only look at a single trade.
export function PortfolioScenarioCalculator() {
  const { summary } = usePortfolio();
  const holdings = summary.holdings;
  const [ticker, setTicker] = useState(holdings[0]?.ticker ?? "");
  const [changePct, setChangePct] = useState("-10");
  const [result, setResult] = useState<PortfolioScenarioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // The portfolio loads asynchronously now (real backend call), so
  // holdings can still be empty on first render — once they arrive, pick
  // a default selection if nothing has been chosen yet.
  useEffect(() => {
    if (!ticker && holdings.length > 0) setTicker(holdings[0].ticker);
  }, [holdings, ticker]);

  async function handleCalculate() {
    setError(null);
    setIsLoading(true);
    try {
      const data = await apiFetch<PortfolioScenarioResult>("/api/risk/portfolio-scenario", {
        method: "POST",
        body: JSON.stringify({
          holdings: holdings.map((h) => ({
            ticker: h.ticker,
            name_he: h.nameHe,
            quantity: h.quantity,
            last_price: h.lastPrice,
            weight_pct: h.weightPct,
          })),
          target_ticker: ticker,
          price_change_pct: Number(changePct),
        }),
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "החישוב נכשל");
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }

  if (holdings.length === 0) {
    return <p className="text-sm text-slate-500">אין עדיין אחזקות בתיק כדי להריץ תרחיש.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        בחרו אחזקה בתיק ותרחיש שינוי מחיר (למשל ירידה של 15%), ותראו את
        ההשפעה לא רק על האחזקה עצמה — אלא על שווי התיק כולו.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">נייר בתיק</label>
          <select
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500"
          >
            {holdings.map((h) => (
              <option key={h.ticker} value={h.ticker}>
                {h.ticker} · {h.nameHe}
              </option>
            ))}
          </select>
        </div>
        <FormField
          label="שינוי מחיר צפוי (%)"
          value={changePct}
          onChange={setChangePct}
          placeholder="לדוגמה: -15"
        />
      </div>

      <button
        type="button"
        onClick={handleCalculate}
        disabled={isLoading || !ticker || !changePct}
        className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {isLoading ? "מחשב..." : "חשב השפעה על התיק"}
      </button>

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && (
        <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
          <ResultRow
            label="שינוי בשווי התיק הכולל"
            value={formatPct(result.portfolio_value_change_pct)}
            emphasize
          />
          <ResultRow label="מחיר תרחיש" value={`$${result.scenario_price.toFixed(2)}`} />
          <ResultRow
            label="שינוי בשווי האחזקה"
            value={formatUsd(result.position_value_change)}
          />
          <ResultRow
            label="שווי תיק לפני"
            value={`$${result.portfolio_value_before.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`}
          />
          <ResultRow
            label="שווי תיק אחרי התרחיש"
            value={`$${result.portfolio_value_after.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`}
          />
          <ResultRow
            label="משקל האחזקה בתיק (לפני → אחרי)"
            value={`${result.weight_pct_before.toFixed(1)}% → ${result.weight_pct_after.toFixed(1)}%`}
          />
        </div>
      )}
    </div>
  );
}
