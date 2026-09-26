"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { FormField } from "@/components/dashboard/tools/FormField";
import { ResultRow } from "@/components/dashboard/tools/ResultRow";

interface EvEbitdaResult {
  enterprise_value: number;
  equity_value: number;
  value_per_share: number;
}

// EV/EBITDA comparable-multiple calculator.
export function EvEbitdaCalculator() {
  const [ebitda, setEbitda] = useState("500");
  const [multiple, setMultiple] = useState("12");
  const [netDebt, setNetDebt] = useState("1000");
  const [shares, setShares] = useState("100");
  const [result, setResult] = useState<EvEbitdaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleCalculate() {
    setError(null);
    setIsLoading(true);
    try {
      const data = await apiFetch<EvEbitdaResult>("/api/valuation/ev-ebitda", {
        method: "POST",
        body: JSON.stringify({
          ebitda: Number(ebitda),
          multiple: Number(multiple),
          net_debt: Number(netDebt),
          shares_outstanding: Number(shares),
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
      <div className="grid grid-cols-2 gap-3">
        <FormField label="EBITDA ($M)" value={ebitda} onChange={setEbitda} />
        <FormField label="מכפיל EV/EBITDA" value={multiple} onChange={setMultiple} />
        <FormField label="חוב נטו ($M)" value={netDebt} onChange={setNetDebt} />
        <FormField label="מניות במחזור (M)" value={shares} onChange={setShares} />
      </div>

      <button
        type="button"
        onClick={handleCalculate}
        disabled={isLoading}
        className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {isLoading ? "מחשב..." : "חשב שווי"}
      </button>

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && (
        <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
          <ResultRow
            label="שווי הוגן למניה"
            value={`$${result.value_per_share.toFixed(2)}`}
            emphasize
          />
          <ResultRow label="שווי פעילות (EV)" value={`$${result.enterprise_value.toFixed(0)}M`} />
          <ResultRow label="שווי הון עצמי" value={`$${result.equity_value.toFixed(0)}M`} />
        </div>
      )}
    </div>
  );
}
