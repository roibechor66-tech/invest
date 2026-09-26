"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { FormField } from "@/components/dashboard/tools/FormField";
import { ResultRow } from "@/components/dashboard/tools/ResultRow";

interface DcfResult {
  enterprise_value: number;
  equity_value: number;
  value_per_share: number;
  terminal_value: number;
}

// Discounted Cash Flow calculator: projects FCF growth for N years,
// discounts each year plus a terminal value back to the present.
export function DcfCalculator() {
  const [baseFcf, setBaseFcf] = useState("1000");
  const [growth, setGrowth] = useState("8");
  const [discount, setDiscount] = useState("10");
  const [terminalGrowth, setTerminalGrowth] = useState("3");
  const [years, setYears] = useState("5");
  const [netDebt, setNetDebt] = useState("0");
  const [shares, setShares] = useState("100");
  const [result, setResult] = useState<DcfResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleCalculate() {
    setError(null);
    setIsLoading(true);
    try {
      const data = await apiFetch<DcfResult>("/api/valuation/dcf", {
        method: "POST",
        body: JSON.stringify({
          base_fcf: Number(baseFcf),
          growth_rate_pct: Number(growth),
          discount_rate_pct: Number(discount),
          terminal_growth_pct: Number(terminalGrowth),
          projection_years: Number(years),
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
        <FormField label="תזרים מזומנים חופשי בסיסי ($M)" value={baseFcf} onChange={setBaseFcf} />
        <FormField label="צמיחה שנתית (%)" value={growth} onChange={setGrowth} />
        <FormField label="שיעור היוון / WACC (%)" value={discount} onChange={setDiscount} />
        <FormField label="צמיחה טרמינלית (%)" value={terminalGrowth} onChange={setTerminalGrowth} />
        <FormField label="מספר שנות תחזית" value={years} onChange={setYears} step="1" />
        <FormField label="חוב נטו ($M)" value={netDebt} onChange={setNetDebt} />
        <FormField label="מניות במחזור (M)" value={shares} onChange={setShares} />
      </div>

      <button
        type="button"
        onClick={handleCalculate}
        disabled={isLoading}
        className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {isLoading ? "מחשב..." : "חשב שווי DCF"}
      </button>

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && (
        <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
          <ResultRow
            label="שווי הוגן למניה"
            value={`$${result.value_per_share.toFixed(2)}`}
            emphasize
          />
          <ResultRow label='שווי פעילות (EV)' value={`$${result.enterprise_value.toFixed(0)}M`} />
          <ResultRow label="שווי הון עצמי" value={`$${result.equity_value.toFixed(0)}M`} />
          <ResultRow label="ערך טרמינלי" value={`$${result.terminal_value.toFixed(0)}M`} />
        </div>
      )}
    </div>
  );
}
