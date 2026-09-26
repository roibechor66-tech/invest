"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { FormField } from "@/components/dashboard/tools/FormField";
import { ResultRow } from "@/components/dashboard/tools/ResultRow";
import { mockStockDetails } from "@/lib/mock-data/stock-details";
import { useLiveQuote } from "@/lib/hooks/useLiveQuote";
import { mockVolatilityByTicker, TRADING_DAYS_PER_YEAR } from "@/lib/mock-data/portfolio-risk";
import { TickerSearchInput } from "@/components/dashboard/tools/TickerSearchInput";
import { getStockDetailSuggestions, TickerSuggestion } from "@/lib/ticker-search";

interface VolatilityStopResult {
  stop_price: number;
  stop_distance_usd: number;
  stop_distance_pct: number;
}

type Direction = "long" | "short";

const MULTIPLIER_PRESETS: { id: string; labelHe: string; value: number; noteHe: string }[] = [
  { id: "tight", labelHe: "צמוד", value: 1.5, noteHe: "פחות מקום לרעש, יותר סיכוי ליציאה מוקדמת" },
  { id: "normal", labelHe: "רגיל", value: 2, noteHe: "האיזון הנפוץ ביותר במסחר סווינג" },
  { id: "wide", labelHe: "רחב", value: 3, noteHe: "פחות יציאות מוקדמות, אבל סיכון גדול יותר לעסקה" },
];

// A stop placed at a round number ("$5 מתחת לכניסה") ignores how much the
// stock actually moves day to day — the same $5 is a tight stop on a
// stable stock and pure noise on a volatile one. Placing the stop as a
// multiple of the stock's own typical daily move (the same idea as an
// ATR-based stop) adapts it to each stock automatically. Daily volatility
// here is derived from the same annualized volatility figures used
// elsewhere in the risk-management tools (vol_annual / sqrt(252)).
export function VolatilityStopCalculator() {
  const [query, setQuery] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [entryPrice, setEntryPrice] = useState("");
  const [dailyVolPct, setDailyVolPct] = useState("");
  const [multiplier, setMultiplier] = useState(String(MULTIPLIER_PRESETS[1].value));
  const [direction, setDirection] = useState<Direction>("long");
  const [result, setResult] = useState<VolatilityStopResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const hasUserEditedEntryPrice = useRef(false);

  const matchedDetail = selectedTicker ? mockStockDetails[selectedTicker] : undefined;
  const hasKnownVol = !!selectedTicker && mockVolatilityByTicker[selectedTicker] !== undefined;
  const { quote, isLoading: isQuoteLoading } = useLiveQuote(selectedTicker);
  const hasKnownPrice = quote !== null;

  // Auto-fill the entry price once a live quote arrives — but never
  // overwrite a price the user already typed manually for this ticker.
  useEffect(() => {
    if (quote && !hasUserEditedEntryPrice.current) {
      setEntryPrice(String(quote.price));
    }
  }, [quote]);

  function handleEntryPriceChange(value: string) {
    hasUserEditedEntryPrice.current = true;
    setEntryPrice(value);
  }

  function runSearch(rawQuery: string) {
    const ticker = rawQuery.trim().toUpperCase();
    if (!ticker) return;

    const detail =
      mockStockDetails[ticker] ??
      Object.values(mockStockDetails).find((d) => d.ticker.toUpperCase() === ticker);
    const resolvedTicker = detail?.ticker ?? ticker;
    hasUserEditedEntryPrice.current = false;
    setSelectedTicker(resolvedTicker);
    setQuery(resolvedTicker);

    // Entry price is filled in by the useLiveQuote effect above once the
    // quote for `resolvedTicker` arrives; clear it here so a stale price
    // from a previous ticker isn't shown in the meantime.
    setEntryPrice("");

    // Volatility isn't offered by the live data source (Finnhub's free
    // tier), so it stays mock — same as before this feature existed.
    const annualVolPct = mockVolatilityByTicker[resolvedTicker] ?? 25;
    const dailyVol = annualVolPct / Math.sqrt(TRADING_DAYS_PER_YEAR);
    setDailyVolPct(dailyVol.toFixed(2));

    setResult(null);
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    runSearch(query);
  }

  function handleSelectSuggestion(suggestion: TickerSuggestion) {
    runSearch(suggestion.ticker);
  }

  const suggestions = getStockDetailSuggestions(query);

  async function handleCalculate() {
    setError(null);
    setIsLoading(true);
    try {
      const data = await apiFetch<VolatilityStopResult>("/api/risk/volatility-stop", {
        method: "POST",
        body: JSON.stringify({
          entry_price: Number(entryPrice),
          daily_volatility_pct: Number(dailyVolPct),
          multiplier: Number(multiplier),
          direction,
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
        חפשו מניה, בחרו כיוון עסקה (קנייה/מכירה בחסר) ומרחק סטופ מבוסס
        תנודתיות היומית שלה — במקום מחיר עגול שרירותי. ככל שהמניה תנודתית
        יותר, הסטופ המחושב יהיה רחוק יותר, כדי לא לצאת מרעש רגיל.
      </p>

      <form onSubmit={handleSearch} className="flex gap-2">
        <TickerSearchInput
          value={query}
          onChange={setQuery}
          suggestions={suggestions}
          onSelectSuggestion={handleSelectSuggestion}
          placeholder="הקלידו טיקר, למשל NVDA"
        />
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          <Search size={15} />
          בחרו
        </button>
      </form>

      {selectedTicker && (
        <div className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-800">{selectedTicker}</span>
          {matchedDetail && <> · {matchedDetail.nameHe}</>}
          {isQuoteLoading && <span className="mr-2 text-slate-400">— טוען ציטוט חי...</span>}
          {!isQuoteLoading && !hasKnownPrice && (
            <span className="mr-2 text-amber-400">— אין ציטוט חי לנייר זה, הזינו מחיר ידנית למטה</span>
          )}
          {!hasKnownVol && (
            <span className="mr-2 text-amber-400">— תנודתיות לא ידועה לנו, הונח 25% שנתי כברירת מחדל</span>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setDirection("long")}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
            direction === "long" ? "bg-brand-500 text-white" : "bg-surface-raised text-slate-500"
          }`}
        >
          קנייה (לונג)
        </button>
        <button
          type="button"
          onClick={() => setDirection("short")}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
            direction === "short" ? "bg-brand-500 text-white" : "bg-surface-raised text-slate-500"
          }`}
        >
          מכירה בחסר (שורט)
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="מחיר כניסה" value={entryPrice} onChange={handleEntryPriceChange} />
        <FormField
          label="תנודתיות יומית (%)"
          value={dailyVolPct}
          onChange={setDailyVolPct}
          step="0.01"
          placeholder="לדוגמה 2.5"
        />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-500">מרחק הסטופ (ביחידות תנודתיות יומית)</p>
        <div className="grid grid-cols-3 gap-2">
          {MULTIPLIER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setMultiplier(String(preset.value))}
              className={`rounded-lg border px-2 py-2 text-center text-xs font-semibold transition ${
                Number(multiplier) === preset.value
                  ? "border-brand-500 bg-brand-500/10 text-brand-400"
                  : "border-surface-border bg-surface-raised text-slate-500"
              }`}
            >
              {preset.labelHe} ({preset.value}x)
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          {MULTIPLIER_PRESETS.find((p) => p.value === Number(multiplier))?.noteHe}
        </p>
      </div>

      <button
        type="button"
        onClick={handleCalculate}
        disabled={isLoading || !entryPrice || !dailyVolPct || !multiplier}
        className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {isLoading ? "מחשב..." : "חשב סטופ-לוס לפי תנודתיות"}
      </button>

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && (
        <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
          <ResultRow label="מחיר סטופ-לוס מוצע" value={`$${result.stop_price.toFixed(2)}`} emphasize />
          <ResultRow label="מרחק מהכניסה" value={`$${result.stop_distance_usd.toFixed(2)}`} />
          <ResultRow label="מרחק באחוזים" value={`${result.stop_distance_pct.toFixed(2)}%`} />
        </div>
      )}
    </div>
  );
}
