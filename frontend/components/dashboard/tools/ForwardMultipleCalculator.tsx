"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { FormField } from "@/components/dashboard/tools/FormField";
import { ResultRow } from "@/components/dashboard/tools/ResultRow";

interface ForwardMultipleResult {
  implied_price: number;
}

interface FcfYieldResult {
  fcf_yield_pct: number;
}

// Combines two small, related calculators: forward multiple -> implied
// price, and FCF yield -> % of market cap returned as free cash flow.
export function ForwardMultipleCalculator() {
  const [forwardMetric, setForwardMetric] = useState("6.5");
  const [multiple, setMultiple] = useState("25");
  const [priceResult, setPriceResult] = useState<ForwardMultipleResult | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);

  const [fcf, setFcf] = useState("400");
  const [marketCap, setMarketCap] = useState("8000");
  const [yieldResult, setYieldResult] = useState<FcfYieldResult | null>(null);
  const [yieldError, setYieldError] = useState<string | null>(null);

  async function handlePriceCalculate() {
    setPriceError(null);
    try {
      const data = await apiFetch<ForwardMultipleResult>(
        "/api/valuation/forward-multiple",
        {
          method: "POST",
          body: JSON.stringify({
            forward_metric: Number(forwardMetric),
            multiple: Number(multiple),
          }),
        }
      );
      setPriceResult(data);
    } catch (err) {
      setPriceError(err instanceof ApiError ? err.message : "החישוב נכשל");
    }
  }

  async function handleYieldCalculate() {
    setYieldError(null);
    try {
      const data = await apiFetch<FcfYieldResult>("/api/valuation/fcf-yield", {
        method: "POST",
        body: JSON.stringify({ fcf: Number(fcf), market_cap: Number(marketCap) }),
      });
      setYieldResult(data);
    } catch (err) {
      setYieldError(err instanceof ApiError ? err.message : "החישוב נכשל");
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-xs font-semibold text-slate-400">מכפיל עתידי (Forward Multiple)</p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="רווח/הכנסה למניה עתידי" value={forwardMetric} onChange={setForwardMetric} />
          <FormField label="מכפיל" value={multiple} onChange={setMultiple} />
        </div>
        <button
          type="button"
          onClick={handlePriceCalculate}
          className="w-full rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          חשב מחיר יעד
        </button>
        {priceError && <p className="text-sm text-negative">{priceError}</p>}
        {priceResult && (
          <div className="rounded-lg border border-surface-border bg-surface-raised p-3">
            <ResultRow
              label="מחיר יעד גלום"
              value={`$${priceResult.implied_price.toFixed(2)}`}
              emphasize
            />
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-surface-border pt-5">
        <p className="text-xs font-semibold text-slate-400">תשואת FCF (FCF Yield)</p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="תזרים מזומנים חופשי ($M)" value={fcf} onChange={setFcf} />
          <FormField label="שווי שוק ($M)" value={marketCap} onChange={setMarketCap} />
        </div>
        <button
          type="button"
          onClick={handleYieldCalculate}
          className="w-full rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          חשב תשואת FCF
        </button>
        {yieldError && <p className="text-sm text-negative">{yieldError}</p>}
        {yieldResult && (
          <div className="rounded-lg border border-surface-border bg-surface-raised p-3">
            <ResultRow
              label="תשואת FCF"
              value={`${yieldResult.fcf_yield_pct.toFixed(2)}%`}
              emphasize
            />
          </div>
        )}
      </div>
    </div>
  );
}
