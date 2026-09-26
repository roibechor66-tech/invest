"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Search, Sparkles, PenLine } from "lucide-react";
import { mockStockDetails } from "@/lib/mock-data/stock-details";
import { getValuationModel, getModelFitNotes, ValuationModelId } from "@/lib/mock-data/valuation-models";
import { TickerSearchInput } from "@/components/dashboard/tools/TickerSearchInput";
import { getStockDetailSuggestions, TickerSuggestion } from "@/lib/ticker-search";
import { useLiveCompanyFundamentals } from "@/lib/hooks/useLiveCompanyFundamentals";

interface CompanyAndModeStepProps {
  modelId: ValuationModelId;
  onBack: () => void;
  onProceed: (ticker: string | null, mode: "auto" | "manual") => void;
}

// Step 2: search for and select the company this valuation is for (or
// skip straight to a fully manual build with no company data behind
// it), then choose whether Claude runs the model with assumptions it
// derives from the company's data, or the user builds it themselves.
export function CompanyAndModeStep({ modelId, onBack, onProceed }: CompanyAndModeStepProps) {
  const [query, setQuery] = useState("");
  const [ticker, setTicker] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);

  const model = getValuationModel(modelId);
  const detail = ticker ? mockStockDetails[ticker] : undefined;
  // Phase 3, third track: financials/segments/growth now come live from
  // FMP (see useLiveCompanyFundamentals's module docstring) instead of
  // the old mock generator; "auto" mode is only offered once a live
  // financial profile has actually loaded for this ticker.
  const live = useLiveCompanyFundamentals(ticker);
  const growthPct =
    live.estimates[0]?.revenueGrowthPct ?? detail?.growthOutlook.forwardEstimates[0]?.analystRevenueGrowthPct ?? 10;
  const isBank =
    (detail?.sectorNameHe ?? "").includes("בנקא") || /bank|financ/i.test(live.multiples?.sector ?? "");
  const hasMultipleSegments = (live.financials?.segments?.length ?? 0) > 1;
  const fitNote = ticker ? getModelFitNotes(growthPct, isBank, hasMultipleSegments)[modelId] : undefined;
  const canAutoRun = !live.isLoading && Boolean(live.financials);

  function runSearch(rawQuery: string) {
    const q = rawQuery.trim().toUpperCase();
    if (!q) return;
    const match =
      mockStockDetails[q] ??
      Object.values(mockStockDetails).find((d) => d.ticker.toUpperCase() === q);
    if (match) {
      setNotFound(null);
      setTicker(match.ticker);
      setQuery(match.ticker);
    } else {
      setNotFound(q);
      setTicker(null);
    }
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    runSearch(query);
  }

  function handleSelectSuggestion(suggestion: TickerSuggestion) {
    runSearch(suggestion.ticker);
  }

  const suggestions = getStockDetailSuggestions(query);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowRight size={14} /> חזרה לבחירת מודל
      </button>

      {model && (
        <div className="rounded-lg border border-surface-border bg-surface-raised/60 p-3">
          <p className="text-sm font-bold text-slate-900">{model.nameHe}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{model.whatItIsHe}</p>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-800">חיפוש חברה</p>
        <form onSubmit={handleSearch} className="flex gap-2">
          <TickerSearchInput
            value={query}
            onChange={setQuery}
            suggestions={suggestions}
            onSelectSuggestion={handleSelectSuggestion}
            placeholder="לדוגמה: AAPL, MSFT, TEVA.TA..."
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            <Search size={15} /> חיפוש
          </button>
        </form>
        {notFound && (
          <p className="mt-2 text-xs text-negative">
            הטיקר &quot;{notFound}&quot; לא נמצא. במסד הדמו הנוכחי זמינים: NVDA, MSFT, TSM,
            VRT, TEVA.TA, POLI.TA, AAPL, GOOGL, AMZN, TSLA.
          </p>
        )}
      </div>

      {detail && (
        <div className="rounded-lg border border-surface-border bg-surface-raised p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">
              {detail.ticker} <span className="font-normal text-slate-500">· {detail.nameHe}</span>
            </span>
            <span className="text-xs text-slate-500">{detail.sectorNameHe}</span>
          </div>
          {fitNote && (
            <p
              className={
                "mt-2 text-xs leading-relaxed " +
                (fitNote.recommended ? "text-brand-400" : "text-amber-500")
              }
            >
              {fitNote.recommended ? "✓ מודל מומלץ עבור חברה זו — " : "שימו לב: "}
              {fitNote.reasonHe}
            </p>
          )}
        </div>
      )}

      {(detail || ticker === null) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={!ticker || !canAutoRun}
            onClick={() => ticker && onProceed(ticker, "auto")}
            className="flex flex-col items-start gap-1.5 rounded-xl border border-brand-500/40 bg-brand-500/10 p-4 text-start disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="flex items-center gap-1.5 text-sm font-bold text-brand-400">
              <Sparkles size={15} /> בצע הערכת שווי אוטומטית
            </span>
            <span className="text-xs leading-relaxed text-slate-500">
              {!ticker
                ? "דורש בחירת חברה ממאגר הדמו קודם."
                : live.isLoading
                  ? "טוען נתונים פיננסיים חיים (FMP)..."
                  : canAutoRun
                    ? "ההנחות ייגזרו מנתונים פיננסיים חיים (FMP) עבור החברה, עם הסבר קצר לכל הנחה — ותוכלו לערוך כל שדה אחר כך."
                    : `אין כרגע נתונים פיננסיים חיים לחברה זו${live.multiplesError ? ` (${live.multiplesError})` : ""} — אפשר לבנות באופן ידני.`}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onProceed(ticker, "manual")}
            className="flex flex-col items-start gap-1.5 rounded-xl border border-surface-border bg-surface-raised p-4 text-start hover:border-brand-500/40"
          >
            <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <PenLine size={15} /> בניית הערכת שווי בעצמי
            </span>
            <span className="text-xs leading-relaxed text-slate-500">
              כל ההנחות מתחילות ריקות/כברירת מחדל כללית, ואתם קובעים את כל הערכים בעצמכם.
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
