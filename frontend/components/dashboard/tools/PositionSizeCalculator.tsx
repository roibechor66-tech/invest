"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { FormField } from "@/components/dashboard/tools/FormField";
import { ResultRow } from "@/components/dashboard/tools/ResultRow";
import { usePortfolio } from "@/lib/portfolio-context";

interface PositionSizeResult {
  risk_amount: number;
  risk_per_share: number;
  position_size_shares: number;
  position_value: number;
  account_exposure_pct: number;
}

// The way a professional trader actually sizes a trade: decide *first*
// how much of the account you're willing to lose on this idea (a fixed
// risk %, typically 0.5-2%), then let the stop distance tell you how many
// shares that buys you — rather than picking a share count first and
// checking the risk after the fact (that's the other calculator, "סיכון
// לעסקה", useful once you already know your size). Capping risk per
// trade this way is the single biggest lever a swing trader has over
// blowing up an account, more than any entry signal.
export function PositionSizeCalculator() {
  const { totalUsd } = usePortfolio();
  const [accountSize, setAccountSize] = useState("");
  const hasUserEditedAccountSize = useRef(false);
  const [riskPct, setRiskPct] = useState("1");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [result, setResult] = useState<PositionSizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // The real portfolio loads asynchronously, so its size isn't known on
  // first render — prefill this field once it arrives, but never
  // overwrite a value the user already typed in.
  useEffect(() => {
    if (!hasUserEditedAccountSize.current && totalUsd > 0) {
      setAccountSize(String(Math.round(totalUsd)));
    }
  }, [totalUsd]);

  function handleAccountSizeChange(value: string) {
    hasUserEditedAccountSize.current = true;
    setAccountSize(value);
  }

  async function handleCalculate() {
    setError(null);
    setIsLoading(true);
    try {
      const data = await apiFetch<PositionSizeResult>("/api/risk/position-size", {
        method: "POST",
        body: JSON.stringify({
          account_size: Number(accountSize),
          risk_pct: Number(riskPct),
          entry_price: Number(entryPrice),
          stop_price: Number(stopPrice),
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
      <p className="text-sm text-slate-500">
        קבעו כמה אחוז מהתיק מוכנים להפסיד בעסקה הזו (כלל אצבע נפוץ: 0.5%–2%)
        — לפי מרחק הסטופ-לוס מהכניסה, נחשב לכם בדיוק כמה מניות לקנות כדי
        לא לחרוג מזה, בלי צורך לנחש כמות ולבדוק בדיעבד.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="גודל תיק ($)" value={accountSize} onChange={handleAccountSizeChange} />
        <FormField label="סיכון מהתיק בעסקה (%)" value={riskPct} onChange={setRiskPct} step="0.1" />
        <FormField label="מחיר כניסה" value={entryPrice} onChange={setEntryPrice} />
        <FormField label="מחיר סטופ-לוס" value={stopPrice} onChange={setStopPrice} />
      </div>

      <button
        type="button"
        onClick={handleCalculate}
        disabled={isLoading || !accountSize || !riskPct || !entryPrice || !stopPrice}
        className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {isLoading ? "מחשב..." : "חשב גודל פוזיציה"}
      </button>

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && (
        <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
          <ResultRow
            label="כמות מניות מומלצת"
            value={Math.floor(result.position_size_shares).toLocaleString("he-IL")}
            emphasize
          />
          <ResultRow label="סיכון בדולר" value={`$${result.risk_amount.toFixed(0)}`} />
          <ResultRow label="סיכון למניה" value={`$${result.risk_per_share.toFixed(2)}`} />
          <ResultRow label="שווי הפוזיציה" value={`$${result.position_value.toFixed(0)}`} />
          <ResultRow label="חשיפה מהתיק" value={`${result.account_exposure_pct.toFixed(1)}%`} />
        </div>
      )}
    </div>
  );
}
