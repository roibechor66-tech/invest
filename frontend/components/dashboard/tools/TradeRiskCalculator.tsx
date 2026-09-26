"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { FormField } from "@/components/dashboard/tools/FormField";
import { ResultRow } from "@/components/dashboard/tools/ResultRow";
import { usePortfolio } from "@/lib/portfolio-context";
import { mockStockDetails } from "@/lib/mock-data/stock-details";
import { useLiveQuote } from "@/lib/hooks/useLiveQuote";
import { TickerSearchInput } from "@/components/dashboard/tools/TickerSearchInput";
import { getStockDetailSuggestions, TickerSuggestion } from "@/lib/ticker-search";

interface PositionRiskResult {
  risk_amount: number;
  risk_pct_of_account: number;
  position_value: number;
  account_exposure_pct: number;
}

// Trade-risk calculator: search for ANY ticker — the same free-text
// search as the main stock-search bar, not just a picker limited to
// current holdings — set the account/portfolio size, quantity and your
// stop-loss price, and see exactly how much is at risk in $ and as a %
// of the account. A ticker with a live quote (Finnhub, via useLiveQuote)
// auto-fills its current price (and, if held, your quantity); if no live
// quote is available (no API key / unrecognized ticker / upstream
// failure) you simply type the price yourself, same as before this was
// wired up.
export function TradeRiskCalculator() {
  const { summary, totalUsd } = usePortfolio();
  const holdings = summary.holdings;

  const [query, setQuery] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [entryPrice, setEntryPrice] = useState("");
  const [accountSize, setAccountSize] = useState("");
  const [quantity, setQuantity] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [result, setResult] = useState<PositionRiskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const hasUserPickedTicker = useRef(false);
  const hasUserEditedAccountSize = useRef(false);
  const hasUserEditedEntryPrice = useRef(false);

  // The real portfolio loads asynchronously — prefill the first holding
  // and account size once it arrives, but only if the user hasn't already
  // searched for a ticker or typed their own account size.
  useEffect(() => {
    if (!hasUserPickedTicker.current && holdings.length > 0) {
      const first = holdings[0];
      setQuery(first.ticker);
      setSelectedTicker(first.ticker);
      setEntryPrice(String(first.lastPrice));
      setQuantity(String(first.quantity));
    }
  }, [holdings]);

  useEffect(() => {
    if (!hasUserEditedAccountSize.current && totalUsd > 0) {
      setAccountSize(String(Math.round(totalUsd)));
    }
  }, [totalUsd]);

  function handleAccountSizeChange(value: string) {
    hasUserEditedAccountSize.current = true;
    setAccountSize(value);
  }

  const matchedDetail = selectedTicker ? mockStockDetails[selectedTicker] : undefined;
  const { quote, isLoading: isQuoteLoading } = useLiveQuote(selectedTicker);
  const hasKnownPrice = quote !== null;

  // Auto-fill the entry price once a live quote arrives for the selected
  // ticker — but only if the user hasn't typed their own price for this
  // ticker already (mirrors the hasUserEditedAccountSize guard above).
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
    hasUserPickedTicker.current = true;
    hasUserEditedEntryPrice.current = false;

    const detail =
      mockStockDetails[ticker] ??
      Object.values(mockStockDetails).find((d) => d.ticker.toUpperCase() === ticker);
    const resolvedTicker = detail?.ticker ?? ticker;

    setSelectedTicker(resolvedTicker);
    setQuery(resolvedTicker);

    const holding = holdings.find((h) => h.ticker === resolvedTicker);
    setQuantity(holding ? String(holding.quantity) : "");

    // Entry price is filled in by the useLiveQuote effect above once the
    // quote for `resolvedTicker` arrives; clear it here so a stale price
    // from a previous ticker isn't shown in the meantime.
    setEntryPrice("");
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
      const data = await apiFetch<PositionRiskResult>("/api/risk/position-risk", {
        method: "POST",
        body: JSON.stringify({
          account_size: Number(accountSize),
          quantity: Number(quantity),
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
        חפשו כל מניה שתרצו, קבעו גודל תיק, כמות ומחיר סטופ-לוס — נחשב
        לכם בדיוק כמה כסף ואיזה אחוז מהתיק בסיכון אם הסטופ יתפוס.
      </p>

      <form onSubmit={handleSearch} className="flex gap-2">
        <TickerSearchInput
          value={query}
          onChange={setQuery}
          suggestions={suggestions}
          onSelectSuggestion={handleSelectSuggestion}
          placeholder="הקלידו טיקר, למשל AAPL"
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
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <FormField label="מחיר כניסה" value={entryPrice} onChange={handleEntryPriceChange} />
        <FormField label="גודל תיק ($)" value={accountSize} onChange={handleAccountSizeChange} />
        <FormField
          label="כמות מניות"
          value={quantity}
          onChange={setQuantity}
          placeholder="כמות מתוכננת/מוחזקת"
        />
        <FormField label="מחיר סטופ-לוס" value={stopPrice} onChange={setStopPrice} />
      </div>

      <button
        type="button"
        onClick={handleCalculate}
        disabled={isLoading || !stopPrice || !quantity || !entryPrice || !selectedTicker}
        className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {isLoading ? "מחשב..." : "חשב סיכון לעסקה"}
      </button>

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && (
        <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
          <ResultRow
            label="סיכון בדולר"
            value={`$${result.risk_amount.toFixed(0)}`}
            emphasize
          />
          <ResultRow
            label="סיכון באחוזים מהתיק"
            value={`${result.risk_pct_of_account.toFixed(2)}%`}
            emphasize
          />
          <ResultRow label="שווי הפוזיציה" value={`$${result.position_value.toFixed(0)}`} />
          <ResultRow
            label="חשיפה מהתיק"
            value={`${result.account_exposure_pct.toFixed(1)}%`}
          />
        </div>
      )}
    </div>
  );
}
