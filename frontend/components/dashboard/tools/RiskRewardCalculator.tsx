"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { FormField } from "@/components/dashboard/tools/FormField";
import { ResultRow } from "@/components/dashboard/tools/ResultRow";

interface RiskRewardResult {
  risk_per_share: number;
  reward_per_share: number;
  risk_reward_ratio: number;
}

// Risk/reward ratio calculator: entry, stop-loss, and target price in ->
// the ratio out, so a setup can be screened before sizing it.
export function RiskRewardCalculator() {
  const [entryPrice, setEntryPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [result, setResult] = useState<RiskRewardResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleCalculate() {
    setError(null);
    setIsLoading(true);
    try {
      const data = await apiFetch<RiskRewardResult>("/api/risk/risk-reward", {
        method: "POST",
        body: JSON.stringify({
          entry_price: Number(entryPrice),
          stop_price: Number(stopPrice),
          target_price: Number(targetPrice),
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <FormField label="מחיר כניסה" value={entryPrice} onChange={setEntryPrice} />
        <FormField label="מחיר סטופ-לוס" value={stopPrice} onChange={setStopPrice} />
        <FormField label="מחיר יעד" value={targetPrice} onChange={setTargetPrice} />
      </div>

      <button
        type="button"
        onClick={handleCalculate}
        disabled={isLoading || !entryPrice || !stopPrice || !targetPrice}
        className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {isLoading ? "מחשב..." : "חשב יחס סיכון/סיכוי"}
      </button>

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && (
        <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
          <ResultRow
            label="יחס סיכון/סיכוי"
            value={`1 : ${result.risk_reward_ratio.toFixed(2)}`}
            emphasize
          />
          <ResultRow label="סיכון למניה" value={`$${result.risk_per_share.toFixed(2)}`} />
          <ResultRow label="סיכוי למניה" value={`$${result.reward_per_share.toFixed(2)}`} />
        </div>
      )}
    </div>
  );
}
