"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import clsx from "clsx";
import { FormField } from "@/components/dashboard/tools/FormField";
import { mockStockDetails } from "@/lib/mock-data/stock-details";
import { isIsraeliTicker, USD_ILS_RATE } from "@/lib/mock-data/stock-prices";
import { mockIsraeliSecurities } from "@/lib/mock-data/israeli-securities";
import { BuiltPosition } from "@/lib/types";
import { TickerSearchInput } from "@/components/dashboard/tools/TickerSearchInput";
import { getAddPositionSuggestions, TickerSuggestion } from "@/lib/ticker-search";
import { useLiveQuote, LiveQuote } from "@/lib/hooks/useLiveQuote";
import { useLiveFxRate } from "@/lib/hooks/useLiveFxRate";

interface AddPositionModalProps {
  remainingCashUsd: number;
  // May be async (the real "התיק שלי" tab persists to the backend and can
  // reject on a network/API error) — the modal awaits it, shows the error
  // inline instead of closing, and only closes on success.
  onAdd: (position: BuiltPosition) => void | Promise<void>;
  onClose: () => void;
}

// A live quote's price, converted into whichever currency is currently
// selected. Finnhub's quote price already comes back in the ticker's own
// native currency (ILS for a ".TA" ticker — market_data.py converts from
// agorot — USD for everything else), so only the "other" currency needs
// the FX rate applied. `fxRate` is the live USD/ILS rate when available,
// else the fixed USD_ILS_RATE fallback (frontend/lib/mock-data/
// stock-prices.ts) — same convention as the backend's own fallback.
function convertQuotePrice(
  ticker: string,
  currency: "USD" | "ILS",
  quote: LiveQuote,
  fxRate: number
): number {
  if (isIsraeliTicker(ticker)) {
    return currency === "ILS" ? quote.price : quote.price / fxRate;
  }
  return currency === "USD" ? quote.price : quote.price * fxRate;
}

// The "+" button's stock-search window: search any ticker — by symbol or
// by its Hebrew name — the same way the main stock search does, see its
// price (typed in manually if we don't have one), and say how much of
// the portfolio's remaining cash to put into it. Israeli stocks and
// indices (ticker ending ".TA") can additionally be funded in shekels
// instead of dollars, and a quick-pick list of common Israeli
// securities is offered below the search box so the user doesn't need
// to already know the exact ticker. The amount is always converted to
// its USD-equivalent for the portfolio's math, but the position
// remembers what was actually typed so it can be shown back in ₪.
export function AddPositionModal({ remainingCashUsd, onAdd, onClose }: AddPositionModalProps) {
  const [query, setQuery] = useState("");
  const [ticker, setTicker] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "ILS">("USD");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasUserEditedPrice = useRef(false);

  const detail = ticker ? mockStockDetails[ticker] : undefined;
  const israeliDetail = ticker ? mockIsraeliSecurities.find((s) => s.ticker === ticker) : undefined;
  const displayName = detail?.nameHe ?? israeliDetail?.nameHe;
  const displaySector = detail?.sectorNameHe ?? israeliDetail?.sectorNameHe;
  const isIsraeli = ticker ? isIsraeliTicker(ticker) : false;
  const currencySymbol = currency === "ILS" ? "₪" : "$";

  const { quote, isLoading: isQuoteLoading } = useLiveQuote(ticker);
  const { rate: liveFxRate } = useLiveFxRate();
  const fxRate = liveFxRate ?? USD_ILS_RATE;
  const hasLivePrice = quote !== null;

  const remainingInCurrency = currency === "ILS" ? remainingCashUsd * fxRate : remainingCashUsd;

  // Auto-fill the price once a live quote (and, if needed, a live FX
  // rate) is available — but never overwrite a price the user already
  // typed manually, and re-run whenever the currency toggle changes too
  // (switching ₪/$ should refresh the field, not leave a stale figure in
  // the wrong unit).
  useEffect(() => {
    if (ticker && quote && !hasUserEditedPrice.current) {
      setPrice(String(convertQuotePrice(ticker, currency, quote, fxRate)));
    }
  }, [ticker, quote, currency, fxRate]);

  function handlePriceChange(value: string) {
    hasUserEditedPrice.current = true;
    setPrice(value);
  }

  function applyTicker(resolvedTicker: string) {
    const match = mockStockDetails[resolvedTicker];
    const israeli = mockIsraeliSecurities.find((s) => s.ticker === resolvedTicker);
    setTicker(resolvedTicker);
    // Purely a display-name lookup now (has this ticker got a Hebrew
    // name/sector in our local data?) — no longer decides whether a
    // price is available, since a live quote can come back for a ticker
    // we don't otherwise recognize by name.
    setNotFound(match || israeli ? null : resolvedTicker);
    setQuery(resolvedTicker);
    // Israeli securities default to shekels; everything else stays in
    // dollars (and has no currency choice at all).
    const nextCurrency: "USD" | "ILS" = isIsraeliTicker(resolvedTicker) ? "ILS" : "USD";
    setCurrency(nextCurrency);
    hasUserEditedPrice.current = false;
    // Price is filled in by the useLiveQuote effect above once the quote
    // for `resolvedTicker` arrives; clear it here so a stale price from a
    // previous ticker isn't shown in the meantime.
    setPrice("");
    setAmount("");
    setError(null);
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    const upper = q.toUpperCase();

    const byTicker =
      mockStockDetails[upper]?.ticker ??
      Object.values(mockStockDetails).find((d) => d.ticker.toUpperCase() === upper)?.ticker;
    const israeliMatch =
      mockIsraeliSecurities.find((s) => s.ticker.toUpperCase() === upper) ??
      mockIsraeliSecurities.find((s) => s.nameHe.includes(q));

    applyTicker(byTicker ?? israeliMatch?.ticker ?? upper);
  }

  function handleSelectSuggestion(suggestion: TickerSuggestion) {
    applyTicker(suggestion.ticker);
  }

  const suggestions = getAddPositionSuggestions(query);

  function handleSetCurrency(next: "USD" | "ILS") {
    setCurrency(next);
    // The useLiveQuote effect above re-converts the price for the new
    // currency automatically (it's keyed on `currency`) as long as the
    // user hasn't typed a price manually; a manual price is left as-is
    // rather than silently reconverted into a different currency's units.
  }

  async function handleAdd() {
    setError(null);
    const priceNum = Number(price);
    const amountNum = Number(amount);

    if (!ticker) return;
    if (!priceNum || priceNum <= 0) {
      setError("צריך מחיר תקין למניה");
      return;
    }
    if (!amountNum || amountNum <= 0) {
      setError("צריך סכום השקעה תקין");
      return;
    }
    const amountUsd = currency === "ILS" ? amountNum / fxRate : amountNum;
    if (amountUsd > remainingCashUsd + 0.01) {
      setError(
        `הסכום עולה על המזומן הפנוי בתיק (${currencySymbol}${remainingInCurrency.toFixed(0)})`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await onAdd({
        ticker,
        nameHe: displayName ?? ticker,
        sectorNameHe: displaySector ?? "לא מסווג",
        price: priceNum,
        amountUsd,
        currency,
        amountOriginal: amountNum,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "הוספת המניה נכשלה, נסו שוב");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-surface-border bg-surface-card p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-bold text-slate-900">הוספת מניה לתיק</h4>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 hover:bg-surface-raised hover:text-slate-700"
            aria-label="סגור"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSearch} className="mt-3 flex gap-2">
          <TickerSearchInput
            value={query}
            onChange={setQuery}
            suggestions={suggestions}
            onSelectSuggestion={handleSelectSuggestion}
            placeholder="טיקר או שם, למשל AAPL או טבע"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            <Search size={15} />
            חיפוש
          </button>
        </form>

        {!ticker && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-slate-500">מניות ומדדים ישראליים נפוצים</p>
            <div className="flex flex-wrap gap-1.5">
              {mockIsraeliSecurities.map((s) => (
                <button
                  key={s.ticker}
                  type="button"
                  onClick={() => applyTicker(s.ticker)}
                  className="rounded-full border border-surface-border bg-surface-raised px-2.5 py-1 text-xs text-slate-700 hover:border-brand-500/40 hover:text-brand-400"
                >
                  {s.nameHe}
                  {s.kind === "index" ? " (מדד)" : ""}
                </button>
              ))}
            </div>
          </div>
        )}

        {ticker && (
          <div className="mt-3 rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-800">{ticker}</span>
            {displayName && <> · {displayName}</>}
            {displaySector && <> · {displaySector}</>}
            {isQuoteLoading && <span className="mr-2 text-slate-400">— טוען ציטוט חי...</span>}
            {!isQuoteLoading && !hasLivePrice && (
              <span className="mr-2 text-amber-400">— אין ציטוט חי לנייר זה, הזינו מחיר ידנית</span>
            )}
            {notFound && (
              <span className="mr-2 text-amber-400">— השם/הסקטור אינם מוכרים לנו</span>
            )}
            {isIsraeli && <span className="mr-2 text-brand-400">— נייר ערך ישראלי</span>}
          </div>
        )}

        {ticker && isIsraeli && (
          <div className="mt-3">
            <p className="mb-1 text-xs text-slate-500">מטבע ההשקעה</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleSetCurrency("ILS")}
                className={clsx(
                  "flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold",
                  currency === "ILS"
                    ? "border-brand-500 bg-brand-500/10 text-brand-400"
                    : "border-surface-border bg-surface-raised text-slate-500 hover:border-brand-500/40"
                )}
              >
                ₪ שקלים
              </button>
              <button
                type="button"
                onClick={() => handleSetCurrency("USD")}
                className={clsx(
                  "flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold",
                  currency === "USD"
                    ? "border-brand-500 bg-brand-500/10 text-brand-400"
                    : "border-surface-border bg-surface-raised text-slate-500 hover:border-brand-500/40"
                )}
              >
                $ דולרים
              </button>
            </div>
          </div>
        )}

        {ticker && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <FormField label={`מחיר למניה (${currencySymbol})`} value={price} onChange={handlePriceChange} />
              <FormField
                label={`סכום להשקעה (${currencySymbol})`}
                value={amount}
                onChange={setAmount}
                placeholder={`עד ${currencySymbol}${remainingInCurrency.toFixed(0)}`}
              />
            </div>
            {isIsraeli && (
              <p className="mt-1.5 text-xs text-slate-500">
                הסכום מומר לשווי דולרי לצורך חישוב אחוזי התיק (שער: ₪{fxRate.toFixed(2)} לדולר
                {liveFxRate === null && " — שער קבוע, אין שער חי כרגע"}).
              </p>
            )}

            {error && <p className="mt-2 text-sm text-negative">{error}</p>}

            <button
              type="button"
              onClick={handleAdd}
              disabled={isSubmitting}
              className="mt-4 w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "מוסיפים..." : "הוסיפו לתיק"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
